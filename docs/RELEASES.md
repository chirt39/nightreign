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

### 伤害倍率与异常抗性图标静态发布（2026-10-30）

PR [#17](https://github.com/chirt39/nightreign/pull/17) 合并 SHA：`6d73b5e003b90f7f194fb6dcf45d15c9b3cb70a2`。从该提交 fresh build；新 bundle `index-C_Grs9yu.js` 的 SHA-256 为 `76370a9df3772b6030e5fcdbe87910b9e072d2d12a356d307d9351cf52ee95d3`，新增 14 个本地图标见 [ENEMY_ATTRIBUTE_ICONS.md](ENEMY_ATTRIBUTE_ICONS.md)。来源和许可状态按该清单记录，不代表许可已核实。

当前静态目录：`/var/www/nightreign/releases/6d73b5e003b90f7f194fb6dcf45d15c9b3cb70a2`；回退目录：`/var/www/nightreign/releases/746d874dd080da527b1843f37bd2a0a3a2ff57f9`。14 个 PNG 公网返回 200 且 MIME 为 `image/png`；既有怪物图片映射与缺图 SVG 保留。总控线上 UI 验收 18 处图标加载正常，骤死和核心属性无图标。health/knowledge 均为 200；后端仍运行 `nightreign-ai:219771cf`，数据库、`.env`、TLS 未变。

### 缺图占位静态发布（2026-10-30）

PR [#15](https://github.com/chirt39/nightreign/pull/15) 合并 SHA：`746d874dd080da527b1843f37bd2a0a3a2ff57f9`。全新构建 bundle 为 `index-C4il7fVS.js`（SHA-256 `89bd6ae9989a6e3fad92f45b78462880cca7888f9d6a0e41514f78a2f6fed6f4`）；占位 SVG `image-pending.svg`（SHA-256 `a7aedf3ee34d31c325121c18c9a023a899130ef2ef702b419198f588776ae51b`）。

当前静态目录：`/var/www/nightreign/releases/746d874dd080da527b1843f37bd2a0a3a2ff57f9`；回退目录：`/var/www/nightreign/releases/67c3697fc46f9ebead37ad17895d05bf6ce38b65`。占位 SVG 公网返回 200 且 MIME 为 `image/svg+xml`；现有 12 个映射／11 个唯一图片资源保留，另有 261 个缺图项显示占位，敌人数据为 1,683 行。线上 UI 验收已通过。后端仍运行 `nightreign-ai:219771cf`；数据库、`.env`、TLS 未变。

| 部署日期 | Git SHA | 正式入口 | 后端镜像 | 健康状态 | TLS 续期 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-30 | `219771cf03375723c69a777fd918ca25dfd382c2`（PR [#6](https://github.com/chirt39/nightreign/pull/6)） | [nightreign.cn](https://nightreign.cn) / [www.nightreign.cn](https://www.nightreign.cn) | `nightreign-ai:219771cf`，镜像 ID `sha256:cca846d8ae2c6865e33ca5e20832bfcd844bcc3d124c3108365f4f5c3059a760` | `/api/health` 与 `/api/knowledge/status` 均为 200；源语料及 Chroma 索引各 5,349 条 | Let's Encrypt，证书到期日 2027-01-28；`certbot.timer` 已启用，续期 dry-run 成功 |

此站由 Nginx 提供静态文件并反向代理 API。证书部署 hook 位于 `/etc/letsencrypt/renewal-hooks/deploy/nightreign-reload-nginx`；私钥仅保存在 `/etc/letsencrypt`。部署使用现有持久化 Chroma 数据，没有重建或迁移索引。

回退材料均在服务器目录 `/home/admin/nightreign-backups/pre-release-b949e7b-20261030`：上一版后端容器为已停止的 `nightreign-api-rollback-57628eb`，镜像标签 `nightreign-ai:57628eb`；原始运行时镜像另存为 `nightreign-ai:rollback-b949e7b`。一致性数据快照为 `local-data.tar.gz`（SHA-256 `afdfcf96984f87de2f0cfab407ac400f728e7b807765ad9e19358fd2c92dc18f`），旧静态发布包为 `previous-server-dist.tar.gz`。首次阿里云发布静态目录为 `/var/www/nightreign/releases/219771cf03375723c69a777fd918ca25dfd382c2`，初始回退目录为 `/var/www/nightreign/releases/57628eb8493d158e5865fce299f3dba4b0b7d51a`；Nginx 通过 `/var/www/nightreign/current` 指向活动版本。

### 反馈弹窗静态修复（2026-10-30）

PR [#8](https://github.com/chirt39/nightreign/pull/8) 合并 SHA：`a5b615f1035d932486ec67dc59ec38120d178df1`。此版本仅更新静态前端；`index.html` 引用新 bundle `assets/index-CaYnI2C0.js`（SHA-256 `710ec8c8ae3c7aafcf928914f17a9179527c48966475ca1218f78845ffc3c2a7`），入口 HTML SHA-256 为 `d232c1e8ff75941e6bd558496bedce70b05112967db795d1f09af4e232d9a34b`。发布目录为 `/var/www/nightreign/releases/a5b615f1035d932486ec67dc59ec38120d178df1`，旧 assets 保留以兼容缓存中的旧 HTML；上一静态版本目录仍保留在 `/var/www/nightreign/releases/219771cf03375723c69a777fd918ca25dfd382c2`。后端继续运行 `nightreign-ai:219771cf`，未重启或修改后端、数据、环境变量和 TLS 配置。

### 首批怪物详情配图静态发布（2026-10-30）

源码合并 SHA：`7bc5405aff17a0b6f040fa4d88981fbb321b5953`（数据 PR [#11](https://github.com/chirt39/nightreign/pull/11)，包含 UI PR [#10](https://github.com/chirt39/nightreign/pull/10)）。此版本从该 SHA 执行 `npm ci` 与生产构建，仅更新静态前端。`public/enemy-image-verified.json` 包含 12 个精确 ID 条目、11 个唯一的既有图片资源；没有测试 fixture。来源与许可状态沿用 [ENEMY_IMAGES.md](ENEMY_IMAGES.md)，未知项保持未知。

| 静态文件 | SHA-256 |
| --- | --- |
| `dist/index.html` | `19a0c45bd6de981596d7e3aa86ebc495489845d6a1a9e33c76b34b241e84825d` |
| `dist/assets/index-Cacxtmav.js` | `e7da81c343cf73c9706867bf418ae5295dab383279a7c3236ab055471425c710` |
| `dist/app.js` | `c07e4273acbb8674123c2b96a676b06b86fdc244073a843dcc97743b523179a8` |
| `dist/game-ui.css` | `3817592b2d63b239e8fbdce520e18d308f3cb278d88098ceb256d1e624cfd6d3` |
| `dist/enemy-image-verified.json` | `867fb446f64fbdafe412118ccede68f94a89b63653298c3168e1c470750f6494` |

产物位于 `/var/www/nightreign/releases/7bc5405aff17a0b6f040fa4d88981fbb321b5953`，上一静态版本 `/var/www/nightreign/releases/a5b615f1035d932486ec67dc59ec38120d178df1` 保留用于回退，旧 bundle 也继续保留以兼容缓存中的 HTML。公网直连验收首页、健康检查及 11 个唯一图片 URL 均返回 HTTP 200，图片响应非空；verified JSON 的构建哈希用于前端缓存版本。后端未变更或重启，仍运行 `nightreign-ai:219771cf`；数据库、`.env` 和 TLS 配置均未改动。

### 图鉴纠错与地点差异静态发布（2026-10-30）

代码 PR [#13](https://github.com/chirt39/nightreign/pull/13) 合并 SHA：`67c3697fc46f9ebead37ad17895d05bf6ce38b65`。该提交通过 `npm ci` 与生产构建，仅更新静态前端；差异面板比较当前敌人记录中可见的倍率、抗性、韧性与地点，不修改数据。纠错复用 `suggestion` 收件类型，以 `【图鉴纠错】` 前缀和当前敌人 ID／规范链接标记，不附对话上下文。

| 静态文件 | SHA-256 |
| --- | --- |
| `dist/index.html` | `d33612c45ecf7c92a7934de7d86cce3fb55d8c35c8834eb518e834326361fe7c` |
| `dist/assets/index-D9-U4rJj.js` | `9f0344aa64c8a55c0f3161f0e481123411ccee8403ebe37d6df65901bbf14b73` |
| `dist/app.js` | `414fc82918aa2c1e68eb5406cd8581fe8ad9560e5a11f682fb3691cf2517b133` |
| `dist/game-ui.css` | `f415512777a8fc0a3167b11312bdbf966a357863a9e2baf5b6d101dc46da60e1` |
| `dist/admin-feedback.html` | `9f071f7248ae31e9cf6a7a86fb42550c37f9e77dce94edf06b1433e2d55d7b5f` |
| `dist/enemy-image-verified.json`（沿用前版） | `867fb446f64fbdafe412118ccede68f94a89b63653298c3168e1c470750f6494` |

发布目录为 `/var/www/nightreign/releases/67c3697fc46f9ebead37ad17895d05bf6ce38b65`；前一静态版本 `/var/www/nightreign/releases/7bc5405aff17a0b6f040fa4d88981fbb321b5953` 保留用于回退。公网验收首页、脚本、样式、管理页、`/api/health` 与 `/api/knowledge/status` 均返回 200；知识源和 Chroma 各 5,349 条，敌人数据 1,683 行，12 个已核验图片条目对应 11 个唯一资源且均成功加载。纠错验收标记在收件箱只匹配一条 suggestion 记录，无邮箱或问答上下文。后端镜像仍为 `nightreign-ai:219771cf`，容器 ID `38e3b5f819c2a73957e54ae7ce867152ab96bc6181875c236f0af5e5568a7d58`，启动时间未变；数据库、`.env` 和 TLS 均未修改。
