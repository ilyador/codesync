import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { useNotifications } from './hooks/useNotifications';
import { useWebNotifications } from './hooks/useWebNotifications';
import { signUp, signIn, signOut } from './lib/api';
import { toTaskCreatePayload, toTaskMutationPayload } from './lib/task-form-payload';
import { useSearchParams } from 'react-router-dom';
import { OnboardingCheck } from './components/OnboardingCheck';
import { AuthGate } from './components/AuthGate';
import { NewProject } from './components/NewProject';
import { CurrentProjectWorkspace } from './components/CurrentProjectWorkspace';
import { useModal } from './hooks/modal-context';
import { useExecutionActions } from './hooks/useExecutionActions';
import { useProjectOrderingMutations } from './hooks/useProjectOrderingMutations';
import { useProjectWorkspaceEffects } from './hooks/useProjectWorkspaceEffects';
import { useProjectViewModels } from './hooks/useProjectViewModels';
import { useTaskEditorState } from './hooks/useTaskEditorState';
import { useCurrentProjectResources } from './hooks/useCurrentProjectResources';
import appStyles from './App.module.css';
import './styles/global.css';

export default function App() {
  const [envReady, setEnvReady] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const auth = useAuth();
  const projects = useProjects(auth.profile?.id);
  const projectResources = useCurrentProjectResources(projects.current?.id || null);
  const notifs = useNotifications(auth.profile?.id);
  const webNotifs = useWebNotifications();
  const modal = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusTaskId = searchParams.get('task');
  const focusWsId = searchParams.get('ws');
  const { notify } = webNotifs;
  const currentProjectName = projects.current?.name || null;
  const {
    showTaskForm,
    taskFormWorkstream,
    editingTask,
    openCreateTask,
    closeCreateTask,
    startEditingTask,
    closeEditTask,
  } = useTaskEditorState();
  const executionActions = useExecutionActions({
    projectId: projects.current?.id || null,
    localPath: projects.current?.local_path,
    modal,
    tasks: projectResources.tasks,
    jobs: projectResources.jobs,
    workstreams: projectResources.workstreams,
  });

  const {
    mentionedTaskIds,
    taskTitleMap,
    memberMap,
    flowMap,
    typeFlowMap,
    jobViews,
    todoItems,
    reviewItems,
    wsProgress,
  } = useProjectViewModels({
    tasks: projectResources.tasks.tasks,
    jobs: projectResources.jobs.jobs,
    activeWorkstreams: projectResources.workstreams.active,
    workstreams: projectResources.workstreams.workstreams,
    members: projectResources.members.members,
    flows: projectResources.aiFlows.flows,
    notifications: notifs.notifications,
    currentUserId: auth.profile?.id,
  });
  const {
    handleSwapWorkstreams,
    handleMoveTask,
    handleSwapFlows,
  } = useProjectOrderingMutations({
    modal,
    workstreams: projectResources.workstreams.workstreams,
    setWorkstreams: projectResources.workstreams.setWorkstreams,
    reloadWorkstreams: projectResources.workstreams.reload,
    tasks: projectResources.tasks.tasks,
    setTasks: projectResources.tasks.setTasks,
    reloadTasks: projectResources.tasks.reload,
    flows: projectResources.aiFlows.flows,
    setFlows: projectResources.aiFlows.setFlows,
    reloadFlows: projectResources.aiFlows.reload,
  });
  useProjectWorkspaceEffects({
    focusTaskId,
    focusWsId,
    setSearchParams,
    jobs: projectResources.jobs.jobs,
    tasks: projectResources.tasks.tasks,
    taskTitleMap,
    notify,
    currentProjectName,
  });

  // Step 1: Environment check
  if (!envReady) {
    return <OnboardingCheck onReady={() => setEnvReady(true)} />;
  }

  // Step 2: Loading auth
  if (auth.loading) {
    return <Loading text="Loading..." />;
  }

  // Step 3: Not logged in
  if (!auth.loggedIn || !auth.profile) {
    return (
      <AuthGate onAuth={async (action, email, password, name) => {
        if (action === 'signUp') await signUp(email, password, name!);
        else await signIn(email, password);
        auth.onAuthSuccess();
      }} />
    );
  }

  // Step 4: Loading projects
  if (projects.loading) {
    return <Loading text="Loading projects..." />;
  }

  // Step 5: No projects yet
  if (projects.projects.length === 0) {
    return <NewProject onCreate={async (name, supabaseConfig, localPath) => { await projects.createProject(name, supabaseConfig, localPath); }} />;
  }

  if (!projects.current) {
    return <Loading text="Loading project..." />;
  }

  if (!projectResources.ready) {
    return <Loading text="Loading project..." />;
  }

  return (
    <CurrentProjectWorkspace
      project={{
        id: projects.current.id,
        name: projects.current.name,
        local_path: projects.current.local_path ?? null,
        role: projects.current.role || 'dev',
      }}
      projects={projects.projects.map(project => ({ id: project.id, name: project.name }))}
      profile={{ id: auth.profile.id, initials: auth.profile.initials }}
      webNotifications={webNotifs}
      notifications={notifs}
      milestone={wsProgress}
      todoItems={todoItems}
      reviewItems={reviewItems}
      tasks={projectResources.tasks.tasks}
      activeWorkstreams={projectResources.workstreams.active}
      allWorkstreams={projectResources.workstreams.workstreams}
      members={projectResources.members.members}
      flows={projectResources.aiFlows.flows}
      setFlows={projectResources.aiFlows.setFlows}
      customTypes={projectResources.customTypes.types}
      jobs={jobViews}
      memberMap={memberMap}
      flowMap={flowMap}
      typeFlowMap={typeFlowMap}
      mentionedTaskIds={mentionedTaskIds}
      commentCounts={projectResources.commentCounts.counts}
      focusTaskId={focusTaskId}
      focusWsId={focusWsId}
      showTaskForm={showTaskForm}
      taskFormWorkstream={taskFormWorkstream}
      editingTask={editingTask}
      showAddProject={showAddProject}
      showMembersModal={showMembersModal}
      onSwitchProject={projects.switchProject}
      onOpenAddProject={() => setShowAddProject(true)}
      onSignOut={async () => { await signOut(); window.location.reload(); }}
      onOpenMembersModal={() => setShowMembersModal(true)}
      onUpdateLocalPath={path => projects.updateLocalPath(projects.current.id, path)}
      onCloseAddProject={() => setShowAddProject(false)}
      onCreateProject={async (name, localPath) => {
        await projects.createProject(name, undefined, localPath);
      }}
      onCloseMembersModal={() => setShowMembersModal(false)}
      onSaveCustomType={projectResources.customTypes.addType}
      onCreateTask={async (data) => {
        await projectResources.tasks.createTask(toTaskCreatePayload(projects.current.id, data));
      }}
      onUpdateTaskForm={async (taskId, data) => {
        await projectResources.tasks.updateTask(taskId, toTaskMutationPayload(data));
      }}
      onCloseCreateTask={closeCreateTask}
      onCloseEditTask={closeEditTask}
      onStartEditingTask={startEditingTask}
      onCreateWorkstream={projectResources.workstreams.createWorkstream}
      onUpdateWorkstream={projectResources.workstreams.updateWorkstream}
      onDeleteWorkstream={executionActions.deleteWorkstreamAndReloadTasks}
      onSwapColumns={handleSwapWorkstreams}
      onAddTask={openCreateTask}
      onRunWorkstream={executionActions.runWorkstream}
      onRunTask={executionActions.runTask}
      onDeleteTask={projectResources.tasks.deleteTask}
      onUpdateTask={projectResources.tasks.updateTask}
      onMoveTask={handleMoveTask}
      onTerminate={executionActions.terminate}
      onReply={executionActions.reply}
      onApprove={executionActions.approve}
      onReject={executionActions.reject}
      onRework={executionActions.rework}
      onDeleteJob={executionActions.dismissJob}
      onMoveToBacklog={executionActions.sendToBacklog}
      onContinue={executionActions.continueExecution}
      onCreatePr={executionActions.createPr}
      onRestoreArchiveWorkstream={async (workstreamId) => { await projectResources.workstreams.updateWorkstream(workstreamId, { status: 'active' }); }}
      onSaveFlow={async (flowId, updates) => { await projectResources.aiFlows.updateFlow(flowId, updates); await projectResources.aiFlows.reload(); }}
      onSaveFlowSteps={async (flowId, steps) => { await projectResources.aiFlows.updateFlowSteps(flowId, steps); await projectResources.aiFlows.reload(); }}
      onCreateFlow={projectResources.aiFlows.createFlow}
      onDeleteFlow={projectResources.aiFlows.deleteFlow}
      onSwapFlows={handleSwapFlows}
    />
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className={appStyles.loadingScreen}>
      {text}
    </div>
  );
}
