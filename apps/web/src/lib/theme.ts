export type Theme = 'light' | 'dark' | 'system';

export const THEME_LABELS: Record<Theme, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
};

export const THEME_ICONS: Record<Theme, string> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};
