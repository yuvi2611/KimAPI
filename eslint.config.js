'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'scratch/**', 'coverage/**'] },
  js.configs.recommended,

  // Server, tests and tooling: Node (CommonJS)
  {
    files: ['server.js', 'src/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', ecmaVersion: 2023, globals: globals.node },
  },

  // Browser code: native ES modules (no build step)
  {
    files: ['public/js/**/*.js'],
    ignores: ['public/js/login.js'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2023, globals: globals.browser },
  },
  // The sign-in page script is a classic script (loaded without type="module")
  {
    files: ['public/js/login.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2023, globals: globals.browser },
  },

  {
    rules: {
      // Intentionally empty catch blocks must say why (a comment), which this rule allows.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
