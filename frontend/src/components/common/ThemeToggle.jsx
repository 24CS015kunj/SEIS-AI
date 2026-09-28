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
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-200 cursor-pointer ${
        isDark
          ? 'bg-slate-800/80 border-slate-700/80 text-amber-300 hover:bg-slate-700/80 hover:text-amber-200 shadow-xs'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
      } ${className}`}
    >
      {isDark ? (
        <Sun size={15} className="transition-transform duration-200 rotate-0 hover:rotate-45" />
      ) : (
        <Moon size={15} className="transition-transform duration-200 rotate-0 hover:-rotate-12" />
      )}
    </button>
  );
}
