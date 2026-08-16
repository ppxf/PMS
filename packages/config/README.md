# @pms/config

PMS monorepo 的公共工程配置包，集中维护所有应用共用的 ESLint、TypeScript 和 Prettier 基线，不按 Vue、Nest、Node 或浏览器拆分公共入口。

## ESLint

```js
import { createEslintConfig } from '@pms/config/eslint';

export default createEslintConfig({
  rootDir: import.meta.dirname,
});
```

统一配置会根据文件类型处理 TypeScript、Vue SFC 与测试文件；应用不需要选择框架专用配置。

## TypeScript

```json
{
  "extends": "@pms/config/typescript"
}
```

严格模式等通用规则由公共包维护。DOM 库、Node 模块模式、装饰器、路径别名和输出目录等运行环境差异留在各应用自己的 `tsconfig` 中。

## Prettier

```js
export { default } from '@pms/config/prettier';
```

应用仍直接安装并执行 `eslint`、`prettier` 和 `typescript`，公共包负责统一规则与相关插件。
