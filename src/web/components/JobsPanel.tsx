import { useState } from 'react';
import s from './JobsPanel.module.css';

interface Job {
  id: string;
  title: string;
  type: string;
  description?: string;
  status: 'running' | 'paused' | 'review' | 'done';
  phases?: { name: string; status: string }[];
  currentPhase?: string;
  attempt?: number;
  maxAttempts?: number;
  elapsed?: string;
  filesBeingWorked?: string[];
  question?: string;
  review?: {
    filesChanged: number;
    testsPassed: boolean;
    linesAdded: number;
    linesRemoved: number;
    summary: string;
    changedFiles?: string[];
  };
  completedAgo?: string;
}

const labels: Record<string, string> = {
  running: 'Running',
  paused: 'Waiting',
  review: 'Review',
  done: 'Done',
};

export function JobsPanel({ jobs }: { jobs: Job[] }) {
  const [expanded, setExpanded] = useState<string | null>(jobs.find(j => j.status !== 'done')?.id || null);

  return (
    <section>
      <div className={s.header}>
        <span className={s.label}>Activity</span>
      </div>
      {jobs.map((job) => {
        const isOpen = expanded === job.id;
        const isDone = job.status === 'done';
        return (
          <div
            key={job.id}
            className={`${s.item} ${isDone ? s.done : ''} ${isOpen ? s.open : ''}`}
            onClick={() => setExpanded(isOpen ? null : job.id)}
          >
            <div className={s.row}>
              <span className={`${s.dot} ${s[`d_${job.status}`]}`} />
              <div className={s.rowText}>
                <span className={s.title}>{job.title}</span>
                <span className={s.sub}>
                  {job.status === 'running' && (
                    <>{job.currentPhase} &middot; attempt {job.attempt}/{job.maxAttempts} &middot; <strong>{job.elapsed}</strong></>
                  )}
                  {job.status === 'paused' && <span className={s.amber}>Needs your input</span>}
                  {job.status === 'review' && <>{job.review?.filesChanged} files changed &middot; +{job.review?.linesAdded} -{job.review?.linesRemoved}</>}
                  {job.status === 'done' && <>{job.completedAgo}</>}
                </span>
              </div>
              <span className={`${s.badge} ${s[`b_${job.status}`]}`}>{labels[job.status]}</span>
            </div>

            {isOpen && !isDone && (
              <div className={s.detail} onClick={e => e.stopPropagation()}>
                {job.description && <p className={s.desc}>{job.description}</p>}

                {job.phases && (
                  <div className={s.phases}>
                    {job.phases.map((p, i) => (
                      <span key={p.name} className={s.phaseWrap}>
                        {i > 0 && <span className={s.arrow}>&rarr;</span>}
                        <span className={`${s.phase} ${s[`ph_${p.status}`]}`}>{p.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                {job.status === 'running' && job.filesBeingWorked && (
                  <div className={s.files}>
                    <span className={s.filesLabel}>Working on</span>
                    {job.filesBeingWorked.map(f => <code key={f} className={s.file}>{f}</code>)}
                  </div>
                )}

                {job.status === 'paused' && job.question && (
                  <>
                    <div className={s.question}>{job.question}</div>
                    <ReplyInput />
                  </>
                )}

                {job.status === 'review' && job.review && (
                  <>
                    {job.review.changedFiles && (
                      <div className={s.files}>
                        <span className={s.filesLabel}>Changed files</span>
                        {job.review.changedFiles.map(f => <code key={f} className={s.file}>{f}</code>)}
                      </div>
                    )}
                    <div className={s.checks}>
                      <span className={s.checkOk}>&#10003; Tests pass</span>
                      <span className={s.checkOk}>&#10003; Architecture rules pass</span>
                    </div>
                    <div className={s.reviewActions}>
                      <button className={s.approve}>Approve &#9662;</button>
                      <button className={s.reject}>Reject &rarr; Backlog</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ReplyInput() {
  const [val, setVal] = useState('');
  return (
    <div className={s.replyRow}>
      <input className={s.input} value={val} onChange={e => setVal(e.target.value)} placeholder="Your answer..." />
      <button className={s.send}>Reply</button>
    </div>
  );
}
