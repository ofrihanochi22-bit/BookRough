import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

/**
 * One flat config for both packages (CLAUDE.md §2: shared config across the repo).
 *
 * Type-aware linting is deliberately switched off. It requires a TypeScript
 * program per package and roughly triples lint time, and the rules it unlocks
 * overlap heavily with what `tsc --noEmit` already fails on in its own CI job.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'backend/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared rules, both packages.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // CLAUDE.md §4: console.log is banned in committed code. The backend logs
      // through Pino; the frontend surfaces errors through toasts. A deliberate
      // exception is written as an inline eslint-disable with a reason.
      'no-console': 'error',
      'no-debugger': 'error',
      // An unused variable is usually a leftover. A leading underscore marks the
      // ones that are structural — Express's unused `next`, an omitted key in a
      // rest-destructure.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Backend: Node globals, no DOM.
  {
    files: ['backend/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Frontend: browser globals, React rules.
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Tests: assertions carry the meaning, so a few rules relax.
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Must stay last: turns off every rule that would fight Prettier.
  prettier,
);
