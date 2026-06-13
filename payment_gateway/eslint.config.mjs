import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Standard ESLint configuration for Next.js (v15+) flat config structure.
const eslintConfig = defineConfig([
  // Core Web Vitals checks (recommends optimizations for performance/SEO)
  ...nextVitals,
  
  // Next.js TypeScript-specific rules
  ...nextTs,
  
  // Exclude built outputs from being linted during dev builds
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
