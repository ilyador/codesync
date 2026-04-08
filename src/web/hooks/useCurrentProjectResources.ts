import { useCommentCounts } from './useCommentCounts';
import { useCustomTypes } from './useCustomTypes';
import { useFlows } from './useFlows';
import { useJobs } from './useJobs';
import { useMembers } from './useMembers';
import { useProviders } from './useProviders';
import { useTasks } from './useTasks';
import { useWorkstreams } from './useWorkstreams';

export function useCurrentProjectResources(projectId: string | null) {
  const tasks = useTasks(projectId);
  const jobs = useJobs(projectId);
  const workstreams = useWorkstreams(projectId);
  const members = useMembers(projectId);
  const aiFlows = useFlows(projectId);
  const providers = useProviders(projectId);
  const customTypes = useCustomTypes(projectId);
  const commentCounts = useCommentCounts(projectId);

  const ready = tasks.ready
    && jobs.ready
    && workstreams.ready
    && members.ready
    && aiFlows.ready
    && providers.ready
    && customTypes.ready
    && commentCounts.ready;

  return {
    tasks,
    jobs,
    workstreams,
    members,
    aiFlows,
    providers,
    customTypes,
    commentCounts,
    ready,
  };
}
