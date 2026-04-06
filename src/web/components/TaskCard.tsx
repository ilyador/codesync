import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { elapsed } from '../lib/time';
import { LiveLogs } from './LiveLogs';
import { ReplyInput } from './ReplyInput';
import { TaskAttachments } from './TaskAttachments';
import { DoneDetail, FlowStepDetail, IdleDetail } from './TaskCardDetails';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import type { MentionMember, TaskCardMetaItem } from './task-card-types';
import s from './TaskCard.module.css';

function cap(str: string) { return str.charAt(0).toUpperCase() + str.slice(1); }

export interface TaskCardProps {
  task: TaskView;
  job: JobView | null;
  canRunAi: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRun?: (taskId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  onTerminate?: (jobId: string) => void;
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onRework?: (jobId: string, note: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onMoveToBacklog?: (jobId: string) => void;
  onContinue?: (jobId: string) => void;
  onDragStart?: (e?: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  dragDisabled?: boolean;
  skipDragGhost?: boolean;
  showPriority?: boolean;
  isBacklog?: boolean;
  projectId?: string;
  hasUnreadMention?: boolean;
  commentCount?: number;
  brokenLink?: { up: boolean; down: boolean } | null;
  metaItems?: TaskCardMetaItem[];
  hideComments?: boolean;
  prevTaskId?: string | null;
  mentionMembers?: MentionMember[];
}

interface TaskCardViewProps extends TaskCardProps {
  viewMode?: 'task' | 'flow-step';
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Waiting',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
};

export function TaskCard({
  ...props
}: TaskCardProps) {
  return <TaskCardView {...props} viewMode="task" />;
}

export function TaskCardView({
  task,
  job,
  canRunAi,
  isExpanded,
  onToggleExpand,
  onRun,
  onEdit,
  onDelete,
  onUpdateTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onDragStart,
  onDragEnd,
  isDragging,
  dragDisabled,
  skipDragGhost,
  showPriority,
  isBacklog,
  projectId,
  hasUnreadMention,
  commentCount = 0,
  brokenLink,
  metaItems,
  hideComments,
  prevTaskId,
  mentionMembers,
  viewMode = 'task',
}: TaskCardViewProps) {
  const jobStatus = job?.status;
  const isActive = jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'paused' || jobStatus === 'review';
  const taskDone = task.status === 'done' || jobStatus === 'done';
  const isHumanWaiting = task.mode === 'human' && task.status === 'in_progress' && !isActive;
  const isFlowStep = viewMode === 'flow-step';

  const statusClass = jobStatus
    ? s[`status${cap(jobStatus)}`]
    : isHumanWaiting ? s.statusPaused
    : taskDone ? s.statusDone : '';

  // Priority visuals controlled by parent (backlog shows priority, workstreams don't)
  const hasStatusBorder = !!statusClass;
  const priorityVisible = showPriority && !hasStatusBorder;
  const priorityBgClass = showPriority && task.priority === 'critical' ? s.priorityCriticalBg
    : showPriority && task.priority === 'upcoming' ? s.priorityUpcomingBg
    : '';
  const priorityBorderClass = priorityVisible && task.priority === 'critical' ? s.priorityCriticalBorder
    : priorityVisible && task.priority === 'upcoming' ? s.priorityUpcomingBorder
    : '';

  const dotClass = jobStatus
    ? s[`dot${cap(jobStatus)}`]
    : taskDone ? s.dotDone : s.dotIdle;

  const tagStatusClass = jobStatus
    ? s[`tag${cap(jobStatus)}`] : '';

  // Local elapsed timer — only ticks when this card's job is running
  const [, setElapsedTick] = useState(0);
  useEffect(() => {
    if (jobStatus !== 'running' || !job?.startedAt) return;
    const interval = setInterval(() => setElapsedTick(tick => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [jobStatus, job?.startedAt]);
  const elapsedText = jobStatus === 'running' && job?.startedAt ? elapsed(job.startedAt) : '';

  const [showRework, setShowRework] = useState(false);

  return (
    <div
      data-task-card="true"
      className={`${s.card} ${priorityBgClass} ${priorityBorderClass} ${statusClass} ${isDragging ? s.dragging : ''}`}
      onClick={onToggleExpand}
    >
      {/* Compact view — always visible */}
      <div className={s.compact}>
        {!dragDisabled && (
          <span
            className={s.handle}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              if (!skipDragGhost) {
                const card = (e.target as HTMLElement).closest(`.${s.card}`) as HTMLElement;
                if (card) {
                  const clone = card.cloneNode(true) as HTMLElement;
                  clone.style.width = `${card.offsetWidth}px`;
                  clone.style.transform = 'rotate(2deg) scale(1.02)';
                  clone.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1)';
                  clone.style.borderRadius = '10px';
                  clone.style.opacity = '0.92';
                  clone.style.position = 'fixed';
                  clone.style.top = '-9999px';
                  clone.style.left = '-9999px';
                  clone.style.pointerEvents = 'none';
                  clone.id = '__drag-preview__';
                  document.body.appendChild(clone);
                  e.dataTransfer.setDragImage(clone, card.offsetWidth / 2, 20);
                }
              }
              onDragStart?.(e);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={(e) => {
              e.stopPropagation();
              document.getElementById('__drag-preview__')?.remove();
              onDragEnd?.();
            }}
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
          >&#8942;&#8942;</span>
        )}

        {(jobStatus || taskDone) && <span className={`${s.statusDot} ${dotClass}`} />}

        <span className={s.title}>{task.title}</span>

        <div className={s.tags}>
          {brokenLink && (
            <span className={s.brokenLink} title={
              brokenLink.up && brokenLink.down ? 'Missing input and output connection'
              : brokenLink.up ? 'No previous task produces files'
              : 'No next task accepts files'
            }>
              {brokenLink.up && '\u2191'}{'\u26A0'}{brokenLink.down && '\u2193'}
            </span>
          )}
          {!task.auto_continue && (!task.assignee || task.assignee.type === 'ai') && (
            <span className={s.chain} title="Manual review required">&#9646;&#9646;</span>
          )}
          {jobStatus && jobStatus !== 'done' && (
            <span className={`${s.tag} ${s.tagStatus} ${tagStatusClass}`}>
              {STATUS_LABELS[jobStatus]}
            </span>
          )}
          {commentCount > 0 && (
            <span className={`${s.commentBadge} ${hasUnreadMention ? s.commentBadgeMention : ''}`} title={hasUnreadMention ? 'You were mentioned' : `${commentCount} comment${commentCount > 1 ? 's' : ''}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              {commentCount}
            </span>
          )}
          {task.assignee && task.assignee.type !== 'ai' && (
            <span className={`${s.tag} ${s.tagHuman}`}>{task.assignee.initials || task.assignee.name || 'human'}</span>
          )}
          <span className={`${s.tag} ${s.tagType}`}>{task.type}</span>
        </div>
      </div>

      {/* Active job detail — ALWAYS visible for running/paused/review */}
      {isActive && job && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {/* Description (read-only) */}
          {task.description && (
            <div className={s.desc}><Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown></div>
          )}

          {/* QUEUED */}
          {jobStatus === 'queued' && (
            <div className={s.runMeta}>
              <span>Queued — waiting for worker to pick up...</span>
            </div>
          )}

          {/* RUNNING */}
          {jobStatus === 'running' && (
            <>
              {job.phases && job.phases.length > 0 && (
                <div className={s.phases}>
                  {job.phases.map((p, i) => (
                    <span key={p.name} className={s.phaseWrap}>
                      {i > 0 && <span className={s.arrow}>&rarr;</span>}
                      <span className={`${s.phase} ${s[`ph${cap(p.status)}`]} ${s[`pn${cap(p.name)}`] || ''}`}>
                        {p.name}
                      </span>
                    </span>
                  ))}
                  <span className={s.runStats}>
                    <span>attempt {job.attempt || 1}/{job.maxAttempts || 3}</span>
                    {elapsedText && <span className={s.elapsed}>{elapsedText}</span>}
                  </span>
                </div>
              )}
              {job.phases?.some(p => p.status === 'completed' && p.summary) && (
                <div className={s.stepSummaries}>
                  {job.phases
                    .filter(p => p.status === 'completed' && p.summary)
                    .map(p => (
                    <div key={p.name} className={s.stepSummary}>
                      <span className={s.stepName}>{p.name}</span> {p.summary}
                    </div>
                  ))}
                </div>
              )}
              {job.question && (
                <div className={s.retryBanner}>{job.question}</div>
              )}
              <LiveLogs jobId={job.id} footer={
                onTerminate && (
                  <button className="btn btnDanger btnSm" onClick={() => onTerminate(job.id)}>Terminate</button>
                )
              } />
            </>
          )}

          {/* PAUSED */}
          {jobStatus === 'paused' && (
            <>
              {job.question && <div className={s.question}>{job.question}</div>}
              {onReply && (
                <ReplyInput onReply={(answer) => onReply(job.id, answer)} />
              )}
            </>
          )}

          {/* REVIEW */}
          {jobStatus === 'review' && (
            <div className={s.reviewSection}>
              <TaskAttachments taskId={task.id} projectId={projectId} legacyImages={task.images} readOnly />
              {job.review?.changedFiles && (
                <div className={s.files}>
                  <span className={s.filesLabel}>Changed files</span>
                  {job.review.changedFiles.map(f => (
                    <code key={f} className={s.file}>{f}</code>
                  ))}
                </div>
              )}
              {job.review?.testsPassed === true && (
                <div className={s.checks}>
                  <span className={s.checkOk}>&#10003; Tests pass</span>
                </div>
              )}
              <div className={s.reviewActions}>
                {onApprove && (
                  <button className="btn btnSuccess btnSm" onClick={() => onApprove(job.id)}>Approve</button>
                )}
                {onRework && (
                  <button className="btn btnWarning btnSm" onClick={() => setShowRework(v => !v)} title="Give feedback and re-run the task">Rework</button>
                )}
                {onReject && (
                  <button className="btn btnDanger btnSm" onClick={() => onReject(job.id)} title="Undo all changes and reset the task">Reject</button>
                )}
              </div>
              {showRework && onRework && (
                <ReplyInput onReply={(answer) => { onRework(job.id, answer); setShowRework(false); }} placeholder="What should change?" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview: description only (visible when collapsed and NOT active) */}
      {!isActive && (!isExpanded || taskDone) && task.description && (
        <div className={s.preview}>
          <div className={s.previewDesc}>
            <Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown>
          </div>
        </div>
      )}

      {/* Done section -- no border separator */}
      {!isActive && isExpanded && taskDone && (jobStatus === 'done' || !job) && (
        <DoneDetail
          task={task}
          job={job}
          projectId={projectId}
          onUpdateTask={onUpdateTask}
          onRework={onRework}
          onMoveToBacklog={onMoveToBacklog}
          hideComments={hideComments}
          mentionMembers={mentionMembers}
        />
      )}

      {/* Expanded detail for non-active states (click to toggle) */}
      {!isActive && isExpanded && !taskDone && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {isFlowStep && (
            <FlowStepDetail
              task={task}
              metaItems={metaItems}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}

          {/* FAILED */}
          {!isFlowStep && jobStatus === 'failed' && job && (
            <div className={s.failedSection}>
              {job.phases && job.phases.length > 0 && (
                <div className={s.phases}>
                  {job.phases.map((p, i) => (
                    <span key={p.name} className={s.phaseWrap}>
                      {i > 0 && <span className={s.arrow}>&rarr;</span>}
                      <span className={`${s.phase} ${s[`ph${cap(p.status)}`]} ${s[`pn${cap(p.name)}`] || ''}`}>
                        {p.status === 'completed' && <span className={s.phaseCheck}>&#10003;</span>}
                        {p.name}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {job.question && <div className={s.errorMsg}>{job.question}</div>}
              <div className={s.failActions}>
                {onContinue && job.phases?.some(p => p.status === 'completed') && (() => {
                  const nextPhase = job.phases?.find(p => p.status !== 'completed');
                  return (
                    <button className="btn btnPrimary btnSm" onClick={() => onContinue(job.id)}>
                      Retry {nextPhase?.name || 'next step'}
                    </button>
                  );
                })()}
                {canRunAi && onRun && (!task.assignee || task.assignee.type === 'ai') && (
                  <button className="btn btnDanger btnSm" onClick={() => onRun(task.id)}>
                    Restart
                  </button>
                )}
                {onDeleteJob && (
                  <button className="btn btnGhost btnSm" onClick={() => onDeleteJob(job.id)}>
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )}

          {/* IDLE — no active job, task in backlog/todo */}
          {!isFlowStep && !isActive && !taskDone && jobStatus !== 'failed' && commentsData && (
            <IdleDetail
              task={task}
              canRunAi={canRunAi}
              isBacklog={isBacklog}
              projectId={projectId}
              onRun={onRun}
              onEdit={onEdit}
              onDelete={onDelete}
              onUpdateTask={onUpdateTask}
              metaItems={metaItems}
              hideComments={hideComments}
              prevTaskId={prevTaskId}
              mentionMembers={mentionMembers}
            />
          )}
        </div>
      )}
    </div>
  );
}
