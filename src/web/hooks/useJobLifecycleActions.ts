import { useCallback, useRef } from 'react';
import {
  approveJob,
  continueJob,
  deleteJob,
  moveToBacklog,
  rejectJob,
  replyToJob,
  reworkJob,
  terminateJob,
} from '../lib/api';
import type { ExecutionActionContext, ExecutionJobsResource } from './execution-action-types';
import { getErrorMessage, requireExecutionContext } from './execution-action-utils';

interface UseJobLifecycleActionsParams extends ExecutionActionContext {
  jobs: ExecutionJobsResource;
  reloadTaskState: () => Promise<void>;
}

export function useJobLifecycleActions({
  projectId,
  localPath,
  modal,
  jobs,
  reloadTaskState,
}: UseJobLifecycleActionsParams) {
  const busyRef = useRef(false);

  const guarded = useCallback(async <T>(fn: () => Promise<T>, errorLabel: string): Promise<T | undefined> => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      return await fn();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, errorLabel));
    } finally {
      busyRef.current = false;
    }
  }, [modal]);

  const terminate = useCallback(async (jobId: string) => {
    if (!(await modal.confirm('Terminate job', 'Terminate this running job?', { label: 'Terminate', danger: true }))) {
      return;
    }
    await guarded(async () => {
      await terminateJob(jobId);
      await reloadTaskState();
    }, 'Failed to terminate');
  }, [guarded, modal, reloadTaskState]);

  const reply = useCallback(async (jobId: string, answer: string) => {
    if (!localPath) {
      await modal.alert('Error', 'Project local path is not configured');
      return;
    }
    await guarded(async () => {
      await replyToJob(jobId, answer, localPath);
      await reloadTaskState();
    }, 'Failed to send reply');
  }, [guarded, localPath, modal, reloadTaskState]);

  const approve = useCallback(async (jobId: string) => {
    await guarded(async () => {
      await approveJob(jobId);
      await reloadTaskState();
    }, 'Failed to approve');
  }, [guarded, reloadTaskState]);

  const reject = useCallback(async (jobId: string) => {
    await guarded(async () => {
      await rejectJob(jobId);
      await reloadTaskState();
    }, 'Failed to reject');
  }, [guarded, reloadTaskState]);

  const rework = useCallback(async (jobId: string, note: string) => {
    const context = await requireExecutionContext({ projectId, localPath, modal });
    if (!context) return;
    await guarded(async () => {
      await reworkJob(jobId, note, context.projectId, context.localPath);
      await reloadTaskState();
    }, 'Failed to rework');
  }, [guarded, localPath, modal, projectId, reloadTaskState]);

  const dismissJob = useCallback(async (jobId: string) => {
    await guarded(async () => {
      await deleteJob(jobId);
      await jobs.reload();
    }, 'Failed to dismiss job');
  }, [guarded, jobs]);

  const sendToBacklog = useCallback(async (jobId: string) => {
    await guarded(async () => {
      await moveToBacklog(jobId);
      await reloadTaskState();
    }, 'Failed to move to backlog');
  }, [guarded, reloadTaskState]);

  const continueExecution = useCallback(async (jobId: string) => {
    await guarded(async () => {
      await continueJob(jobId);
      await reloadTaskState();
    }, 'Failed to continue job');
  }, [guarded, reloadTaskState]);

  return {
    terminate,
    reply,
    approve,
    reject,
    rework,
    dismissJob,
    sendToBacklog,
    continueExecution,
  };
}
