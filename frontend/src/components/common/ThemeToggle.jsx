import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className={`relative inline-flex h-8 w-[68px] cursor-pointer items-center rounded-lg border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] p-0.5 text-[var(--seis-text-muted)] transition-all duration-200 hover:border-[var(--seis-cyan)] hover:shadow-[0_0_0_2px_var(--seis-cyan-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--seis-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--seis-canvas)] ${className}`}
    >
      {/* Sliding pill */}
      <span
        className={`absolute top-0.5 h-[26px] w-[30px] rounded-md bg-[var(--seis-surface-1)] shadow-sm transition-transform duration-200 ${
          isDark ? 'translate-x-[32px]' : 'translate-x-0'
        }`}
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}
      />
      {/* Sun */}
      <span
        className={`relative z-10 flex h-[26px] w-[30px] items-center justify-center rounded-md transition-colors duration-150 ${
          !isDark ? 'text-[var(--seis-cyan)]' : 'text-[var(--seis-text-muted)]'
        }`}
      >
        <Sun size={13} strokeWidth={2.5} />
      </span>
      {/* Moon */}
      <span
        className={`relative z-10 flex h-[26px] w-[30px] items-center justify-center rounded-md transition-colors duration-150 ${
          isDark ? 'text-[var(--seis-cyan)]' : 'text-[var(--seis-text-muted)]'
        }`}
      >
        <Moon size={13} strokeWidth={2.5} />
      </span>
    </button>
  );
}
