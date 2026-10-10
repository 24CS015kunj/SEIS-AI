import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext();
const STORAGE_KEY = 'seis-theme';

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => getStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => {
      if (!getStoredTheme()) {
        setThemeState(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener?.('change', syncSystemTheme);
    return () => mediaQuery.removeEventListener?.('change', syncSystemTheme);
  }, []);

  const setTheme = useCallback((nextTheme) => {
    const resolvedTheme = typeof nextTheme === 'function' ? nextTheme(theme) : nextTheme;
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;

    setThemeState(resolvedTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, resolvedTheme);
    } catch {
      // localStorage can be unavailable in private or embedded contexts.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
    systemTheme: getSystemTheme(),
  }), [theme, setTheme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return { theme: 'dark', toggleTheme: () => {}, setTheme: () => {}, systemTheme: 'dark' };
  }
  return context;
}
