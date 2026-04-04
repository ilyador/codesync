import { useState } from 'react';
import s from './ArtifactConnector.module.css';
import { useArtifacts } from '../hooks/useArtifacts';
import { getFileIcon } from '../lib/file-utils';

interface Props {
  taskId: string;  // The producing task's ID
}

export function ArtifactConnector({ taskId }: Props) {
  const { artifacts, loading } = useArtifacts(taskId);
  const [expanded, setExpanded] = useState(false);
  const hasFiles = !loading && artifacts.length > 0;

  return (
    <div className={s.connector}>
      <div className={s.line} />
      <button
        className={`${s.icon} ${hasFiles ? s.iconActive : ''}`}
        onClick={hasFiles ? () => setExpanded(!expanded) : undefined}
        title={hasFiles ? `${artifacts.length} file${artifacts.length > 1 ? 's' : ''}` : 'File chain'}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {hasFiles && <span className={s.count}>{artifacts.length}</span>}
      </button>
      {expanded && hasFiles && (
        <div className={s.fileList}>
          {artifacts.map(a => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className={s.fileItem}>
              <span className={s.fileIcon}>{getFileIcon(a.mime_type)}</span>
              <span className={s.fileName}>{a.filename}</span>
            </a>
          ))}
        </div>
      )}
      <div className={s.line} />
    </div>
  );
}
