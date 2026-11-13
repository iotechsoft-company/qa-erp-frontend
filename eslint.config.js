import js from '@eslint/js'
import playwright from 'eslint-plugin-playwright'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules', 'playwright-report', 'test-results', 'blob-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Node scripts (hooks are plain .mjs, so no-undef applies)
    files: ['scripts/**/*.{mjs,js}', '*.config.{js,mjs}', 'eslint.config.js'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'warn',
      'playwright/prefer-web-first-assertions': 'error',
      // page-object methods ที่ขึ้นต้นด้วย expect* ถือเป็น assertion
      'playwright/expect-expect': ['warn', { assertFunctionPatterns: ['^expect', '\\.expect[A-Z]'] }],
    },
  },
)
