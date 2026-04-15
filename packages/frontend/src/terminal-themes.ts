import type { ITheme } from '@xterm/xterm';

// macOS Terminal default ANSI colors (used by profiles that don't override them)
const MAC_DEFAULT_ANSI = {
  black: '#000000',
  red: '#990000',
  green: '#00a600',
  yellow: '#999900',
  blue: '#0000b2',
  magenta: '#b200b2',
  cyan: '#00a6b2',
  white: '#bfbfbf',
  brightBlack: '#666666',
  brightRed: '#e50000',
  brightGreen: '#00d900',
  brightYellow: '#e5e500',
  brightBlue: '#0000ff',
  brightMagenta: '#e500e5',
  brightCyan: '#00e5e5',
  brightWhite: '#e5e5e5',
} as const;

export const TERMINAL_THEMES = {
  'clear-dark': {
    label: 'Clear Dark',
    isDark: true,
    theme: {
      background: '#212733',
      foreground: '#e5e5e5',
      cursor: '#e5e5e5',
      selectionBackground: '#334d5e',
      black: '#35424b',
      red: '#b35547',
      green: '#6caa70',
      yellow: '#c4ab62',
      blue: '#6d95b3',
      magenta: '#bd7bcc',
      cyan: '#7bcacd',
      white: '#dde5eb',
      brightBlack: '#465c6c',
      brightRed: '#df6c59',
      brightGreen: '#78bd7d',
      brightYellow: '#e5c871',
      brightBlue: '#66b5ec',
      brightMagenta: '#d389e5',
      brightCyan: '#84dde0',
      brightWhite: '#e5eef5',
    } satisfies ITheme,
  },
  'clear-light': {
    label: 'Clear Light',
    isDark: false,
    theme: {
      background: '#ffffff',
      foreground: '#3a4850',
      cursor: '#919191',
      selectionBackground: '#e4ecf1',
      black: '#2c3740',
      red: '#b35547',
      green: '#6caa70',
      yellow: '#c4ab62',
      blue: '#5685a7',
      magenta: '#ac63bd',
      cyan: '#69c5c8',
      white: '#c1c8cc',
      brightBlack: '#506573',
      brightRed: '#df6c59',
      brightGreen: '#78bd7d',
      brightYellow: '#e5c871',
      brightBlue: '#48a1e1',
      brightMagenta: '#d389e5',
      brightCyan: '#77e1e5',
      brightWhite: '#d7e1e6',
    } satisfies ITheme,
  },
  pro: {
    label: 'Pro',
    isDark: true,
    theme: {
      background: '#000000',
      foreground: '#f4f4f4',
      cursor: '#5f5f5f',
      selectionBackground: '#525252',
      ...MAC_DEFAULT_ANSI,
    } satisfies ITheme,
  },
  homebrew: {
    label: 'Homebrew',
    isDark: true,
    theme: {
      background: '#000000',
      foreground: '#28fe14',
      cursor: '#38fe27',
      selectionBackground: '#0b2eed',
      ...MAC_DEFAULT_ANSI,
    } satisfies ITheme,
  },
  novel: {
    label: 'Novel',
    isDark: false,
    theme: {
      background: '#dfdac3',
      foreground: '#4c2e2d',
      cursor: '#3a2322',
      selectionBackground: '#b8b79c',
      ...MAC_DEFAULT_ANSI,
    } satisfies ITheme,
  },
  ocean: {
    label: 'Ocean',
    isDark: true,
    theme: {
      background: '#2b66c8',
      foreground: '#ffffff',
      cursor: '#ffffff',
      selectionBackground: '#2886ff',
      ...MAC_DEFAULT_ANSI,
    } satisfies ITheme,
  },
  dracula: {
    label: 'Dracula',
    isDark: true,
    theme: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    } satisfies ITheme,
  },
} as const;

export type TerminalThemeId = keyof typeof TERMINAL_THEMES;

export const DEFAULT_TERMINAL_THEME: TerminalThemeId = 'clear-dark';

export function getTerminalTheme(id: TerminalThemeId): ITheme {
  return TERMINAL_THEMES[id]?.theme ?? TERMINAL_THEMES[DEFAULT_TERMINAL_THEME].theme;
}

export function getTerminalThemeBackground(id: TerminalThemeId): string {
  return TERMINAL_THEMES[id]?.theme.background ?? TERMINAL_THEMES[DEFAULT_TERMINAL_THEME].theme.background!;
}
