import { useState, useRef, useEffect, useCallback } from 'react';
import { getSkills, type SkillInfo } from '../lib/api';
import { useSlashCommands } from '../hooks/useSlashCommands';
import s from './ReplyInput.module.css';

export function ReplyInput({ onReply, localPath }: { onReply: (answer: string) => void; localPath?: string }) {
  const [val, setVal] = useState('');
  const [sending, setSending] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const slash = useSlashCommands(skills);

  useEffect(() => {
    getSkills(localPath).then(setSkills).catch(() => {});
  }, [localPath]);

  const insertSkill = useCallback((skillName: string) => {
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const slashMatch = before.match(/(?:^|[\s])\/([a-zA-Z0-9_:-]*)$/);
    if (!slashMatch) return;
    const slashStart = before.length - slashMatch[0].length + (slashMatch[0].startsWith('/') ? 0 : 1);
    const prefix = val.substring(0, slashStart);
    const after = val.substring(cursor);
    const newVal = prefix + '/' + skillName + ' ' + after;
    setVal(newVal);
    slash.dismiss();
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        const pos = prefix.length + skillName.length + 2;
        el.selectionStart = el.selectionEnd = pos;
      }
    });
  }, [val, slash]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart ?? text.length;
    setVal(text);
    slash.handleTextChange(text, cursor);
  }, [slash]);

  const handleReply = async () => {
    if (!val.trim() || sending) return;
    setSending(true);
    try {
      await onReply(val.trim());
      setVal('');
      slash.dismiss();
    } catch { /* error handled by parent */ }
    finally { setSending(false); }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (slash.handleKeyDown(e, insertSkill)) return;
    if (e.key === 'Enter') handleReply();
  }, [slash, insertSkill, handleReply]);

  return (
    <div className={s.replyWrap}>
      <div className={s.replyRow}>
        <input
          ref={inputRef}
          className={s.replyInput}
          value={val}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => { setTimeout(() => slash.dismiss(), 150); }}
          placeholder="Your answer... (type / for skills)"
          disabled={sending}
        />
        <button className={s.replySend} onClick={handleReply} disabled={sending}>
          {sending ? 'Sending...' : 'Reply'}
        </button>
      </div>
      {slash.matches.length > 0 && (
        <div className={s.skillDropdown}>
          {slash.matches.map((sk, i) => (
            <div
              key={sk.name}
              className={`${s.skillItem} ${i === slash.selectedIdx ? s.skillItemActive : ''}`}
              onMouseDown={(e) => { e.preventDefault(); insertSkill(sk.name); }}
            >
              <span className={s.skillName}>/{sk.name}</span>
              {sk.description && <span className={s.skillDesc}>{sk.description}</span>}
              <span className={s.skillSource}>{sk.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
