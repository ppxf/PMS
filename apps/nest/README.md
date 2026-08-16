# PMS Nest API

NestJS 11 HTTP API 基础项目，作为 PMS monorepo 中的后端应用。

## 已接入能力

- `@nestjs/config`：全局配置、`.env` 加载与启动时环境变量校验
- `@nestjs/typeorm`：PostgreSQL 数据库模块，支持实体自动发现
- 全局 `ValidationPipe`：DTO 转换、白名单过滤、拒绝未知参数
- 全局异常过滤器：统一错误结构并隐藏未知内部异常细节
- 全局响应拦截器：统一普通 JSON 成功响应结构
- 日志模块：应用日志和 HTTP 请求耗时日志
- Swagger：默认访问 `/api/docs`
- Helmet：设置常用 HTTP 安全响应头
- `@pms/config`：复用 monorepo 公共 ESLint、TypeScript 和 Prettier 规则

## 本地运行

```bash
cp .env.example .env
pnpm start:dev
```

默认端口为 `3000`，健康检查地址为 `GET /api`。数据库默认关闭，因此没有
PostgreSQL 服务时也可以启动。需要数据库时，将 `DB_ENABLED` 设置为 `true` 并
填写连接信息。生产环境必须保持 `DB_SYNCHRONIZE=false`，数据库结构应使用迁移管理。

## 响应约定

普通成功响应：

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-08-16T08:00:00.000Z"
}
```

错误响应：

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Bad Request",
  "error": "Bad Request",
  "timestamp": "2026-08-16T08:00:00.000Z",
  "path": "/api/example"
}
```

`StreamableFile`、Node 可读流、SSE、附件、二进制响应、204 和已发送的原生响应
不会被包装。对于使用 `@Res()`、重定向或其他特殊协议的处理器，请添加
`@SkipResponseWrap()`：

```ts
import { SkipResponseWrap } from './common/decorators/skip-response-wrap.decorator';

@SkipResponseWrap()
@Get('download')
download() {
  // Return StreamableFile or manage the response directly.
}
```

## 质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```
