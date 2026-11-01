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

### 敌人图片校正与导航图标静态发布（2026-10-30）

PR [#19](https://github.com/chirt39/nightreign/pull/19) 与 [#20](https://github.com/chirt39/nightreign/pull/20) 均按获批 head 合并，最终合并 SHA：`739f0c7b511a45a2405ca85a65f4158a7e6e1d8a`。从该提交执行 `npm ci` 与生产构建，仅更新静态前端：删除用户指定的随机突袭事件数据行 `46600010` 及其图片映射，并将效果／词条导航图标替换为 [effects-battle-record.png](NAVIGATION_ICON_SOURCES.md) 所记录的本地资源。

| 静态文件 | SHA-256 |
| --- | --- |
| `dist/index.html` | `b8eb4107147cbce86546373d566fbff66e4103b9dc422183e2fe6b78c93d6db4` |
| `dist/assets/index-CFvKm3Xh.js` | `dc6932bf8572907453852d5e0a247a21fbd0a754947c4492dbfb44d98fa111a2` |
| `dist/enemy-data.json` | `9c5080877d4382b30800d35fce64745156f513c110eb263b11af8fb66aae57f8` |
| `dist/enemy-image-map.json` | `eafcc439b48ec7253d5614f1494f9915271ccf8f33bef795028f59c0438c9b1f` |
| `dist/enemy-image-verified.json` | `60a0abb6dfc977b924bb37ad7c1ee2aaa520df5a6b1d3b4ae7e021ef91386395` |
| `dist/nav-icons/effects-battle-record.png` | `2d3ed152a60d3692f760c14bed0dd5afb386a4233f015227138ba696eacdd342` |

当前静态目录为 `/var/www/nightreign/releases/739f0c7b511a45a2405ca85a65f4158a7e6e1d8a`，回退目录 `/var/www/nightreign/releases/6d73b5e003b90f7f194fb6dcf45d15c9b3cb70a2` 保留。公网直连源站确认首页引用新 bundle、新图标返回 200 且 MIME 为 `image/png`，缺图 SVG 返回 200 且 MIME 为 `image/svg+xml`；敌人数据为 1,682 行且不含 `46600010`，图片映射不含该 ID，11 个已核验条目对应 11 个唯一图片资源。线上实体显示数为 272，其中 261 个仍显示缺图占位。`/api/health` 与 `/api/knowledge/status` 均返回 200，知识源与索引各 5,349 条。后端容器仍为 `nightreign-ai:219771cf`（容器 ID `38e3b5f819c2a73957e54ae7ce867152ab96bc6181875c236f0af5e5568a7d58`，启动时间 `2026-10-30T01:55:31.595111499Z`）；数据库、`.env`、TLS 与 AI 索引未变更。

### 敌人详情导航与属性标签静态发布（2026-10-31）

PR [#22](https://github.com/chirt39/nightreign/pull/22) 精确 head `2522ba8f26c46852af0638200f36e8781e125b03` 合并，合并 SHA：`af7b60654a7699ad5d3133dc00f787e4af4b8a67`。从合并提交执行 `npm ci` 与生产构建。`app.js` 与 `game-ui.css` 的版本哈希会注入 Vue bundle 和首页，所以发布更新以下四个静态文件；其余静态文件沿用上一发布目录，包括数据、图片和图标，旧 bundle 也保留以兼容缓存中的旧首页。

| 静态文件 | SHA-256 |
| --- | --- |
| `dist/index.html` | `09f9b1c346c87d1d2d88e85f344394eedf84152efb2f46af9c6d17fba3dcdb59` |
| `dist/assets/index-CgC5quq4.js` | `9d378bceff5309fe1636e8e1a52f61eac329730e06920337f357a2d8e9205cf8` |
| `dist/app.js` | `9bd62cc9f711413f37152b10d3abfff1895d7dc8cfe412583fc3ee47be861c8a` |
| `dist/game-ui.css` | `8feceee5446f0090b6f518c325c4cb06c748f6da87432829c0f89165cfd1a4a1` |

当前静态目录为 `/var/www/nightreign/releases/af7b60654a7699ad5d3133dc00f787e4af4b8a67`，回退目录 `/var/www/nightreign/releases/739f0c7b511a45a2405ca85a65f4158a7e6e1d8a` 保留。公网直连源站确认首页引用新 bundle，四个文件均返回 200 且响应哈希与构建产物一致；新 bundle 对应 `game-ui.css` 版本键 `8feceee5446f` 和 `app.js` 哈希前缀 `9bd62cc9f711`，上一版 bundle 仍可访问。UI 验收覆盖筛选结果内上一只／下一只、跨页定位和 URL 更新、首尾与单项／零项禁用、筛选及普通／永夜状态保留、刷新恢复，以及四项标签移除“承受·”而保留原数值、图标和数据。后端仍为 `nightreign-ai:219771cf`（容器 ID `38e3b5f819c2a73957e54ae7ce867152ab96bc6181875c236f0af5e5568a7d58`，启动时间未变）；数据库、`.env`、TLS 与 AI 索引未变更。

### 抗性显示项更正静态发布（2026-10-31）

PR [#24](https://github.com/chirt39/nightreign/pull/24) 精确 head `a43e5ea12c7e4a02fcc0ba8a6de56b0188960b79` 合并，合并 SHA：`91dbf541cd3fb6c117c56a59ebf87b6328528b76`。从该提交执行 `npm ci` 与生产构建。用户更正为：隐藏原字段 20..23 的显示标签（详情和差异表均隐藏，不删除底层数据），并将“物理普通”显示为“普通”、“猩红腐败”显示为“腐败”；其余显示数据保持。

| 实际更新的静态文件 | SHA-256 |
| --- | --- |
| `dist/index.html` | `25283853db426008838d8402e9e754f205488dd0ed5f4e37531367fb291c4b00` |
| `dist/assets/index-DzB8KekG.js` | `538eaac578442c125ef47b84d669545f64856d1d243f69c93e5d304265ffe6a7` |
| `dist/app.js` | `3ce348ad6cc5912ca5b5f880151bb9e10b5529cf12c65ab9e42df8ff17ed9e79` |

`dist/game-ui.css` 未变化，沿用 SHA-256 `8feceee5446f0090b6f518c325c4cb06c748f6da87432829c0f89165cfd1a4a1`；新首页继续使用版本键 `8feceee5446f`，新 bundle 内嵌 `app.js` 哈希前缀 `3ce348ad6cc5`。当前静态目录为 `/var/www/nightreign/releases/91dbf541cd3fb6c117c56a59ebf87b6328528b76`，回退目录 `/var/www/nightreign/releases/af7b60654a7699ad5d3133dc00f787e4af4b8a67` 保留；旧 bundle `index-CgC5quq4.js` 继续可访问。公网直连源站确认首页、新 bundle、`app.js`、未变化 CSS 与上一版 bundle 均返回 200，哈希与当前 release 相符。正式站 UI 验收确认 7 项抗性保留，差异候选为 38 项，字段 20..23 不出现在详情／差异表；其他数据、名称、图标和图片未改。后端仍为 `nightreign-ai:219771cf`（容器 ID `38e3b5f819c2a73957e54ae7ce867152ab96bc6181875c236f0af5e5568a7d58`，启动时间未变）；数据库、`.env`、TLS 与 AI 索引未变更。

### 敌人图鉴退役字段清理与知识库发布（2026-11-01）

数据 PR [#26](https://github.com/chirt39/nightreign/pull/26)、前端 PR [#27](https://github.com/chirt39/nightreign/pull/27) 和后端 PR [#28](https://github.com/chirt39/nightreign/pull/28) 完成后，对应发布代码 SHA：`bc8f6a8d0851ae5afc55d0fd7822097af47df438`。从该提交干净构建静态站点并部署后端与新版知识库。敌人数据现有 1,662 行、58 列，前端显示 254 个敌人实体组，差异候选从 38 项更新为 37 项。按批准范围删除 20 条敌人记录，并从全部剩余 1,662 行清空“出血承受率、冻伤承受率、催眠承受率、发狂承受率、韧性承受率”；详情、差异视图和 AI 语料均不再提供这些字段，其他属性与伤害倍率保留。11 个已核验图片条目及对应资源保持不变，已核验图片清单未变；全量敌人图片映射同步移除被删除 ID 的映射（包括 `40001020`）。前端同时新增固定按钮、取消图鉴大页脚、增加备案侧栏、调整两处文案并移除 QuickRef 外链。被删除的 20 个 ID 为：`75600110`、`46801010`、`43710020`、`43630400`、`46004080`、`43530130`、`40001020`、`43134030`、`75700010`、`75700020`、`75600010`、`43738130`、`43738030`、`21300010`、`43110020`、`75600130`、`43111320`、`75700030`、`75400010`、`75200010`。

新版语料与 Chroma 索引各 5,284 条，active collection 为 `nightreign_kb_a604700b2fd1b263`，嵌入模型 `text-embedding-v4`、512 维。迁移对 1,662 条变更后的敌人记录重新嵌入，按完全相同的嵌入文本复用了 3,622 条向量；新 collection 验证完成后才切换活动指针。旧语料 5,349 条中有 43 条敌人记录不在当时的源 JSON 中，这些历史残留也随重建清除。旧 collection `nightreign_kb_0a1c636e27834e91` 及旧运行容器保留。迁移前一致性快照位于 `/home/admin/nightreign-backups/pre-release-bc8f6a8d-20261101/local-data.tar.gz`，SHA-256 为 `e93900c321fcf9752f0695f332910dae07046c2434079a965e1fc212737134ac`；未删除 SQLite 对话、长期记忆或反馈记录。

静态发布目录为 `/var/www/nightreign/releases/bc8f6a8d0851ae5afc55d0fd7822097af47df438`，先前目录 `/var/www/nightreign/releases/91dbf541cd3fb6c117c56a59ebf87b6328528b76` 保留。公网直连源站响应与干净构建哈希一致：

| 静态文件 | SHA-256 |
| --- | --- |
| `index.html` | `ae89087881e8d7f9b14e22505a536e4dd72bf36501f806ab18363ad8d67818a4` |
| `assets/index-DZ_tnRlR.js` | `94364bac08e5902245a1ec52cb6b050451a92605c41031329c5912329ff8d60a` |
| `app.js` | `988ba8c01d0c47710ffd949ba567ce85d1c9188c41ae4b0b58a20aa20d637d49` |
| `game-ui.css` | `f953677ac7094b4efaa6bf52c6d60813cededa889c0407ffc6e954d6c72651d8` |
| `enemy-data.json` | `be833d24b9746bac8c3d102009d39841d8b538a3a081da77a69f529e8388e3e5` |
| `enemy-image-map.json` | `a435cdfaaacc1a5da07511bca87dd8b14f48a915739ac1e246388bcef0b8ddac` |
| `enemy-image-verified.json` | `60a0abb6dfc977b924bb37ad7c1ee2aaa520df5a6b1d3b4ae7e021ef91386395` |

发布时后端镜像 `nightreign-ai:bc8f6a8d`（镜像 ID `sha256:67da2ce5b21ddfd2bc87e9dccc536793cd1aa178be31f6ada3f1aa4392406e7a`）的容器 ID 为 `4cf0dcf1b0da8792126ab90572ab4804cceea0cef802bb4cb698262578d140aa`。健康与知识库状态均为 200，源语料和索引为 5,284 条；正式站图鉴、词条及建议弹窗由总控验收，截图保存在 `E:\海斗\tmp\enemy-cleanup-live-20261101.png`。

### 历史助手答案窄字段过滤热修复（2026-11-01）

PR [#29](https://github.com/chirt39/nightreign/pull/29) head `f5ea51c9b7f033c24409e87007d6c2a903311114`，合并 SHA：`4e0ba2820db1460229c78d7e0d4092d9c408d7d4`。修正精确字段标签匹配无法拦截“出血、冻伤、催眠、发狂的承受值均为……”这类旧助手答案的问题；只匹配五个退役字段名与“承受值／承受率”的组合，普通“承受火焰伤害”语义仍可进入上下文。补充了已保存会话和长期记忆 prompt 回归测试，`python -m unittest tests.test_ai_enemy_data_cleanup` 的 4 项测试通过。热修复只更新后端，不重建静态资源、Chroma collection 或向量。

当前后端镜像 `nightreign-ai:4e0ba282`（镜像 ID `sha256:4a154f3045c6435f9c142f64b6d1a1254c0926dd10c5b11fdc0570c24c2b110d`），容器 ID `5b2312526605d173dc81d46b9f1ab946bcdebba3b89f977316a7a7ca8265923a`。`/api/health` 和 `/api/knowledge/status` 返回 200，语料／索引仍各 5,284 条，活动 collection 仍为 `nightreign_kb_a604700b2fd1b263`。热修复前容器保留为 `nightreign-api-rollback-f5ea51c`（镜像 `nightreign-ai:bc8f6a8d`）。

最终热修复上线后进行的唯一一次真实 AI 验收，提问“黑剑敌人的出血、冻伤、催眠、发狂承受值各是多少？”。答复：“当前图鉴已不再提供出血、冻伤、催眠、发狂等异常状态的承受率数值，因此无法给出黑剑眷属这几项的具体承受值。可以确认的是：黑剑眷属（原野Boss与要塞楼顶Boss两个版本）在图鉴中出血、冻伤、催眠、发狂均标注为免疫。”答复没有提供退役字段的数值。

快速回退后端热修复：停止并改名当前 `nightreign-api`，将 `nightreign-api-rollback-f5ea51c` 改回 `nightreign-api` 后启动；无需更改活动 collection 指针。完整回退本次数据／静态发布时，后端回到 `nightreign-api-rollback-bc8f6a8d`（镜像标签 `nightreign-ai:rollback-bc8f6a8d`），活动指针改回 `/home/admin/nightreign/local-data/chroma/active_knowledge_collection.json` 中的旧 collection `nightreign_kb_0a1c636e27834e91`，并将 `/var/www/nightreign/current` 指回 `/var/www/nightreign/releases/91dbf541cd3fb6c117c56a59ebf87b6328528b76`。

### AI 对话限流与反馈可靠性（代码已实现，待总控审查与发布）

- AI 每 IP 滚动限额默认由 5 提升至 20 次／分钟；每日模型请求上限仍为 100。限流与每日额度响应返回由服务端计算的 `Retry-After`，并在 CORS 暴露该头。默认值和 `.env.example` 已更新；生产环境 `.env` 当前仍为 5，获准部署时需显式调整。
- 对话历史超过单条 1,200 字符时返回中文校验说明；反馈支持最多 10 轮上下文、总计最多 20,000 Unicode 字符，取消上下文时不持久化对话。新增 SQLite 可空 JSON 列为旧数据库做增量迁移，管理员列表兼容旧的单轮记录。保留 90 天反馈期限。
- AI 回答增加 `answer_format: "markdown"`，提示模型优先使用敌人弱点/倍率/抗性表格和遗物词条/效果/触发条件表格；来源未确认时不推断“无条件”。可验证敌人图仅在检索实体唯一、ID 精确一致且本地图像清单标为 verified 时返回本地 ID。
- 正常历史助手回答仍可用于连续追问；只过滤包含五个退役敌人字段的旧回答片段。无知识库重建、embedding 调用、线上数据迁移或部署。
- 针对性验证：`python -m unittest tests.test_ai_chat_feedback_reliability tests.test_ai_enemy_data_cleanup tests.test_request_size_limit tests.test_knowledge_status`（20 项通过；不调用真实模型或 embedding API）。
