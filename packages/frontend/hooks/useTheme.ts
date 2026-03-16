import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'findasale_theme';
const CONTRAST_KEY = 'findasale_contrast';

function applyTheme(theme: Theme, highContrast: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  if (highContrast) {
    root.classList.add('high-contrast');
  } else {
    root.classList.remove('high-contrast');
  }
}

export function useTheme() {
  // Initialize with 'system' to avoid hydration mismatch — actual value applied in useEffect
  const [theme, setThemeState] = useState<Theme>('system');
  const [highContrast, setHighContrastState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read from localStorage only on client
    const stored = (localStorage.getItem(THEME_KEY) as Theme) || 'system';
    const storedContrast = localStorage.getItem(CONTRAST_KEY) === 'true';
    setThemeState(stored);
    setHighContrastState(storedContrast);
    setMounted(true);
    applyTheme(stored, storedContrast);

    // Listen for system preference changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current = (localStorage.getItem(THEME_KEY) as Theme) || 'system';
      const contrast = localStorage.getItem(CONTRAST_KEY) === 'true';
      applyTheme(current, contrast);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    applyTheme(newTheme, highContrast);
  }, [highContrast]);

  const setHighContrast = useCallback((enabled: boolean) => {
    setHighContrastState(enabled);
    localStorage.setItem(CONTRAST_KEY, String(enabled));
    applyTheme(theme, enabled);
  }, [theme]);

  // resolvedTheme: what's actually showing (resolves 'system' to 'light' or 'dark')
  const resolvedTheme: 'light' | 'dark' = (() => {
    if (!mounted) return 'light';
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  })();

  return { theme, setTheme, resolvedTheme, highContrast, setHighContrast, mounted };
}
