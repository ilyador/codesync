import 'dotenv/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { runFlowJob, cancelJob, cancelAllJobs, cleanupOrphanedJobs } from './runner.js';
import type { PhaseRunRecord, RunnerReviewResult, RunnerTask } from './runner.js';
import type { FlowConfig } from './flow-config.js';
import { supabase } from './supabase.js';
import { createCheckpoint, revertToCheckpoint, deleteCheckpoint } from './checkpoint.js';
import { queueNextWorkstreamTask } from './auto-continue.js';
import { ensureWorktree } from './worktree.js';
import { autoCommit, slugify } from './git-utils.js';
import { search as ragSearch } from './rag/service.js';
import {
  isAiRunnableTask,
  lockTaskExecutionSettings,
} from './task-execution.js';

const execFileAsync = promisify(execFile);

type ClaimedJob = Record<string, unknown> & {
  id: string;
  task_id: string;
  project_id: string;
  local_path: string | null;
  answer?: string | null;
  requested_generation?: number | null;
  flow_snapshot?: FlowConfig | null;
  phases_completed?: unknown;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// DB logging with batching for high-throughput log events
// ---------------------------------------------------------------------------

const logBuffer: Array<{ job_id: string; event: string; data: Record<string, unknown> }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const FLUSH_INTERVAL = 100; // ms
const FLUSH_SIZE = 20;

async function flushLogs(): Promise<void> {
  if (flushing || logBuffer.length === 0) return;
  flushing = true;
  try {
    const batch = logBuffer.slice();
    const { error } = await supabase.from('job_logs').insert(batch);
    if (error) {
      console.error('[worker] Batch log write error:', error.message);
      // Keep entries in buffer for next flush attempt
      return;
    }
    // Only remove on success
    logBuffer.splice(0, batch.length);
  } finally {
    flushing = false;
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushLogs();
  }, FLUSH_INTERVAL);
}

async function writeLog(jobId: string, event: string, data: Record<string, unknown> = {}): Promise<void> {
  // Critical events (done, failed, review, paused) flush immediately
  if (event === 'done' || event === 'failed' || event === 'review' || event === 'paused') {
    // Flush any buffered logs first to maintain ordering
    await flushLogs();
    await supabase.from('job_logs').insert({ job_id: jobId, event, data });
    return;
  }
  // Non-critical events (log, phase_start, phase_complete) are batched
  logBuffer.push({ job_id: jobId, event, data });
  // Cap buffer to prevent OOM if Supabase is unreachable
  const MAX_BUFFER = 1000;
  while (logBuffer.length > MAX_BUFFER) logBuffer.shift();
  if (logBuffer.length >= FLUSH_SIZE) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    await flushLogs();
  } else {
    scheduleFlush();
  }
}

// ---------------------------------------------------------------------------
// Callbacks that the runner uses — fire-and-forget so we never block the runner
// ---------------------------------------------------------------------------

function makeDbCallbacks(jobId: string, task?: RunnerTask) {
  return {
    onLog: (text: string) => {
      writeLog(jobId, 'log', { text }).then().catch((err) => {
        console.error(`[worker] writeLog error (log): ${err.message}`);
      });
    },
    onPhaseStart: (phase: string, attempt: number) => {
      writeLog(jobId, 'phase_start', { phase, attempt }).then().catch((err) => {
        console.error(`[worker] writeLog error (phase_start): ${err.message}`);
      });
    },
    onPhaseComplete: (phase: string, output: PhaseRunRecord) => {
      writeLog(jobId, 'phase_complete', { phase, output }).then().catch((err) => {
        console.error(`[worker] writeLog error (phase_complete): ${err.message}`);
      });
    },
    onPause: (question: string) => {
      writeLog(jobId, 'paused', { question }).then().catch((err) => {
        console.error(`[worker] writeLog error (paused): ${err.message}`);
      });
    },
    onDone: () => {
      writeLog(jobId, 'done', {}).then().catch((err) => {
        console.error(`[worker] writeLog error (done): ${err.message}`);
      });
    },
    onFail: (error: string) => {
      writeLog(jobId, 'failed', { error }).then().catch((err) => {
        console.error(`[worker] writeLog error (failed): ${err.message}`);
      });
      if (task) notifyTaskFailure(task, error).catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// Failure notification helper
// ---------------------------------------------------------------------------

async function notifyTaskFailure(task: RunnerTask, errorMsg: string): Promise<void> {
  const userId = task.assignee || task.created_by;
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'task_failed',
      task_id: task.id,
      message: `Task failed: ${task.title} -- ${errorMsg.substring(0, 200)}`,
    });
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Start a queued job
// ---------------------------------------------------------------------------

function claimedJob(value: unknown): ClaimedJob | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && typeof record.task_id === 'string'
    && typeof record.project_id === 'string'
    && (record.local_path === null || typeof record.local_path === 'string')
    ? record as ClaimedJob
    : null;
}

async function claimNextQueuedJob(): Promise<ClaimedJob | null> {
  const { data, error } = await supabase.rpc('claim_next_queued_job');
  if (error) throw new Error(`Failed to claim queued job: ${error.message}`);
  return claimedJob(Array.isArray(data) ? data[0] : data);
}

async function startJob(job: ClaimedJob): Promise<void> {
  const jobId: string = job.id;
  let localPath = job.local_path;

  if (!localPath) {
    const failMsg = 'Job failed: local_path is missing.';
    await writeLog(jobId, 'failed', { error: failMsg });
    await supabase.from('jobs').update({ status: 'failed', completed_at: new Date().toISOString(), question: failMsg }).eq('id', jobId);
    await supabase.from('tasks').update({ status: 'paused' }).eq('id', job.task_id);
    return;
  }

  // Expand ~ to home directory (Node doesn't do this automatically)
  if (localPath.startsWith('~/')) {
    localPath = localPath.replace('~', process.env.HOME || homedir());
  }

  // Fetch the task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', job.task_id)
    .single();

  if (taskErr || !task) {
    await writeLog(jobId, 'failed', { error: 'Task not found' });
    await supabase.from('jobs').update({ status: 'failed', completed_at: new Date().toISOString(), question: 'Job failed: task not found' }).eq('id', jobId);
    return;
  }
  const phasesAlreadyCompleted = (Array.isArray(job.phases_completed) ? job.phases_completed : []) as PhaseRunRecord[];
  const isResume = phasesAlreadyCompleted.length > 0;

  if (!isResume && !isAiRunnableTask(task)) {
    const discardMsg = 'Queued job was discarded because the task is no longer configured for AI execution.';
    await writeLog(jobId, 'failed', { error: discardMsg });
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: discardMsg,
    }).eq('id', jobId);
    return;
  }
  // Resolve worktree path if task belongs to a workstream
  if (task.workstream_id) {
    try {
      const { data: ws } = await supabase
        .from('workstreams')
        .select('name')
        .eq('id', task.workstream_id)
        .single();
      if (ws) {
        const slug = slugify(ws.name);
        localPath = ensureWorktree(localPath, slug);
        await supabase.from('jobs').update({ local_path: localPath }).eq('id', jobId);
        await writeLog(jobId, 'log', { text: `[worktree] Using worktree at ${localPath}` });
      }
    } catch (err: unknown) {
      console.error('[worker] Worktree setup failed, using project root:', errorMessage(err));
      await writeLog(jobId, 'log', { text: `[worktree] Setup failed, using project root: ${errorMessage(err)}` });
    }
  }

  const requestedGeneration = typeof job.requested_generation === 'number' && Number.isInteger(job.requested_generation)
    ? job.requested_generation
    : null;
  if (requestedGeneration == null) {
    const failMsg = 'Job failed: requested_generation is missing. Requeue the task to regenerate its execution plan.';
    await writeLog(jobId, 'failed', { error: failMsg });
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: failMsg,
    }).eq('id', jobId);
    return;
  }

  const lockedTask = await lockTaskExecutionSettings(job.task_id, jobId, requestedGeneration);
  if (!lockedTask) {
    const discardMsg = 'Queued job was discarded because its execution settings are stale. Requeue the task to run the latest plan.';
    await writeLog(jobId, 'failed', { error: discardMsg });
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: discardMsg,
    }).eq('id', jobId);
    return;
  }
  const runnerTask = lockedTask as RunnerTask;
  const flowSnapshot = job.flow_snapshot || null;
  if (!flowSnapshot || !Array.isArray(flowSnapshot.steps) || flowSnapshot.steps.length === 0) {
    const failMsg = 'Job failed: execution snapshot is missing. Requeue the task to regenerate its flow plan.';
    await writeLog(jobId, 'failed', { error: failMsg });
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: failMsg,
    }).eq('id', jobId);
    await supabase.from('tasks').update({ status: 'paused' }).eq('id', runnerTask.id);
    return;
  }

  // Create checkpoint for fresh starts only
  if (!isResume) {
    try {
      const checkpoint = createCheckpoint(localPath, jobId);
      await supabase.from('jobs').update({
        checkpoint_ref: checkpoint.commitSha,
        checkpoint_status: 'active',
      }).eq('id', jobId);
      await writeLog(jobId, 'log', { text: '[checkpoint] Saved working directory state' });
    } catch (err: unknown) {
      if (runnerTask.auto_continue) {
        // Fatal for auto-continue: no checkpoint = no safety net
        const failMsg = `Checkpoint failed: ${errorMessage(err)}. Cannot run auto-continue without a safety net.`;
        await writeLog(jobId, 'failed', { error: failMsg });
        await supabase.from('jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          question: failMsg,
        }).eq('id', jobId);
        await supabase.from('tasks').update({ status: 'paused' }).eq('id', runnerTask.id);
        return;
      }
      await writeLog(jobId, 'log', { text: `[checkpoint] Warning: ${errorMessage(err)}. Manual revert will not be available.` });
    }
  }

  // Build onReview callback
  const onReview = runnerTask.auto_continue === true
    ? async (result: RunnerReviewResult) => {
        await writeLog(jobId, 'review', result);
        // Auto-approve: commit first, then mark done, then clean up the checkpoint.
        let commitSucceeded = false;
        try {
          await autoCommit(localPath, runnerTask.type || 'feature', runnerTask.title);
          commitSucceeded = true;
        } catch (err: unknown) {
          console.error('[worker] Auto-commit failed:', errorMessage(err));
          await writeLog(jobId, 'log', { text: `[auto-approve] Commit failed: ${errorMessage(err)}. Job left in review for manual handling.` });
          return;
        }
        const now = new Date().toISOString();
        const { data: doneRows, error: doneError } = await supabase
          .from('jobs')
          .update({ status: 'done', completed_at: now, checkpoint_status: 'cleaned' })
          .eq('id', jobId)
          .eq('status', 'review')
          .select('id');
        if (doneError) {
          console.error(`[worker] Auto-approve failed for job ${jobId}:`, doneError.message);
          return;
        }
        if (!doneRows || doneRows.length === 0) {
          await writeLog(jobId, 'log', { text: '[auto-approve] Skipped because job is no longer in review' });
          return;
        }
        const { error: taskDoneError } = await supabase.from('tasks').update({ status: 'done', completed_at: now }).eq('id', runnerTask.id);
        if (taskDoneError) {
          console.error(`[worker] Auto-approve task update failed for job ${jobId}:`, taskDoneError.message);
          return;
        }
        await writeLog(jobId, 'done', {});
        try {
          deleteCheckpoint(localPath, jobId);
          const { error: checkpointStatusError } = await supabase
            .from('jobs')
            .update({ checkpoint_status: 'cleaned' })
            .eq('id', jobId);
          if (checkpointStatusError) {
            console.warn(`[worker] Failed to mark checkpoint cleaned for job ${jobId}:`, checkpointStatusError.message);
          }
        } catch (e: unknown) {
          console.warn(`[worker] Checkpoint delete failed for job ${jobId}:`, errorMessage(e));
        }
        // Queue next task in workstream only if commit succeeded
        if (commitSucceeded && runnerTask.workstream_id) {
          try {
            await queueNextWorkstreamTask({
              completedTaskId: runnerTask.id,
              projectId: job.project_id,
              localPath,
              workstreamId: runnerTask.workstream_id,
              completedPosition: runnerTask.position,
            });
          } catch (err: unknown) {
            console.error('[worker] auto-continue error:', errorMessage(err));
            await writeLog(jobId, 'log', { text: `[auto-continue] Failed to queue next task: ${errorMessage(err)}` });
            notifyTaskFailure(runnerTask, `Auto-continue failed: ${errorMessage(err)}`).catch(() => {});
          }
        }
      }
    : async (result: RunnerReviewResult) => {
        await writeLog(jobId, 'review', result);
      };

  const callbacks = makeDbCallbacks(jobId, runnerTask);

  try {
    const taskWithAnswer: RunnerTask = isResume ? { ...runnerTask, answer: job.answer } : runnerTask;

    // Search project documents only when the materialized flow snapshot asks for RAG context.
    const needsRag = flowSnapshot.steps.some(step => step.context_sources.includes('rag'));
    if (needsRag) {
      try {
        const ragResults = await ragSearch(job.project_id, runnerTask.description || runnerTask.title);
        taskWithAnswer._ragResults = ragResults;
        await writeLog(jobId, 'log', { text: `[rag] Found ${ragResults.length} relevant document chunks` });
      } catch (err: unknown) {
        await writeLog(jobId, 'log', { text: `[rag] Search failed: ${errorMessage(err)}` });
      }
    }

    const sharedCtx = {
      jobId,
      taskId: runnerTask.id,
      projectId: job.project_id,
      localPath,
      phasesAlreadyCompleted,
      ...callbacks,
      onDone: () => {},
      onReview,
    };

    await runFlowJob({
      ...sharedCtx,
      task: taskWithAnswer,
      flow: flowSnapshot,
    });
  } catch (err: unknown) {
    // This catch only fires if the flow runner itself throws an unhandled error.
    // Step failures are handled inside runFlowJob().
    console.error(`[worker] Unexpected runner crash for job ${jobId}:`, errorMessage(err));
    await writeLog(jobId, 'failed', { error: `Runner crashed: ${errorMessage(err)}` });
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: `Unexpected error: ${errorMessage(err)}`,
    }).eq('id', jobId);
    await supabase.from('tasks').update({ status: 'paused' }).eq('id', runnerTask.id);
    await notifyTaskFailure(runnerTask, errorMessage(err));
  }
}

// ---------------------------------------------------------------------------
// Poll loop: pick up queued jobs
// ---------------------------------------------------------------------------

let busyJobId: string | null = null;

const pollInterval = setInterval(async () => {
  try {
    if (busyJobId) return;

    const job = await claimNextQueuedJob();
    if (!job) return;

    busyJobId = job.id;
    console.log(`[worker] Picked up job ${job.id} for task ${job.task_id}`);

    startJob(job)
      .catch((err) => console.error(`[worker] startJob error: ${err.message}`))
      .finally(() => { busyJobId = null; });
  } catch (err: unknown) {
    console.error('[worker] Poll error:', errorMessage(err));
  }
}, 1000);

// ---------------------------------------------------------------------------
// Cancellation loop: handle jobs marked as canceling
// ---------------------------------------------------------------------------

const cancelInterval = setInterval(async () => {
  try {
    const { data: cancelingJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'canceling');

    if (!cancelingJobs || cancelingJobs.length === 0) return;

    for (const job of cancelingJobs) {
      try {
        console.log(`[worker] Canceling job ${job.id}`);
        await cancelJob(job.id);

        if (job.local_path) {
          try {
            revertToCheckpoint(job.local_path, job.id);
          } catch (e: unknown) {
            console.warn(`[worker] Checkpoint revert failed for canceled job ${job.id}:`, errorMessage(e));
          }
        }

        await supabase.from('jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          question: 'Job failed: canceled by user.',
        }).eq('id', job.id);
        await supabase.from('tasks').update({ status: 'canceled' }).eq('id', job.task_id);
        await writeLog(job.id, 'failed', { error: 'Job canceled by user' });
      } catch (err: unknown) {
        console.error(`[worker] Cancel error for job ${job.id}:`, errorMessage(err));
      }
    }
  } catch (err: unknown) {
    console.error('[worker] Cancellation poll error:', errorMessage(err));
  }
}, 1000);

// ---------------------------------------------------------------------------
// Orphan cleanup on startup
// ---------------------------------------------------------------------------

// Clean up orphaned running jobs + stuck canceling jobs
(async () => {
  try {
    const count = await cleanupOrphanedJobs();
    if (count > 0) console.log(`[worker] Cleaned up ${count} orphaned jobs`);

    // Also clean up any jobs stuck in 'canceling' state
    const { data: stuck } = await supabase
      .from('jobs')
      .select('id, task_id')
      .eq('status', 'canceling');
    if (stuck && stuck.length > 0) {
      for (const job of stuck) {
        const msg = 'Job failed: canceled (cleaned up on worker restart).';
        await supabase.from('jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          question: msg,
        }).eq('id', job.id);
        await supabase.from('tasks').update({ status: 'canceled' }).eq('id', job.task_id);
        await supabase.from('job_logs').insert({ job_id: job.id, event: 'failed', data: { error: msg } });
      }
      console.log(`[worker] Cleaned up ${stuck.length} stuck canceling job(s)`);
    }
  } catch (err: unknown) {
    console.error('[worker] Cleanup failed:', errorMessage(err));
  }
})();

// ---------------------------------------------------------------------------
// PR merge polling: check GitHub for merged PRs every 60 seconds
// ---------------------------------------------------------------------------

const prMergeInterval = setInterval(async () => {
  try {
    const { data: workstreams } = await supabase
      .from('workstreams')
      .select('id, name, project_id, pr_url')
      .eq('status', 'complete')
      .not('pr_url', 'is', null);

    if (!workstreams || workstreams.length === 0) return;

    for (const ws of workstreams) {
      try {
        // Parse PR URL: https://github.com/owner/repo/pull/123
        const match = ws.pr_url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
        if (!match) continue;
        const [, repo, prNumber] = match;

        const { stdout } = await execFileAsync('gh', [
          'pr', 'view', prNumber, '--repo', repo, '--json', 'state',
        ], { encoding: 'utf-8', timeout: 10000, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } });

        const pr = JSON.parse(stdout.trim());
        if (pr.state === 'MERGED') {
          await supabase.from('workstreams').update({ status: 'merged' }).eq('id', ws.id);
          // Clean up worktree
          try {
            const { data: project } = await supabase
              .from('projects')
              .select('id')
              .eq('id', ws.project_id)
              .single();
            if (project) {
              const { data: member } = await supabase
                .from('project_members')
                .select('local_path')
                .eq('project_id', project.id)
                .not('local_path', 'is', null)
                .limit(1)
                .single();
              if (member?.local_path) {
                const { cleanupWorktree } = await import('./worktree.js');
                cleanupWorktree(member.local_path, slugify(ws.name));
                console.log(`[worker] Cleaned up worktree for workstream ${ws.name}`);
              }
            }
          } catch (err: unknown) {
            console.log(`[worker] Worktree cleanup failed for ${ws.id}: ${errorMessage(err)}`);
          }
          console.log(`[worker] PR merged for workstream ${ws.id}`);
        } else if (pr.state === 'CLOSED') {
          // PR was closed without merging -- reset to complete so user can re-create
          await supabase.from('workstreams').update({ status: 'complete' }).eq('id', ws.id);
        }
      } catch {
        // gh CLI error for this PR -- skip silently
      }
    }
  } catch (err: unknown) {
    console.error('[worker] PR poll error:', errorMessage(err));
  }
}, 60000);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown() {
  console.log('[worker] Shutting down...');
  clearInterval(pollInterval);
  clearInterval(cancelInterval);
  clearInterval(prMergeInterval);
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  cancelAllJobs();
  await flushLogs();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

console.log('[worker] WorkStream worker started, polling for jobs...');
