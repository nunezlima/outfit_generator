// Tema claro / oscuro / según el sistema (preferencia local de este dispositivo).

import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'guardarropa:theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice = read()): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141210' : '#f6f3ee');
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(read);
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(theme);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  return [
    theme,
    (t) => {
      try {
        localStorage.setItem(KEY, t);
      } catch {
        /* sin almacenamiento: solo esta sesión */
      }
      setTheme(t);
    },
  ];
}
