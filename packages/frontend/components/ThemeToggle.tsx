import React from 'react';
import { useTheme, Theme } from '../hooks/useTheme';

interface ThemeToggleProps {
  compact?: boolean; // true = icon-only for header, false = full row for Settings
}

const SunIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 3v2m0 14v2M3 12H1m22 0h-2M5.64 5.64l-1.42-1.42M19.78 19.78l-1.42-1.42M18.36 5.64l1.42-1.42M4.22 19.78l1.42-1.42M12 8a4 4 0 100 8 4 4 0 000-8z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const SystemIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const options: { value: Theme; label: string; Icon: React.FC }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark',  label: 'Dark',  Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: SystemIcon },
];

export default function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, setTheme, mounted } = useTheme();

  // Avoid hydration mismatch — render nothing until mounted
  if (!mounted) return null;

  if (compact) {
    // Cycle through light → dark → system
    const currentIndex = options.findIndex(o => o.value === theme);
    const next = options[(currentIndex + 1) % options.length];
    const CurrentIcon = options[currentIndex]?.Icon || SunIcon;

    return (
      <button
        onClick={() => setTheme(next.value)}
        className="p-2 rounded-md text-warm-500 dark:text-warm-300 hover:text-amber-600 hover:bg-warm-200 dark:hover:bg-warm-700 transition-colors"
        aria-label={`Switch to ${next.label} mode`}
        title={`Current: ${options[currentIndex]?.label}. Click for ${next.label}`}
      >
        <CurrentIcon />
      </button>
    );
  }

  // Full selector for Settings page
  return (
    <div className="flex gap-2" role="group" aria-label="Theme selection">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors min-w-touch ${
            theme === value
              ? 'border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-600'
              : 'border-warm-300 dark:border-warm-600 text-warm-600 dark:text-warm-300 hover:border-warm-400'
          }`}
          aria-pressed={theme === value}
        >
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}
