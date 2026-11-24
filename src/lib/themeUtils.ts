import type { LoginBgPreset, ThemeAccentId, UiDensity, WcAppConfig } from '../types/waliconnect';

export interface ThemeAccentOption {
  id: ThemeAccentId;
  label: string;
  swatchHex: string;
  palette: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
    950: string;
  };
}

export const THEME_ACCENTS: ThemeAccentOption[] = [
  {
    id: 'blue',
    label: 'Royal Blue',
    swatchHex: '#2563eb',
    palette: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
  },
  {
    id: 'indigo',
    label: 'Indigo Akademik',
    swatchHex: '#4f46e5',
    palette: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b',
    },
  },
  {
    id: 'emerald',
    label: 'Zamrud Sekolah',
    swatchHex: '#059669',
    palette: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
      950: '#022c22',
    },
  },
  {
    id: 'teal',
    label: 'Teal Harmoni',
    swatchHex: '#0d9488',
    palette: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6',
      600: '#0d9488',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
      950: '#042f2e',
    },
  },
  {
    id: 'violet',
    label: 'Ungu Kreatif',
    swatchHex: '#7c3aed',
    palette: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
      950: '#2e1065',
    },
  },
  {
    id: 'rose',
    label: 'Merah Marun',
    swatchHex: '#e11d48',
    palette: {
      50: '#fff1f2',
      100: '#ffe4e6',
      200: '#fecdd3',
      300: '#fda4af',
      400: '#fb7185',
      500: '#f43f5e',
      600: '#e11d48',
      700: '#be123c',
      800: '#9f1239',
      900: '#881337',
      950: '#4c0519',
    },
  },
  {
    id: 'amber',
    label: 'Emas Prestasi',
    swatchHex: '#d97706',
    palette: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03',
    },
  },
  {
    id: 'slate',
    label: 'Grafit Minimalis',
    swatchHex: '#334155',
    palette: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#334155',
      700: '#1e293b',
      800: '#0f172a',
      900: '#0f172a',
      950: '#020617',
    },
  },
];

export const LOGIN_BG_PRESETS: {
  id: LoginBgPreset;
  label: string;
  lightGradient: string;
  darkGradient: string;
  orb1Light: string;
  orb2Light: string;
  orb1Dark: string;
  orb2Dark: string;
}[] = [
  {
    id: 'ice_blue',
    label: 'Ice Blue Klasik',
    lightGradient: 'linear-gradient(135deg, #eef4ff 0%, #dbe6fa 55%, #e6eefc 100%)',
    darkGradient: 'linear-gradient(135deg, #0b1120 0%, #111c36 55%, #0f172a 100%)',
    orb1Light: 'bg-blue-200/70',
    orb2Light: 'bg-sky-200/70',
    orb1Dark: 'bg-blue-900/30',
    orb2Dark: 'bg-indigo-900/25',
  },
  {
    id: 'emerald_mint',
    label: 'Emerald Mint Segar',
    lightGradient: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 52%, #e0f2fe 100%)',
    darkGradient: 'linear-gradient(135deg, #041d18 0%, #0a2e26 55%, #0f172a 100%)',
    orb1Light: 'bg-emerald-200/70',
    orb2Light: 'bg-teal-200/70',
    orb1Dark: 'bg-emerald-900/30',
    orb2Dark: 'bg-teal-900/25',
  },
  {
    id: 'indigo_dusk',
    label: 'Indigo Senja Elegan',
    lightGradient: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 50%, #f3e8ff 100%)',
    darkGradient: 'linear-gradient(135deg, #0d0b24 0%, #1b1742 55%, #111827 100%)',
    orb1Light: 'bg-indigo-200/70',
    orb2Light: 'bg-purple-200/70',
    orb1Dark: 'bg-indigo-900/35',
    orb2Dark: 'bg-purple-900/25',
  },
  {
    id: 'warm_slate',
    label: 'Abu Hangat Netral',
    lightGradient: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 55%, #fef3c7 100%)',
    darkGradient: 'linear-gradient(135deg, #090d16 0%, #18181b 55%, #1e293b 100%)',
    orb1Light: 'bg-amber-200/60',
    orb2Light: 'bg-slate-300/70',
    orb1Dark: 'bg-amber-900/20',
    orb2Dark: 'bg-slate-800/40',
  },
];

export function getAccentOption(id?: ThemeAccentId): ThemeAccentOption {
  return THEME_ACCENTS.find((t) => t.id === id) ?? THEME_ACCENTS[0];
}

export function getLoginBgPreset(id?: LoginBgPreset) {
  return LOGIN_BG_PRESETS.find((p) => p.id === id) ?? LOGIN_BG_PRESETS[0];
}

export function applyAppTheme(config: WcAppConfig) {
  const root = document.documentElement;
  const accent = getAccentOption(config.theme_accent);
  (Object.keys(accent.palette) as unknown as (keyof typeof accent.palette)[]).forEach((shade) => {
    root.style.setProperty(`--color-blue-${shade}`, accent.palette[shade]);
  });
  root.setAttribute('data-ui-density', config.ui_density || 'comfortable');

  const appName = config.app_name?.trim() || 'WaliConnect Pro';
  const schoolName = config.school_name?.trim();
  document.title = schoolName ? `${appName} — ${schoolName}` : appName;
}

export function getDensityClasses(density?: UiDensity) {
  return density === 'compact' ? 'text-[13px]' : '';
}
