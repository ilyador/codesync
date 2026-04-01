interface Task {
  id: string;
  title: string;
  type: string;
  mode: string;
  effort: string;
  status: string;
  position: number;
  milestone_id: string | null;
}

interface Milestone {
  id: string;
  name: string;
  deadline: string | null;
}

interface Blocker {
  task_id: string;
  blocked_by: string;
}

interface FocusResult {
  task: Task;
  reason: string;
  score: number;
}

export function computeFocus(
  tasks: Task[],
  milestones: Milestone[],
  blockers: Blocker[],
): FocusResult | null {
  // Only consider backlog/todo tasks
  const actionable = tasks.filter(t => ['backlog', 'todo'].includes(t.status));
  if (actionable.length === 0) return null;

  // Build blocker graph: which tasks are blocked?
  const blockedSet = new Set(blockers.map(b => b.task_id));

  // Count how many tasks each task transitively blocks
  const blocksCount = new Map<string, number>();
  for (const t of tasks) {
    // Count tasks that depend on this one (directly)
    const directlyBlocks = blockers.filter(b => b.blocked_by === t.id).length;
    blocksCount.set(t.id, directlyBlocks);
  }

  // Milestone deadline map
  const deadlineMap = new Map<string, number>();
  const now = Date.now();
  for (const m of milestones) {
    if (m.deadline) {
      const daysLeft = (new Date(m.deadline).getTime() - now) / (1000 * 60 * 60 * 24);
      deadlineMap.set(m.id, Math.max(0, daysLeft));
    }
  }

  // Score each actionable task
  const scored = actionable
    .filter(t => !blockedSet.has(t.id)) // Exclude blocked tasks
    .map(t => {
      const blocks = blocksCount.get(t.id) || 0;
      const blockerScore = blocks * 3;

      let deadlineScore = 0;
      if (t.milestone_id && deadlineMap.has(t.milestone_id)) {
        const daysLeft = deadlineMap.get(t.milestone_id)!;
        deadlineScore = daysLeft < 1 ? 10 : daysLeft < 7 ? 6 : daysLeft < 14 ? 3 : 1;
        deadlineScore *= 2;
      }

      const maxPos = Math.max(...actionable.map(a => a.position), 1);
      const positionScore = ((maxPos - t.position) / maxPos) * 1;

      const score = blockerScore + deadlineScore + positionScore;

      return { task: t, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // All actionable tasks are blocked — pick first blocked one
    const first = actionable[0];
    return { task: first, reason: 'All tasks are blocked. This is first in the backlog.', score: 0 };
  }

  const top = scored[0];

  // Build reason
  const reasons: string[] = [];
  const blocks = blocksCount.get(top.task.id) || 0;
  if (blocks > 0) reasons.push(`Blocks ${blocks} other task${blocks > 1 ? 's' : ''}`);
  if (top.task.milestone_id && deadlineMap.has(top.task.milestone_id)) {
    const days = Math.round(deadlineMap.get(top.task.milestone_id)!);
    const ms = milestones.find(m => m.id === top.task.milestone_id);
    reasons.push(`${ms?.name} deadline in ${days} day${days !== 1 ? 's' : ''}`);
  }
  if (reasons.length === 0) reasons.push('Top of your backlog');
  reasons.push(`${actionable.length} tasks remaining`);

  return {
    task: top.task,
    reason: reasons.join('. ') + '.',
    score: top.score,
  };
}
