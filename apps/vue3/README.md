# PMS Vue CMS

Vue 3 管理后台基础框架，使用 Vite、TypeScript、Tailwind CSS v4 与 shadcn-vue。

## 技术栈

- Vue 3、Vue Router、Pinia
- Tailwind CSS v4、shadcn-vue、Reka UI、Lucide Vue
- TanStack Vue Query、TanStack Vue Table
- VeeValidate、Zod
- Axios、VueUse
- Vitest、Vue Test Utils、ESLint、Oxlint、Prettier

## 启动

项目要求 Node.js 22.18+ 或 24.12+，仓库使用 pnpm。

```bash
pnpm install
pnpm --dir apps/vue3 dev
```

质量检查：

```bash
pnpm --dir apps/vue3 typecheck
pnpm --dir apps/vue3 lint
pnpm --dir apps/vue3 test
pnpm --dir apps/vue3 build
```

## 目录边界

```text
src/
├─ app/                    # 应用级 Provider 与 Query Client
├─ components/
│  ├─ ui/                 # shadcn-vue 原子组件源码
│  ├─ forms/              # VeeValidate 表单封装
│  ├─ data-table/         # TanStack Table 通用封装
│  └─ layout/             # 管理后台布局
├─ features/               # 按业务能力组织页面、API、模型
├─ router/                 # 路由记录、Meta 类型和集中守卫
├─ services/http/          # Axios、解包、错误和认证注入
└─ styles/                 # Tailwind v4 和设计 Token
```

组件与 Store 不直接调用 Axios。每个业务模块在自己的 `features/<name>/api`
中调用 `http`，并在边界上将 DTO 转换成内部模型。

## API 请求

Nest 后端成功响应会被自动从 `{ success, data, timestamp }` 解包，
错误会统一转换成 `AppError`。

```ts
import { http } from '@/services/http'

const user = await http.get<User>('/users/1')
await http.post<User, CreateUserInput>('/users', input)
```

设置本地 API 地址：

```bash
cp .env.example .env.local
```

只有以 `VITE_` 开头的变量会进入浏览器构建，不要在其中保存密钥。

## 登录会话

登录页调用 Nest 的 `POST /auth/login`，Access Token 与用户权限保存在浏览器 `localStorage`。刷新页面时会请求 `GET /auth/me` 校验 Token 并更新用户资料；Token 无效、过期或服务端返回 401 时会清除本地会话并返回登录页。

本地默认 API 地址为 `/api`。前后端分开部署时，在 `.env.local` 中配置：

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

## 权限控制

路由权限在 `RouteMeta.permissions` 中声明，由全局守卫处理：

```ts
meta: {
  title: '用户管理',
  requiresAuth: true,
  permissions: ['user:read'],
}
```

按钮权限使用指令：

```vue
<Button v-permission="'user:create'">新增用户</Button>
<Button v-permission="{ permissions: ['user:update'], behavior: 'disable' }">
  编辑
</Button>
```

前端权限只改善交互体验，后端仍必须执行真正的授权校验。

## 表单与表格

`AppFormField` 统一标签、描述、错误提示和 ARIA 关联；页面使用
VeeValidate 的 `useForm` 与 `toTypedSchema(z.object(...))`。

`DataTable` 统一加载、空数据、错误重试、排序、选择和客户端/服务端分页。
列定义使用项目导出的 `DataTableFeatures`，避免各页面重复配置 Table feature。
