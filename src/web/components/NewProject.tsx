import { useState } from 'react';
import s from './NewProject.module.css';

interface Props {
  onCreate: (name: string) => Promise<void>;
}

export function NewProject({ onCreate }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onCreate(name.trim());
    setLoading(false);
  }

  return (
    <div className={s.container}>
      <h1 className={s.title}>Create your first project</h1>
      <p className={s.subtitle}>A project maps to a codebase on your machine.</p>
      <form className={s.form} onSubmit={handleSubmit}>
        <input
          className={s.input}
          type="text"
          placeholder="Project name (e.g., HOABot)"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          autoFocus
        />
        <button className={s.submit} type="submit" disabled={loading || !name.trim()}>
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </div>
  );
}
