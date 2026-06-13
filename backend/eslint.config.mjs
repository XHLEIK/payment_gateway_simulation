// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// This is the new ESLint flat config structure (v9+)
export default tseslint.config(
  {
    // Skip linting the config file itself to avoid bootstrapping issues
    ignores: ['eslint.config.mjs'],
  },
  
  // Standard ESLint rules for generic JS issues
  eslint.configs.recommended,
  
  // TypeScript rules that understand types (requires projectService below)
  ...tseslint.configs.recommendedTypeChecked,
  
  // Sets up eslint-plugin-prettier so style formatting checks are run during linting
  eslintPluginPrettierRecommended,
  
  {
    languageOptions: {
      globals: {
        // Expose Node globals (process, Buffer, etc.) and Jest globals (describe, test, expect)
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        // Autodetects the closest tsconfig.json to read type definitions
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  
  {
    // Override specific rules to keep local development productive
    rules: {
      // Sometimes an 'any' type is unavoidable, especially when parsing raw HTTP inputs
      '@typescript-eslint/no-explicit-any': 'off',
      
      // Floating promises can cause uncaught errors at runtime, so we warn on them
      '@typescript-eslint/no-floating-promises': 'warn',
      
      // Warn when passing loose typed variables into typed arguments
      '@typescript-eslint/no-unsafe-argument': 'warn',
      
      // Enforce auto-end-of-line style to avoid cross-OS git checkouts (Windows CRLF vs Linux LF) throwing errors
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
