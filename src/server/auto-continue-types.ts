export interface AutoContinueTask {
  id: string;
  project_id: string;
  execution_generation?: number | null;
  flow_id?: string | null;
  status?: string | null;
  type: string;
  mode: string | null;
  title: string;
  assignee: string | null;
  created_by: string | null;
}

export interface QueueNextWorkstreamTaskParams {
  completedTaskId: string;
  projectId: string;
  localPath: string;
  workstreamId: string;
  completedPosition: number;
}
