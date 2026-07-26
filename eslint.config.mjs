/**
 * Flat ESLint config.
 *
 * Next 16 dropped the `next lint` wrapper, so the project now calls `eslint`
 * directly and has to own the config that the wrapper used to generate.
 * Build output and the generated standalone artifact are excluded — linting
 * them reports thousands of findings in code nobody edits.
 */
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      'node_modules/**',
      'artifact/**',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // eslint-plugin-react-hooks 6 promoted the React Compiler diagnostics to
      // errors. They fire ~55 times across components written before the rule
      // existed — reading `ref.current` in render and seeding state from an
      // effect. None of them is a live defect, so they stay visible as warnings
      // rather than either failing the build or being silenced outright.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
