import s from './Header.module.css';

interface Props {
  projectName: string;
  milestone: { name: string; tasksDone: number; tasksTotal: number };
  notifications: number;
  userInitials: string;
}

export function Header({ projectName, milestone, notifications, userInitials }: Props) {
  return (
    <header className={s.bar}>
      <div className={s.left}>
        <span className={s.logo}>CodeSync</span>
        <span className={s.sep}>/</span>
        <button className={s.project}>{projectName} <span className={s.caret}>&#9662;</span></button>
      </div>
      <div className={s.right}>
        <span className={s.milestone}>{milestone.name} &middot; {milestone.tasksDone}/{milestone.tasksTotal}</span>
        <button className={s.icon}>
          {notifications > 0 && <span className={s.dot} />}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </button>
        <span className={s.avatar}>{userInitials}</span>
      </div>
    </header>
  );
}
