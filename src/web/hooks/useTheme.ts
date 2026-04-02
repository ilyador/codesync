import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('codesync-theme') as Theme) || 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('codesync-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  return { theme, toggle };
}
