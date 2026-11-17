import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/', 'logs/', 'data/', 'auth_cache/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-control-regex': 'off',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'smart'],
    },
  },
  {
    // Behavior pack BDS : exécuté par le moteur de script Minecraft
    files: ['bds-pack/**/*.js'],
    languageOptions: { globals: { console: 'readonly' } },
  },
]
