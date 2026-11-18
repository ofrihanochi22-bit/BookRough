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

  // Backend: no raw SQL built from text (SQL injection audit, 2026-11-17).
  // `$queryRaw` / `$executeRaw` as tagged templates, and `Prisma.sql`, send
  // every value as a bound parameter; the Unsafe variants and `Prisma.raw`
  // splice text into the query. Tests may use them with fixed strings to reset
  // the test database, so they are left out.
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/test/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['$queryRawUnsafe', '$executeRawUnsafe'].map((property) => ({
          property,
          message:
            'Use the $queryRaw / $executeRaw tagged template, which binds every value as a parameter.',
        })),
        {
          object: 'Prisma',
          property: 'raw',
          message: 'Prisma.raw splices text into SQL. Use Prisma.sql with bound values instead.',
        },
      ],
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

  // User-facing copy: no em dash in a string, template or JSX text, so a
  // sentence reads as written by a person (improvement round, point 2). That is
  // the frontend, plus the backend layers whose AppError messages reach users
  // as toasts. Comments are not nodes, so they are untouched; tests are left
  // out because their names are not copy. The en dash stays allowed: ranges
  // ("2–40") and the "–/10" readout. This is the only no-restricted-syntax
  // block: flat config replaces a rule's options, so another block setting it
  // for these files would drop the guard; add its selectors here instead.
  {
    files: [
      'frontend/src/**/*.{ts,tsx}',
      'backend/src/{services,controllers,middleware,utils}/**/*.ts',
    ],
    ignores: ['**/*.test.{ts,tsx}', '**/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['Literal[value=/—/]', 'TemplateElement[value.cooked=/—/]', 'JSXText[value=/—/]'].map(
          (selector) => ({
            selector,
            message: 'User-facing copy uses no em dash: use a full stop, comma or colon.',
          }),
        ),
      ],
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

  // Hand-run Node scripts (frontend/scripts): Node globals, no DOM.
  {
    files: ['frontend/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Must stay last: turns off every rule that would fight Prettier.
  prettier,
);
