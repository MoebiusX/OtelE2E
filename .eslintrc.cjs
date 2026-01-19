module.exports = {
  root: true,
  ignorePatterns: [
    'scripts/**',
    'tests/**',
    'payment-processor/**',
    'tailwind.config.ts',
    'postcss.config.js',
    'vite.config.ts',
    'vitest.config.ts',
  ],
  env: {
    node: true,
    es2021: true,
    browser: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/strict-boolean-expressions': 'warn',
    'import/order': ['warn', { 'newlines-between': 'always' }],
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
