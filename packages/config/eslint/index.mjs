import eslint from '@eslint/js';
import pluginVitest from '@vitest/eslint-plugin';
import { withVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import skipFormatting from 'eslint-config-prettier/flat';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

/**
 * Creates the shared ESLint flat config used by every application.
 *
 * @param {{ rootDir: string }} options
 */
export function createEslintConfig({ rootDir }) {
  return withVueTs(
    { rootDir },
    {
      ignores: [
        '**/dist/**',
        '**/dist-ssr/**',
        '**/coverage/**',
        '**/.turbo/**',
      ],
    },
    eslint.configs.recommended,
    ...pluginVue.configs['flat/essential'],
    vueTsConfigs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: {
          ...globals.browser,
          ...globals.node,
          ...globals.jest,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
      },
    },
    {
      ...pluginVitest.configs.recommended,
      files: [
        '**/src/**/__tests__/*.{ts,tsx}',
        '**/src/**/*.{test,spec}.{ts,tsx}',
      ],
    },
    {
      files: ['**/src/components/ui/**/*.vue'],
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
    skipFormatting,
  );
}
