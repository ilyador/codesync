import { useState, useEffect, useCallback } from 'react';
import { getJobs, subscribeToChanges } from '../lib/api';

interface Job {
  id: string;
  task_id: string;
  project_id: string;
  status: string;
  current_phase: string | null;
  attempt: number;
  max_attempts: number;
  phases_completed: any[];
  question: string | null;
  answer: string | null;
  review_result: any;
  started_at: string;
  completed_at: string | null;
}

export function useJobs(projectId: string | null) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    const data = await getJobs(projectId);
    setJobs(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
    if (!projectId) return;
    const unsub = subscribeToChanges(projectId, () => { load(); });
    return unsub;
  }, [projectId, load]);

  const running = jobs.filter(j => j.status === 'running');
  const paused = jobs.filter(j => j.status === 'paused');
  const review = jobs.filter(j => j.status === 'review');
  const done = jobs.filter(j => j.status === 'done').slice(0, 5);

  return { jobs, running, paused, review, done, loading, reload: load };
}
