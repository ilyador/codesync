import { useState } from 'react';
import s from './TaskForm.module.css';

interface Milestone {
  id: string;
  name: string;
}

interface Props {
  milestones: Milestone[];
  onSubmit: (data: {
    title: string;
    description: string;
    type: string;
    mode: string;
    effort: string;
    milestone_id: string | null;
  }) => Promise<void>;
  onClose: () => void;
}

export function TaskForm({ milestones, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('feature');
  const [mode, setMode] = useState('ai');
  const [effort, setEffort] = useState('high');
  const [milestoneId, setMilestoneId] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      type,
      mode,
      effort,
      milestone_id: milestoneId || null,
    });
    setLoading(false);
    onClose();
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <h2 className={s.heading}>New task</h2>
        <form onSubmit={handleSubmit} className={s.form}>
          <input
            className={s.input}
            placeholder="Task title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            autoFocus
          />
          <textarea
            className={s.textarea}
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
          />
          <div className={s.row}>
            <div className={s.field}>
              <label className={s.label}>Type</label>
              <select className={s.select} value={type} onChange={e => setType(e.target.value)}>
                <option value="feature">feature</option>
                <option value="bug-fix">bug-fix</option>
                <option value="ui-fix">ui-fix</option>
                <option value="refactor">refactor</option>
                <option value="test">test</option>
                <option value="design">design</option>
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Mode</label>
              <select className={s.select} value={mode} onChange={e => setMode(e.target.value)}>
                <option value="ai">AI</option>
                <option value="human">Human</option>
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Effort</label>
              <select className={s.select} value={effort} onChange={e => setEffort(e.target.value)}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="max">max</option>
              </select>
            </div>
          </div>
          {milestones.length > 0 && (
            <div className={s.field}>
              <label className={s.label}>Milestone</label>
              <select className={s.select} value={milestoneId} onChange={e => setMilestoneId(e.target.value)}>
                <option value="">None</option>
                {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div className={s.actions}>
            <button className={s.submit} type="submit" disabled={loading || !title.trim()}>
              {loading ? 'Creating...' : 'Create'}
            </button>
            <button className={s.cancel} type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
