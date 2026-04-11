import {
  FileText, FileCode2, FileJson, FileType, Image, FileTerminal,
  Braces, Hash, Cog, FileCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// --------------- File Icon Mapping ---------------

export const EXT_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  // Code
  ts: { icon: FileCode2, color: 'text-blue-400' },
  tsx: { icon: FileCode2, color: 'text-blue-400' },
  js: { icon: FileCode2, color: 'text-yellow-400' },
  jsx: { icon: FileCode2, color: 'text-yellow-400' },
  mjs: { icon: FileCode2, color: 'text-yellow-400' },
  cjs: { icon: FileCode2, color: 'text-yellow-400' },
  cs: { icon: FileCode2, color: 'text-green-400' },
  py: { icon: FileCode2, color: 'text-blue-300' },
  rs: { icon: FileCode2, color: 'text-orange-400' },
  go: { icon: FileCode2, color: 'text-cyan-400' },
  java: { icon: FileCode2, color: 'text-red-400' },
  rb: { icon: FileCode2, color: 'text-red-400' },
  php: { icon: FileCode2, color: 'text-violet-400' },
  swift: { icon: FileCode2, color: 'text-orange-400' },
  kt: { icon: FileCode2, color: 'text-violet-400' },
  dart: { icon: FileCode2, color: 'text-cyan-400' },
  lua: { icon: FileCode2, color: 'text-blue-300' },
  r: { icon: FileCode2, color: 'text-blue-400' },
  scala: { icon: FileCode2, color: 'text-red-300' },
  // Data / config
  json: { icon: Braces, color: 'text-yellow-400' },
  jsonc: { icon: Braces, color: 'text-yellow-400' },
  yaml: { icon: FileText, color: 'text-red-300' },
  yml: { icon: FileText, color: 'text-red-300' },
  toml: { icon: FileText, color: 'text-orange-300' },
  xml: { icon: FileCode2, color: 'text-orange-300' },
  csv: { icon: FileText, color: 'text-green-300' },
  env: { icon: Cog, color: 'text-yellow-300' },
  // Web
  html: { icon: FileCode2, color: 'text-orange-400' },
  css: { icon: Hash, color: 'text-blue-300' },
  scss: { icon: Hash, color: 'text-pink-400' },
  less: { icon: Hash, color: 'text-blue-400' },
  svg: { icon: Image, color: 'text-amber-400' },
  // Docs
  md: { icon: FileType, color: 'text-blue-300' },
  mdx: { icon: FileType, color: 'text-blue-300' },
  txt: { icon: FileText, color: 'text-muted' },
  // Shell
  sh: { icon: FileTerminal, color: 'text-green-400' },
  bash: { icon: FileTerminal, color: 'text-green-400' },
  zsh: { icon: FileTerminal, color: 'text-green-400' },
  // Images
  png: { icon: Image, color: 'text-green-300' },
  jpg: { icon: Image, color: 'text-green-300' },
  jpeg: { icon: Image, color: 'text-green-300' },
  gif: { icon: Image, color: 'text-green-300' },
  webp: { icon: Image, color: 'text-green-300' },
  ico: { icon: Image, color: 'text-green-300' },
  // Lock / generated
  lock: { icon: FileCheck, color: 'text-faint' },
  // SQL
  sql: { icon: FileJson, color: 'text-blue-300' },
  // GraphQL
  graphql: { icon: FileCode2, color: 'text-pink-400' },
  gql: { icon: FileCode2, color: 'text-pink-400' },
};

export const NAME_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  dockerfile: { icon: FileTerminal, color: 'text-blue-400' },
  makefile: { icon: FileTerminal, color: 'text-orange-300' },
  '.gitignore': { icon: Cog, color: 'text-faint' },
  '.eslintrc': { icon: Cog, color: 'text-violet-400' },
  '.prettierrc': { icon: Cog, color: 'text-muted' },
};

export function getFileIcon(name: string): { icon: LucideIcon; color: string } {
  const lower = name.toLowerCase();
  if (NAME_ICONS[lower]) return NAME_ICONS[lower];
  const ext = lower.split('.').pop() ?? '';
  return EXT_ICONS[ext] ?? { icon: FileText, color: 'text-muted' };
}

// --------------- Language Detection ---------------

export const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  json: 'json', md: 'markdown', css: 'css', html: 'html',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  cs: 'csharp', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql',
  xml: 'xml', svg: 'xml', graphql: 'graphql',
  dockerfile: 'dockerfile',
  rb: 'ruby', php: 'php', kt: 'kotlin', swift: 'swift',
  lua: 'lua', r: 'r', dart: 'dart', scala: 'scala',
  scss: 'scss', less: 'less',
};

export function detectLanguage(filePath: string): string | undefined {
  const name = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  const ext = name.split('.').pop() ?? '';
  return EXT_TO_LANG[ext];
}
