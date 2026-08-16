// @ts-check
import { createNestEslintConfig } from '@pms/config/eslint/nest';

export default createNestEslintConfig({
  tsconfigRootDir: import.meta.dirname,
});
