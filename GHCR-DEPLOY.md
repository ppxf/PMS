# GHCR 部署

1. 确认 ECS 为 x86_64，deploy 可以操作 Docker 并 git fetch 源码。
2. 在 main 手动运行 Sync runtime images to GHCR，同步 PostgreSQL、Redis。仅首次或明确升级时运行，生产可用 digest 固定基础镜像。
3. 在 GitHub Packages 确认部署账号可读四个包，工作流可写。
4. 服务器以 deploy 执行 docker login ghcr.io -u YOUR_USER，密码使用具有 read:packages 的 classic PAT；组织 SSO 需授权。
5. 根目录 .env.production 从示例复制，填写真实凭据和域名。IMAGE_PREFIX 使用 ghcr.io/小写owner，两个基础镜像地址与同步任务一致。文件权限 600。
6. ECS 完整拉取基础镜像以验证 GHCR 下载。
7. Secrets 配置 DEPLOY_HOST、DEPLOY_PORT、DEPLOY_USER=deploy、DEPLOY_SSH_KEY、DEPLOY_KNOWN_HOSTS；Variables 配置 DEPLOY_PATH=/opt/pms/repo。独立核验 SSH 主机公钥。
8. 推送 main，Actions 构建并推送 API、Web，使用完整 SHA 标签；成功后 SSH 部署，拉取镜像、备份数据库、迁移、更新并检查健康。

手工生产命令必须先 export PMS_IMAGE_TAG=目标完整SHA。deploy.sh 自动设置标签。ECS 不再构建，不需要 pnpm。记录在 .deploy/current-release、previous-release；备份在 .deploy/backups，应另行规划异地备份。

检查使用 Compose ps、logs 和 curl -I http://127.0.0.1:8080。

保留历史镜像。回滚前确认数据库兼容，在部署锁保护下使用目标提交的 Compose 和 SHA，仅更新 API、Web；不自动撤销迁移，不运行 down -v。HTTPS 仍由宿主机 Nginx 管理。
