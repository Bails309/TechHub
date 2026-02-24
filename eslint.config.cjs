const { resolve } = require('path');

module.exports = [
  {
    ignores: ['node_modules/**', '.next/**', 'dist/**'],
  },
  {
    // Language / parser settings to support TypeScript + JSX
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        project: [resolve(__dirname, './tsconfig.json')],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      next: require('eslint-plugin-next'),
    },
    rules: {
      // Disable Next.js image rule for cases where <img> is intentional (blob preview, same-origin)
      '@next/next/no-img-element': 'off',
      // keep other defaults; project-specific rules can be added here
    },
  },
];
