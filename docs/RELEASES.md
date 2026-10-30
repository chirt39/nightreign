# Sites 发布记录

每次正式发布都要记录 Sites 版本与对应的 Git SHA。只记录已经成功保存并部署的版本；本地构建和未部署改动不能标记为线上版本。具体发布由工程与发布流程执行，GitHub push 不会自动更新 Sites。

## 已知基线

| Sites 版本 | Git SHA | 语料摘要 | 部署状态 | 回退版本 |
| --- | --- | --- | --- | --- |
| v41（项目恢复基线） | `783732f35b1554ef3233b7d73c1f3cb39963dc02` | 未记录 | 线上基线（以 Sites 控制台为准） | 未记录 |

## 新版本记录模板

发布成功后复制一行并填写：

| Sites 版本 / 版本 ID | Git SHA | 敌人／词条等静态数据摘要 | RAG 语料 SHA-256 | 部署 URL 与日期 | 回退版本 ID |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

发布前需确保变更来自已合并并验收的提交。发布完成后，将 Sites 返回的版本 ID、对应 Git SHA、语料文件 `backend/knowledge_base/nightreign_knowledge.jsonl` 的 SHA-256、部署地址和上一个可回退版本填入表中。不要把尚未发布的工作树或 API 密钥写入记录。

## 阿里云正式站点

| 部署日期 | Git SHA | 正式入口 | 后端镜像 | 健康状态 | TLS 续期 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-30 | `219771cf03375723c69a777fd918ca25dfd382c2`（PR [#6](https://github.com/chirt39/nightreign/pull/6)） | [nightreign.cn](https://nightreign.cn) / [www.nightreign.cn](https://www.nightreign.cn) | `nightreign-ai:219771cf`，镜像 ID `sha256:cca846d8ae2c6865e33ca5e20832bfcd844bcc3d124c3108365f4f5c3059a760` | `/api/health` 与 `/api/knowledge/status` 均为 200；源语料及 Chroma 索引各 5,349 条 | Let's Encrypt，证书到期日 2027-01-28；`certbot.timer` 已启用，续期 dry-run 成功 |

此站由 Nginx 提供静态文件并反向代理 API。证书部署 hook 位于 `/etc/letsencrypt/renewal-hooks/deploy/nightreign-reload-nginx`；私钥仅保存在 `/etc/letsencrypt`。部署使用现有持久化 Chroma 数据，没有重建或迁移索引。

回退材料均在服务器目录 `/home/admin/nightreign-backups/pre-release-b949e7b-20261030`：上一版后端容器为已停止的 `nightreign-api-rollback-57628eb`，镜像标签 `nightreign-ai:57628eb`；原始运行时镜像另存为 `nightreign-ai:rollback-b949e7b`。一致性数据快照为 `local-data.tar.gz`（SHA-256 `afdfcf96984f87de2f0cfab407ac400f728e7b807765ad9e19358fd2c92dc18f`），旧静态发布包为 `previous-server-dist.tar.gz`。当前静态发布目录是 `/var/www/nightreign/releases/219771cf03375723c69a777fd918ca25dfd382c2`，上一版目录是 `/var/www/nightreign/releases/57628eb8493d158e5865fce299f3dba4b0b7d51a`；Nginx 通过 `/var/www/nightreign/current` 指向活动版本。
