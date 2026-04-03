'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  // Ciclo: claro → oscuro → sistema → claro
  const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
  const currentTheme = (theme as 'light' | 'dark' | 'system') || 'system';
  const currentIndex = themes.indexOf(currentTheme);
  const nextTheme = themes[(currentIndex + 1) % themes.length];

  // El ícono refleja el tema AL QUE VAS a pasar (el next)
  const iconMap: Record<string, React.ReactNode> = {
    dark: (
      // Luna: al hacer clic pasás a oscuro
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    ),
    system: (
      // Monitor: al hacer clic pasás a sistema
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
    light: (
      // Sol: al hacer clic pasás a claro
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
  };

  const ariaLabels: Record<string, string> = {
    light: 'Cambiar a modo claro',
    dark: 'Cambiar a modo oscuro',
    system: 'Usar tema del sistema',
  };

  const themeLabels: Record<string, string> = {
    light: 'claro',
    dark: 'oscuro',
    system: 'sistema',
  };

  const handleClick = () => {
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabels[nextTheme]}
      title={`Tema actual: ${themeLabels[currentTheme]}. Clic para ${ariaLabels[nextTheme].toLowerCase()}`}
      className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition"
    >
      <span className="text-gray-600 dark:text-[#39ff14]">
        {iconMap[nextTheme]}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Tema cambiado a {themeLabels[nextTheme]}
      </span>
    </button>
  );
}
