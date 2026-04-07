import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { updateArtifactContent } from '../lib/api';
import { FilePreviewContext, type PreviewFile } from './filePreviewContext';
import { FilePreviewModal } from './FilePreviewModal';
import { isPreviewable } from './file-preview-utils';

export function FilePreviewProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PreviewFile | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const textRef = useRef('');
  const canceledRef = useRef(false);

  const preview = useCallback((nextFile: PreviewFile) => {
    if (isPreviewable(nextFile.mime_type)) {
      setFile(nextFile);
      setEditing(false);
      setDirty(false);
      return;
    }

    window.open(nextFile.url, '_blank');
  }, []);

  const close = useCallback(() => {
    setFile(null);
    setEditing(false);
    setDirty(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!file?.id || saving) return;
    setSaving(true);
    try {
      await updateArtifactContent(file.id, textRef.current);
      setDirty(false);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save artifact:', err);
    } finally {
      setSaving(false);
    }
  }, [file?.id, saving]);

  const handleCancelEdit = useCallback(() => {
    canceledRef.current = true;
    setEditing(false);
    setDirty(false);
    setContentKey(key => key + 1);
  }, []);

  const handleTextChange = useCallback((text: string) => {
    textRef.current = text;
    if (canceledRef.current) {
      canceledRef.current = false;
      return;
    }
    if (editing) setDirty(true);
  }, [editing]);

  useEffect(() => {
    if (!file) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [file, close]);

  return (
    <FilePreviewContext.Provider value={{ preview }}>
      {children}
      {file && (
        <FilePreviewModal
          file={file}
          editing={editing}
          dirty={dirty}
          saving={saving}
          contentKey={contentKey}
          onClose={close}
          onStartEdit={() => setEditing(true)}
          onSave={handleSave}
          onCancelEdit={handleCancelEdit}
          onTextChange={handleTextChange}
        />
      )}
    </FilePreviewContext.Provider>
  );
}
