import { useState, useEffect, useRef } from 'react';
import { TaskCard } from './TaskCard';
import type { JobView } from './job-types';
import s from './WorkstreamColumn.module.css';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  auto_continue: boolean;
  assignee?: { type: string; name?: string; initials?: string } | null;
  images?: string[];
  status?: string;
}

interface Workstream {
  id: string;
  name: string;
  status: string;
  position: number;
}

interface WorkstreamColumnProps {
  workstream: Workstream | null;
  tasks: Task[];
  taskJobMap: Record<string, JobView>;
  isBacklog: boolean;
  // Drag
  draggedTaskId: string | null;
  onDragTaskStart: (taskId: string) => void;
  onDragTaskEnd: () => void;
  onDropTask: (workstreamId: string | null, dropIndex: number) => void;
  // Column actions
  onRenameWorkstream?: (id: string, name: string) => void;
  onDeleteWorkstream?: (id: string) => void;
  // Task actions
  onAddTask: () => void;
  onRunWorkstream?: () => void;
  onRunTask?: (taskId: string) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  // Job actions
  onTerminate?: (jobId: string) => void;
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onRevert?: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onCreatePr?: () => void;
}

export function WorkstreamColumn({
  workstream,
  tasks,
  taskJobMap,
  isBacklog,
  draggedTaskId,
  onDragTaskStart,
  onDragTaskEnd,
  onDropTask,
  onRenameWorkstream,
  onDeleteWorkstream,
  onAddTask,
  onRunWorkstream,
  onRunTask,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRevert,
  onDeleteJob,
  onCreatePr,
}: WorkstreamColumnProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(workstream?.name || '');
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [isDropOver, setIsDropOver] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);

  const wsId = workstream?.id || null;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const totalTasks = tasks.length;
  const allDone = totalTasks > 0 && doneTasks === totalTasks;

  useEffect(() => {
    const activeTask = tasks.find(t => {
      const job = taskJobMap[t.id];
      return job && ['queued', 'running', 'paused', 'review'].includes(job.status);
    });
    if (activeTask && activeTask.id !== expandedId) setExpandedId(activeTask.id);
  }, [tasks, taskJobMap, expandedId]);

  // Focus name input when editing
  useEffect(() => {
    if (editing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editing]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && workstream && trimmed !== workstream.name) {
      onRenameWorkstream?.(workstream.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      className={`${s.column} ${isBacklog ? s.backlog : ''} ${isDropOver && draggedTaskId ? s.dropOver : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isDropOver) setIsDropOver(true);
      }}
      onDragLeave={() => {
        setIsDropOver(false);
        setDropIndex(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDropOver(false);
        setDropIndex(null);
        if (draggedTaskId) {
          onDropTask(wsId, dropIndex ?? tasks.length);
        }
      }}
    >
      {/* Header */}
      <div className={s.header}>
        {editing && !isBacklog ? (
          <input
            ref={nameInputRef}
            className={s.nameInput}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span
            className={s.name}
            onDoubleClick={() => {
              if (!isBacklog && workstream) {
                setEditName(workstream.name);
                setEditing(true);
              }
            }}
            title={isBacklog ? undefined : 'Double-click to rename'}
          >
            {isBacklog ? 'Backlog' : workstream?.name}
          </span>
        )}

        {!isBacklog && onRunWorkstream && !allDone && totalTasks > 0 && (
          <button
            className={s.runBtn}
            onClick={onRunWorkstream}
            title="Run workstream"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Run
          </button>
        )}

        <span className={`${s.progress} ${allDone ? s.progressComplete : ''}`}>
          {doneTasks}/{totalTasks}
        </span>

        <button
          className={s.addBtn}
          onClick={onAddTask}
          title="Add task"
        >
          +
        </button>

        {!isBacklog && workstream && (
          <div className={s.actions}>
            {onDeleteWorkstream && (
              <button
                className={`${s.actionBtn} ${s.actionBtnDanger}`}
                onClick={() => {
                  if (confirm(`Delete workstream "${workstream.name}"? Tasks will move to backlog.`)) {
                    onDeleteWorkstream(workstream.id);
                  }
                }}
                title="Delete workstream"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task list */}
      <div
        className={s.tasks}
        ref={tasksRef}
        onDragOver={(e) => {
          e.preventDefault();
          if (!draggedTaskId) return;
          // Calculate drop index from cursor Y vs card midpoints
          const container = tasksRef.current;
          if (!container) return;
          const cards = Array.from(container.querySelectorAll(`:scope > .${s.cardWrap}`));
          let idx = cards.length;
          for (let i = 0; i < cards.length; i++) {
            const rect = cards[i].getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
              idx = i;
              break;
            }
          }
          if (dropIndex !== idx) setDropIndex(idx);
        }}
      >
        {tasks.length === 0 && !draggedTaskId && (
          <div className={s.empty}>
            {isBacklog ? 'No tasks in backlog' : 'Drop tasks here'}
          </div>
        )}
        {tasks.length === 0 && draggedTaskId && (
          <div className={s.placeholder} />
        )}
        {tasks.map((task, index) => {
          const job = taskJobMap[task.id] || null;
          return (
            <div key={task.id} className={s.cardWrap}>
              {dropIndex === index && draggedTaskId && draggedTaskId !== task.id && (
                <div className={s.placeholder} />
              )}
              <TaskCard
                task={task}
                job={job}
                isExpanded={expandedId === task.id}
                onToggleExpand={() => setExpandedId(expandedId === task.id ? null : task.id)}
                onRun={onRunTask}
                onEdit={onEditTask ? () => onEditTask(task) : undefined}
                onDelete={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                onUpdateTask={onUpdateTask}
                onTerminate={onTerminate}
                onReply={onReply}
                onApprove={onApprove}
                onReject={onReject}
                onRevert={onRevert}
                onDeleteJob={onDeleteJob}
                onDragStart={() => onDragTaskStart(task.id)}
                onDragEnd={onDragTaskEnd}
                isDragging={draggedTaskId === task.id}
              />
            </div>
          );
        })}
        {/* Placeholder at end */}
        {dropIndex === tasks.length && draggedTaskId && tasks.length > 0 && (
          <div className={s.placeholder} />
        )}
      </div>

      {allDone && !isBacklog && (
        <div className={s.completeBanner}>
          <span>&#10003; Workstream complete</span>
          {onCreatePr && (
            <button className="btn btnPrimary btnSm" onClick={onCreatePr}>Create PR</button>
          )}
        </div>
      )}
    </div>
  );
}
