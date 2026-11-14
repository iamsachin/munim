import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/test-results', '**/playwright-report', 'design'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  { languageOptions: { parserOptions: { projectService: true } } },
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
);
