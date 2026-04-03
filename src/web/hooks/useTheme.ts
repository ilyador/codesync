import { useState, useEffect, useRef, useCallback } from 'react';

type Theme = 'light' | 'dark';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('codesync-theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return getSystemTheme();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // Track whether the user has explicitly chosen a theme (vs following system)
  const isExplicit = useRef(!!localStorage.getItem('codesync-theme'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Listen for system preference changes -- only update when user hasn't explicitly chosen
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!isExplicit.current) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggle = useCallback(() => {
    setTheme(t => {
      const next = t === 'light' ? 'dark' : 'light';
      localStorage.setItem('codesync-theme', next);
      isExplicit.current = true;
      return next;
    });
  }, []);

  return { theme, toggle };
}
