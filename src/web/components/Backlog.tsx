import { useState } from 'react';
import s from './Backlog.module.css';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  blocked: boolean;
  blockedBy?: string;
  assignee: { type: string; initials?: string };
}

export function Backlog({ tasks, onAddTask }: { tasks: Task[]; onAddTask?: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section>
      <div className={s.header}>
        <span className={s.label}>Backlog</span>
        <span className={s.count}>{tasks.length}</span>
      </div>
      <div className={s.list}>
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`${s.item} ${task.blocked ? s.blockedItem : ''} ${expanded === task.id ? s.expanded : ''}`}
            onClick={() => setExpanded(expanded === task.id ? null : task.id)}
          >
            <div className={s.row}>
              <span className={s.handle}>&#8942;</span>
              <span className={s.title}>{task.title}</span>
              {task.blocked && <span className={s.tag + ' ' + s.tagRed}>blocked</span>}
              {task.mode === 'human' && <span className={s.tag + ' ' + s.tagGray}>human</span>}
              <span className={s.tag + ' ' + s.tagLight}>{task.type}</span>
            </div>
            {expanded === task.id && (
              <div className={s.detail} onClick={e => e.stopPropagation()}>
                {task.description && <p className={s.desc}>{task.description}</p>}
                <div className={s.detailMeta}>
                  <span>effort: {task.effort}</span>
                  <span>mode: {task.mode}</span>
                  {task.blockedBy && <span>blocked by: {task.blockedBy}</span>}
                  <span>assignee: {task.assignee.type === 'ai' ? 'AI' : task.assignee.initials}</span>
                </div>
              </div>
            )}
          </div>
        ))}
        <div className={s.addRow} onClick={onAddTask}>+ Add task</div>
      </div>
    </section>
  );
}
