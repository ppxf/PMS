# @pms/config

PMS monorepo 的公共工程配置包，集中维护 ESLint、Prettier 和 TypeScript 规则。

## NestJS 应用引用方式

```js
// eslint.config.mjs
import { createNestEslintConfig } from '@pms/config/eslint/nest';

export default createNestEslintConfig({
  tsconfigRootDir: import.meta.dirname,
});
```

```js
// prettier.config.mjs
export { default } from '@pms/config/prettier';
```

```json
{
  "extends": "@pms/config/typescript/nest.json"
}
```

应用仍需直接安装 `eslint`、`prettier` 和 `typescript`，公共包负责规则及插件依赖。
