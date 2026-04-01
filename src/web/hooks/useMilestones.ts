import { useState, useEffect, useCallback } from 'react';
import { getMilestones, createMilestone as apiCreateMilestone } from '../lib/api';

interface Milestone {
  id: string;
  project_id: string;
  name: string;
  deadline: string | null;
  status: string;
  created_at: string;
}

export function useMilestones(projectId: string | null) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    const data = await getMilestones(projectId);
    setMilestones(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function createMilestone(name: string, deadline?: string) {
    if (!projectId) return;
    await apiCreateMilestone(projectId, name, deadline);
    await load();
  }

  const active = milestones.filter(m => m.status === 'active');

  return { milestones, active, loading, createMilestone, reload: load };
}
