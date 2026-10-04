import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', '.matrix/', 'test/matrix/*/.pnp.*', 'test/matrix/*/.yarn/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // carried over from the tslint config
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/no-floating-promises': 'error',
      // the public API is typed with `any` in places (request locals, response bodies)
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['test/**/*.{cjs,mjs}', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
);
