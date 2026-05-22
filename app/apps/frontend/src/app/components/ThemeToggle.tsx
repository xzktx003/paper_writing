import React, { useEffect, useState } from 'react';

export type ThemeName = 'light' | 'primer-dark' | 'dracula' | 'cyber-tech';

export const THEMES: { value: ThemeName; label: string; swatch: string }[] = [
  { value: 'cyber-tech', label: '⚡ 赛博科技', swatch: '#00e5ff' },
  { value: 'light', label: 'Basic Light', swatch: '#4f6ef7' },
  { value: 'primer-dark', label: 'GitHub Dark', swatch: '#2f81f7' },
  { value: 'dracula', label: 'Dracula', swatch: '#bd93f9' },
];

function isThemeName(value: string | null): value is ThemeName {
  return THEMES.some((theme) => theme.value === value);
}

function getInitialTheme(): ThemeName {
  const saved = localStorage.getItem('paper-writer-theme');
  if (isThemeName(saved)) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'primer-dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('paper-writer-theme', theme);
  }, [theme]);

  const setNamedTheme = (nextTheme: ThemeName) => setTheme(nextTheme);
  const toggle = () => setTheme(t => t === 'light' ? 'primer-dark' : 'light');

  return { theme, toggle, setTheme: setNamedTheme };
}

export function ThemeToggle({
  theme,
  onThemeChange,
}: {
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
}) {
  const current = THEMES.find((item) => item.value === theme) || THEMES[0];

  return (
    <label
      style={{
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        borderRadius: '6px',
        padding: '3px 7px',
        cursor: 'pointer',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--text)',
        minWidth: 132,
      }}
      title="Select theme"
    >
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: current.swatch,
          boxShadow: `0 0 12px ${current.swatch}`,
          flexShrink: 0,
        }}
      />
      <select
        value={theme}
        onChange={(event) => onThemeChange(event.target.value as ThemeName)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: 12,
          fontWeight: 600,
          outline: 'none',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        {THEMES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
