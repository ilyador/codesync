import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatFileSize } from '../lib/file-utils';
import s from './FilePreview.module.css';

interface PreviewFile {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes?: number;
}

interface FilePreviewContextValue {
  preview: (file: PreviewFile) => void;
}

const FilePreviewContext = createContext<FilePreviewContextValue>({ preview: () => {} });

export function useFilePreview() {
  return useContext(FilePreviewContext);
}

const PREVIEWABLE = [
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/json',
  'application/pdf',
];

function isPreviewable(mime: string): boolean {
  return PREVIEWABLE.some(p => mime.startsWith(p));
}

function PreviewContent({ file }: { file: PreviewFile }) {
  const { mime_type: mime, url, filename } = file;
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isText = mime.startsWith('text/') || mime === 'application/json';
    if (!isText) return;
    setLoading(true);
    fetch(url)
      .then(r => r.text())
      .then(t => { setText(t); setLoading(false); })
      .catch(() => { setText('Failed to load file'); setLoading(false); });
  }, [url, mime]);

  // Images
  if (mime.startsWith('image/')) {
    return <img src={url} alt={filename} className={s.previewImage} />;
  }

  // Video
  if (mime.startsWith('video/')) {
    return <video src={url} controls className={s.previewVideo} />;
  }

  // Audio
  if (mime.startsWith('audio/')) {
    return (
      <div className={s.audioWrap}>
        <div className={s.audioIcon}>&#9835;</div>
        <div className={s.audioName}>{filename}</div>
        <audio src={url} controls className={s.previewAudio} />
      </div>
    );
  }

  // PDF
  if (mime === 'application/pdf') {
    return <iframe src={url} className={s.previewPdf} title={filename} />;
  }

  // Markdown
  if (mime === 'text/markdown' || filename.endsWith('.md')) {
    if (loading) return <div className={s.loading}>Loading...</div>;
    return (
      <div className={s.previewMarkdown}>
        <Markdown remarkPlugins={[remarkGfm]}>{text || ''}</Markdown>
      </div>
    );
  }

  // JSON
  if (mime === 'application/json') {
    if (loading) return <div className={s.loading}>Loading...</div>;
    let formatted = text || '';
    try { formatted = JSON.stringify(JSON.parse(formatted), null, 2); } catch {}
    return <pre className={s.previewCode}>{formatted}</pre>;
  }

  // Other text
  if (mime.startsWith('text/')) {
    if (loading) return <div className={s.loading}>Loading...</div>;
    return <pre className={s.previewCode}>{text || ''}</pre>;
  }

  return null;
}

export function FilePreviewProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PreviewFile | null>(null);

  const preview = useCallback((f: PreviewFile) => {
    if (isPreviewable(f.mime_type)) {
      setFile(f);
    } else {
      window.open(f.url, '_blank');
    }
  }, []);

  const close = useCallback(() => setFile(null), []);

  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [file, close]);

  return (
    <FilePreviewContext.Provider value={{ preview }}>
      {children}
      {file && (
        <div className={s.overlay} onClick={close}>
          <div className={s.modal} onClick={e => e.stopPropagation()}>
            <div className={s.header}>
              <div className={s.headerInfo}>
                <span className={s.filename}>{file.filename}</span>
                {file.size_bytes ? <span className={s.size}>{formatFileSize(file.size_bytes)}</span> : null}
              </div>
              <div className={s.headerActions}>
                <a href={file.url} download={file.filename} className={s.downloadBtn} title="Download">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
                <button className={s.closeBtn} onClick={close}>&times;</button>
              </div>
            </div>
            <div className={s.body}>
              {isPreviewable(file.mime_type) ? (
                <PreviewContent file={file} />
              ) : (
                <div className={s.unsupported}>
                  <div className={s.unsupportedIcon}>&#128196;</div>
                  <div className={s.unsupportedText}>Preview not available for this file type</div>
                  <a href={file.url} download={file.filename} className="btn btnPrimary">Download file</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </FilePreviewContext.Provider>
  );
}
