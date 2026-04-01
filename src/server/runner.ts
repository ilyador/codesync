import { spawn, ChildProcess } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

interface PhaseConfig {
  skill: string | null;
  tools: string[];
  prompt: string;
  model: string;
}

interface TaskTypeConfig {
  phases: string[];
  on_verify_fail: string;
  verify_retries: number;
  final: string;
  on_review_fail: string;
  review_retries: number;
  on_max_retries: string;
  phase_config: Record<string, PhaseConfig>;
}

interface JobContext {
  jobId: string;
  taskId: string;
  projectId: string;
  localPath: string;
  task: any;
  taskType: TaskTypeConfig;
  onLog: (text: string) => void;
  onPhaseStart: (phase: string, attempt: number) => void;
  onPhaseComplete: (phase: string, output: any) => void;
  onPause: (question: string) => void;
  onReview: (result: any) => void;
  onDone: () => void;
  onFail: (error: string) => void;
}

// Default task type configs (used when .codesync/config.json doesn't exist)
const DEFAULT_TASK_TYPES: Record<string, TaskTypeConfig> = {
  'bug-fix': {
    phases: ['analyze', 'fix', 'verify'],
    on_verify_fail: 'fix',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'fix',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      analyze: { skill: null, tools: ['Read', 'Grep', 'Bash'], prompt: '', model: 'opus' },
      fix: { skill: null, tools: ['Read', 'Edit', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'feature': {
    phases: ['implement', 'verify'],
    on_verify_fail: 'implement',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'implement',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      implement: { skill: null, tools: ['Read', 'Edit', 'Write', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'refactor': {
    phases: ['analyze', 'refactor', 'verify'],
    on_verify_fail: 'refactor',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'refactor',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      analyze: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'opus' },
      refactor: { skill: null, tools: ['Read', 'Edit', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
  'test': {
    phases: ['write-tests', 'verify'],
    on_verify_fail: 'write-tests',
    verify_retries: 2,
    final: 'review',
    on_review_fail: 'write-tests',
    review_retries: 1,
    on_max_retries: 'pause',
    phase_config: {
      'write-tests': { skill: null, tools: ['Read', 'Write', 'Bash'], prompt: '', model: 'opus' },
      verify: { skill: null, tools: ['Bash', 'Read'], prompt: '', model: 'sonnet' },
      review: { skill: null, tools: ['Read', 'Grep'], prompt: '', model: 'sonnet' },
    },
  },
};

function loadTaskTypeConfig(localPath: string, taskType: string): TaskTypeConfig {
  const configPath = join(localPath, '.codesync', 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.task_types?.[taskType]) return config.task_types[taskType];
    } catch { /* fall through to defaults */ }
  }
  return DEFAULT_TASK_TYPES[taskType] || DEFAULT_TASK_TYPES['feature'];
}

function buildPrompt(phase: string, task: any, previousOutputs: any[], answer?: string): string {
  let prompt = `You are working on a task for the CodeSync project management system.

## Task
Title: ${task.title}
Type: ${task.type}
Description: ${task.description || 'No description provided.'}
`;

  if (task.followup_notes) {
    prompt += `\n## Followup Notes (from previous rejection)\n${task.followup_notes}\n`;
  }

  if (previousOutputs.length > 0) {
    prompt += '\n## Previous Phase Outputs\n';
    for (const po of previousOutputs) {
      prompt += `### ${po.phase} (attempt ${po.attempt})\n${JSON.stringify(po.output, null, 2)}\n\n`;
    }
  }

  if (answer) {
    prompt += `\n## Human Answer to Your Question\n${answer}\n`;
  }

  // Phase-specific instructions
  const phaseInstructions: Record<string, string> = {
    analyze: 'Analyze the codebase to understand the problem. Identify the root cause and location. Output a structured summary of your findings.',
    fix: 'Fix the issue based on the analysis. Make the minimal changes needed. Run tests if available.',
    implement: 'Implement the feature described above. Follow existing code patterns. Run tests if available.',
    verify: 'Run the test suite and verify the changes work. Report pass/fail and any remaining issues.',
    review: 'Review the changes made. Check code quality, architecture alignment, and completeness. Report any issues.',
    refactor: 'Refactor the code as described. Maintain all existing behavior. Run tests to verify nothing broke.',
    'write-tests': 'Write tests for the described functionality. Follow existing test patterns in the project.',
  };

  prompt += `\n## Current Phase: ${phase}\n${phaseInstructions[phase] || 'Complete this phase of the task.'}\n`;
  prompt += '\nWhen done, write a brief summary of what you did and any issues found.\n';
  prompt += 'If you need clarification from the human, clearly state your question and stop.\n';

  return prompt;
}

// Active processes for cancellation
const activeProcesses = new Map<string, ChildProcess>();

export function cancelJob(jobId: string) {
  const proc = activeProcesses.get(jobId);
  if (proc) {
    proc.kill('SIGTERM');
    activeProcesses.delete(jobId);
  }
}

export async function runJob(ctx: JobContext): Promise<void> {
  const { jobId, task, taskType, localPath, onLog, onPhaseStart, onPhaseComplete, onPause, onReview, onDone, onFail } = ctx;
  const phasesCompleted: any[] = [];

  // Run through phases
  const allPhases = [...taskType.phases, taskType.final];

  for (let i = 0; i < allPhases.length; i++) {
    const phase = allPhases[i];
    const phaseConfig = taskType.phase_config[phase];
    if (!phaseConfig) {
      onFail(`No config for phase: ${phase}`);
      return;
    }

    const maxAttempts = phase === 'verify' ? taskType.verify_retries + 1 :
                        phase === taskType.final ? taskType.review_retries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onPhaseStart(phase, attempt);

      // Update job in DB
      await supabase.from('jobs').update({
        current_phase: phase,
        attempt,
      }).eq('id', jobId);

      const prompt = buildPrompt(phase, task, phasesCompleted, ctx.task.answer);

      // Spawn claude -p
      const args = ['-p', prompt, '--max-turns', '20'];
      if (phaseConfig.tools.length > 0) {
        args.push('--allowedTools', phaseConfig.tools.join(','));
      }

      onLog(`\n--- Phase: ${phase} (attempt ${attempt}/${maxAttempts}) ---\n`);

      try {
        const output = await spawnClaude(jobId, args, localPath, onLog);

        const phaseOutput = {
          phase,
          attempt,
          output: output.substring(0, 3000), // Cap output size
        };
        phasesCompleted.push(phaseOutput);
        onPhaseComplete(phase, phaseOutput);

        // Check if claude asked a question (simple heuristic: ends with ?)
        const lastLines = output.trim().split('\n').slice(-3).join('\n');
        if (lastLines.includes('?') && (lastLines.includes('Should I') || lastLines.includes('Could you') || lastLines.includes('Which') || lastLines.includes('clarif'))) {
          await supabase.from('jobs').update({
            status: 'paused',
            question: lastLines,
            phases_completed: phasesCompleted,
          }).eq('id', jobId);
          await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
          onPause(lastLines);
          return;
        }

        // Verify phase: check if output indicates failure
        if (phase === 'verify') {
          const lower = output.toLowerCase();
          const failed = lower.includes('fail') || lower.includes('error') || lower.includes('not passing');
          if (failed && attempt < maxAttempts) {
            onLog(`\nVerify failed, retrying...\n`);
            continue; // Retry
          }
          if (failed && attempt >= maxAttempts) {
            if (taskType.on_max_retries === 'pause') {
              await supabase.from('jobs').update({
                status: 'paused',
                question: `Tests still failing after ${maxAttempts} attempts. Last output:\n${lastLines}`,
                phases_completed: phasesCompleted,
              }).eq('id', jobId);
              await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
              onPause(`Tests still failing after ${maxAttempts} attempts.`);
              return;
            }
          }
        }

        // Move to next phase
        break;

      } catch (err: any) {
        onLog(`\nError in phase ${phase}: ${err.message}\n`);
        if (attempt >= maxAttempts) {
          await supabase.from('jobs').update({
            status: 'failed',
            phases_completed: phasesCompleted,
            completed_at: new Date().toISOString(),
          }).eq('id', jobId);
          onFail(err.message);
          return;
        }
      }
    }
  }

  // All phases complete — move to review
  const reviewOutput = phasesCompleted[phasesCompleted.length - 1];
  const reviewResult = {
    filesChanged: 0, // TODO: parse from git diff
    testsPassed: true,
    linesAdded: 0,
    linesRemoved: 0,
    summary: reviewOutput?.output?.substring(0, 500) || 'Completed',
  };

  await supabase.from('jobs').update({
    status: 'review',
    phases_completed: phasesCompleted,
    review_result: reviewResult,
  }).eq('id', jobId);
  await supabase.from('tasks').update({ status: 'review' }).eq('id', ctx.taskId);
  onReview(reviewResult);
}

function spawnClaude(jobId: string, args: string[], cwd: string, onLog: (text: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'dumb' },
    });

    activeProcesses.set(jobId, proc);
    let stdout = '';

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      onLog(text);
    });

    proc.stderr.on('data', (data: Buffer) => {
      onLog(data.toString());
    });

    proc.on('close', (code) => {
      activeProcesses.delete(jobId);
      if (code === 0 || code === null) {
        resolve(stdout);
      } else {
        reject(new Error(`claude exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      activeProcesses.delete(jobId);
      reject(err);
    });
  });
}

export { loadTaskTypeConfig };
