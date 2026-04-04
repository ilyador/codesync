import { useState, useCallback } from 'react';
import type { SkillInfo } from '../lib/api';

interface SlashCommandState {
  query: string | null;
  selectedIdx: number;
  matches: SkillInfo[];
}

export function useSlashCommands(skills: SkillInfo[]) {
  const [state, setState] = useState<SlashCommandState>({
    query: null, selectedIdx: 0, matches: []
  });

  const handleTextChange = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|[\s\n])\/([a-zA-Z0-9_:-]*)$/);
    if (match) {
      const q = match[1].toLowerCase();
      const filtered = skills.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
      setState({ query: q, selectedIdx: 0, matches: filtered });
    } else {
      setState(prev => prev.query !== null ? { query: null, selectedIdx: 0, matches: [] } : prev);
    }
  }, [skills]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, insertFn: (name: string) => void) => {
    if (state.matches.length === 0 || state.query === null) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setState(prev => ({ ...prev, selectedIdx: Math.min(prev.selectedIdx + 1, prev.matches.length - 1) }));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setState(prev => ({ ...prev, selectedIdx: Math.max(prev.selectedIdx - 1, 0) }));
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertFn(state.matches[state.selectedIdx].name);
      setState({ query: null, selectedIdx: 0, matches: [] });
      return true;
    }
    if (e.key === 'Escape') {
      setState({ query: null, selectedIdx: 0, matches: [] });
      return true;
    }
    return false;
  }, [state]);

  const dismiss = useCallback(() => {
    setState({ query: null, selectedIdx: 0, matches: [] });
  }, []);

  return { ...state, handleTextChange, handleKeyDown, dismiss };
}
