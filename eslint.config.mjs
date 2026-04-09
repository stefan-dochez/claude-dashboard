import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['**/dist/', '**/node_modules/', 'packages/electron/'] },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict rules for all packages
  ...tseslint.configs.strict,

  // Backend-specific
  {
    files: ['packages/backend/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Frontend-specific: React hooks + refresh
  {
    files: ['packages/frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Shared rule overrides
  {
    rules: {
      // Already enforced by TypeScript strict
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow empty catch blocks (common pattern in scanner/git operations)
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-empty-function': 'off',
      // Allow non-null assertions (used sparingly)
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Terminal output parsing uses ANSI escape sequences in regexes
      'no-control-regex': 'off',
    },
  },
);
