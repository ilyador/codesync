import { useEffect, useRef, useState } from 'react';
import { useComments } from '../hooks/useComments';
import { timeAgo } from '../lib/time';
import type { MentionMember } from './task-card-types';
import s from './TaskCard.module.css';

export function TaskComments({
  taskId,
  projectId,
  mentionMembers = [],
}: {
  taskId: string;
  projectId?: string;
  mentionMembers?: MentionMember[];
}) {
  const data = useComments(taskId, projectId);
  return <TaskCommentsView data={data} mentionMembers={mentionMembers} />;
}

export function TaskCommentsView({
  data,
  mentionMembers = [],
}: {
  data: ReturnType<typeof useComments>;
  mentionMembers?: MentionMember[];
}) {
  const { comments, addComment, removeComment } = data;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = mentionQuery !== null
    ? mentionMembers.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(body);
      setText('');
      setMentionQuery(null);
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    } finally {
      setSending(false);
    }
  };

  const insertMention = (name: string) => {
    const input = inputRef.current;
    if (!input) return;
    const cursor = input.selectionStart || 0;
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx < 0) return;
    const after = text.slice(cursor);
    setText(before.slice(0, atIdx) + `@${name} ` + after);
    setMentionQuery(null);
    setTimeout(() => {
      const newPos = atIdx + name.length + 2;
      input.focus();
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const adjustHeight = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [text]);

  const handleChange = (val: string) => {
    setText(val);
    const cursor = inputRef.current?.selectionStart || val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIdx(0);
      return;
    }
    setMentionQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionMatches.length > 0 && mentionQuery !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx(i => Math.min(i + 1, mentionMatches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionMatches[mentionIdx].name);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className={s.commentsSection}>
      <div className={s.commentsHeader}>
        <span className={s.commentsTitle}>Comments</span>
        {comments.length === 0 && (
          <span className={s.commentsEmpty}>No comments yet</span>
        )}
      </div>
      {comments.map(c => (
        <div key={c.id} className={s.comment}>
          <span className={s.commentAvatar}>{c.profiles?.initials || '??'}</span>
          <div className={s.commentBody}>
            <span className={s.commentText}>{c.body}</span>
            <span className={s.commentTime}>{timeAgo(c.created_at)}</span>
          </div>
          <button
            className={s.commentDelete}
            onClick={() => {
              void removeComment(c.id);
            }}
            title="Delete comment"
          >&times;</button>
        </div>
      ))}
      <div className={s.commentComposerWrap}>
        {mentionMatches.length > 0 && (
          <div className={s.mentionMenu}>
            {mentionMatches.map((m, i) => (
              <div
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m.name);
                }}
                className={`${s.mentionItem} ${i === mentionIdx ? s.mentionItemActive : ''}`}
              >
                <span className={s.mentionAvatar}>{m.initials}</span>
                {m.name}
              </div>
            ))}
          </div>
        )}
        <div className={s.commentComposer}>
          <textarea
            ref={inputRef}
            rows={1}
            className={s.commentInput}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (@mention)"
            disabled={sending}
          />
          <button
            className={`btn btnPrimary btnSm ${s.commentSend}`}
            onClick={() => {
              void handleSend();
            }}
            disabled={sending || !text.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
