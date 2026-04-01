import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { useTasks } from './hooks/useTasks';
import { useMilestones } from './hooks/useMilestones';
import { signUp, signIn, signOut as apiSignOut } from './lib/api';
import { OnboardingCheck } from './components/OnboardingCheck';
import { AuthGate } from './components/AuthGate';
import { NewProject } from './components/NewProject';
import { Header } from './components/Header';
import { FocusView } from './components/FocusView';
import { JobsPanel } from './components/JobsPanel';
import { Backlog } from './components/Backlog';
import { TaskForm } from './components/TaskForm';
import './styles/global.css';

export default function App() {
  const [envReady, setEnvReady] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const auth = useAuth();
  const projects = useProjects(auth.profile?.id);
  const tasks = useTasks(projects.current?.id || null);
  const milestones = useMilestones(projects.current?.id || null);

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
    return <NewProject onCreate={async (name) => { await projects.createProject(name); }} />;
  }

  // Step 6: Focus task
  const focusTask = tasks.backlog[0];
  const nextTasks = tasks.backlog.slice(1, 3);

  // Milestone progress
  const activeMilestone = milestones.active[0];
  const milestoneTasks = activeMilestone
    ? tasks.tasks.filter(t => t.milestone_id === activeMilestone.id)
    : tasks.tasks;
  const msProgress = {
    name: activeMilestone?.name || 'All',
    tasksDone: milestoneTasks.filter(t => t.status === 'done').length,
    tasksTotal: milestoneTasks.length,
  };

  return (
    <>
      <Header
        projectName={projects.current?.name || ''}
        milestone={msProgress}
        notifications={0}
        userInitials={auth.profile.initials}
      />
      <main style={{
        display: 'grid',
        gridTemplateColumns: '1fr 480px',
        minHeight: 'calc(100vh - 56px)',
      }}>
        <div style={{
          padding: '56px 64px 100px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: 600 }}>
            {focusTask ? (
              <FocusView
                task={{
                  title: focusTask.title,
                  type: focusTask.type,
                  mode: focusTask.mode,
                  effort: focusTask.effort,
                  blocksCount: 0,
                }}
                reason={`Top of your backlog. ${tasks.backlog.length} tasks remaining.`}
                next={nextTasks[0]?.title || ''}
                then={nextTasks[1]?.title || ''}
              />
            ) : (
              <EmptyState onAdd={() => setShowTaskForm(true)} />
            )}
            <Backlog
              tasks={tasks.backlog.map(t => ({
                id: t.id,
                title: t.title,
                description: t.description || '',
                type: t.type,
                mode: t.mode,
                effort: t.effort,
                blocked: false,
                assignee: t.assignee ? { type: 'user', initials: '?' } : { type: 'ai' },
              }))}
              onAddTask={() => setShowTaskForm(true)}
            />
          </div>
        </div>
        <div style={{
          padding: '56px 40px 100px',
          borderLeft: '1px solid var(--divider)',
        }}>
          <JobsPanel jobs={[]} />
        </div>
      </main>

      {showTaskForm && projects.current && (
        <TaskForm
          milestones={milestones.active.map(m => ({ id: m.id, name: m.name }))}
          onSubmit={async (data) => {
            await tasks.createTask({
              project_id: projects.current!.id,
              title: data.title,
              description: data.description,
              type: data.type,
              mode: data.mode as any,
              effort: data.effort as any,
              milestone_id: data.milestone_id,
            });
          }}
          onClose={() => setShowTaskForm(false)}
        />
      )}
    </>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 15 }}>
      {text}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ marginBottom: 72 }}>
      <p style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--blue)', marginBottom: 20 }}>Now</p>
      <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 16 }}>Nothing to do</h1>
      <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 32 }}>Add a task to get started.</p>
      <button
        onClick={onAdd}
        style={{ padding: '10px 28px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        New Task
      </button>
    </div>
  );
}
