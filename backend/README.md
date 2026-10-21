# DeepSeek 遗物配装 API

此服务提供黑夜君临游戏问答和受限遗物配装两个 API，不读取或保存原始 `.sl2` 文件。问答接口从本机 Chroma 检索资料，使用阿里云百炼 Qwen 向量 API 生成检索向量，再将命中的记录和问题发给 DeepSeek 生成回答；模型会在资料不足时追问，配装所需的角色、供具和范围也在对话中确认。配装接口只接收前端从本机存档解析出的遗物摘要、问题和已确认的角色供具槽位；后端会校验遗物类型、颜色、槽位与重复项。不要在不信任的网络上公开此服务。

## 本地 RAG 知识库

当前知识库以可审阅的 UTF-8 JSONL 为源语料，写入本机 Chroma，并将中文 BM25 词法检索与 Qwen 语义向量检索融合排序。向量由百炼 API 按需生成；服务端不加载 PyTorch 或本地 BGE 模型。生成器从仓库已有数据汇总敌人图鉴及伤害倍率、首领多人倍率、物品、遗物词条、遗物图鉴、角色和供具槽位、敌人图片映射。词条图鉴快照由 `scripts/sync_effect_encyclopedia.py` 从 NightreignQuickRef 的指定提交生成，分别保留局外、局内、深夜局外和深夜局内记录。项目架构、需求和旧决策文档不进入游戏问答检索；只收录 `docs/NIGHTREIGN_KNOWLEDGE.md` 中明确填写的手写游戏资料。发生冲突时结构化图鉴优先，手写资料只补充未收录内容。知识库覆盖当前仓库已收录的数据，不代表游戏内所有机制都已被完整记录；资料未收录时应明确说明。回答不会在末尾添加来源或依据尾注。

首次建立或更新索引时，知识库文本会发送给阿里云百炼以生成向量；每次语义检索及对话记忆写入也会发送相应问题文本。生成回答仍由 DeepSeek 处理。不要把密钥或不希望发送给这些服务的私人内容写入资料或提问。

修改上述来源资料后，在项目根目录重新生成语料并建立新索引：

```powershell
python -m backend.index_knowledge
```

查询 Chroma 索引状态及各类源记录数量：`GET http://127.0.0.1:8000/api/knowledge/status`。索引按语料和向量模型版本写入新集合，成功后再原子切换活动集合；旧集合保留以便回退。首次建索引及每次变更语料或向量模型后重建时，会调用百炼向量 API；请先检查免费额度和余额。超出百炼免费额度后是否停止调用，需在百炼控制台开启对应的额度用完即停选项。

手动补充游戏知识时，编辑 `docs/NIGHTREIGN_KNOWLEDGE.md`，每条资料写成一个 `## 标题` 小节，尽量包含明确名称、事实、游戏版本和可复核来源。此处的内容只补充图鉴未收录的事实，不能用来覆盖图鉴中的名称、分类、槽位和数值。保存后运行上面的索引命令。不要直接编辑生成的 JSONL 文件，因为下次生成会覆盖它。

Chroma 使用本地持久化目录，不需要单独启动数据库容器。运行：

```powershell
python -m pip install -r backend/requirements.txt
python -m backend.index_knowledge
```

Chroma 数据默认保存在 `local-data/chroma`，对话记录保存在 `local-data/agent_memory.sqlite3`。备份或迁移时需同时保留这两个目录；知识库也可由源 JSONL 重新建立。

当前采用进程内 `PersistentClient`，适合单机低流量部署并节省一份独立数据库服务的内存；不能让多个服务器进程共享同一个数据目录。Chroma 官方对生产环境建议使用服务端部署模式。若改为多进程、多副本或高并发，应迁移到独立 Chroma 服务及更充足的服务器资源。

## 对话记忆

每个浏览器在本地存储一个随机会话标识。FastAPI 将该会话的问答存入 SQLite，并在 Chroma 中建立语义记忆索引；默认只保留最近 5 轮完整问答（可用 `AGENT_MEMORY_MAX_EXCHANGES` 调整），更早的 SQLite 记录和对应 Chroma 记录会清理。提问时只检索仍保留的记忆。助手页面不提供手动清除按钮；原始存档和遗物库存不写入对话记忆。

`GET /api/health` 是 AI 服务就绪检查：要求知识库源语料可读且非空、Chroma 活动集合可用、索引记录数与源语料条数一致，并且 DeepSeek 生成 API Key 和百炼向量 API Key 均已配置；全部满足返回 HTTP 200，否则返回 HTTP 503 和逐项检查状态（`deepseek_api`、`dashscope_api`、`knowledge_source`、`chroma`）。该接口不调用 DeepSeek 或百炼，避免健康检查产生模型费用。`GET /api/knowledge/status` 可查看索引与源语料计数。

### RAG 检索评估

`backend/knowledge_base/evaluation_cases.jsonl` 保存可维护的检索评估问题和预期记录 ID。运行 `python -m backend.evaluate_knowledge_base --top-k 10` 会检索当前 Chroma 索引并输出 hit rate 与 MRR；尚未建立索引时会提示检查本地 Chroma 数据和百炼向量 API 配置。评估集当前只用于检索命中情况，不代表游戏资料已人工核验，也不能单独证明模型答案正确。新增或变更语料后，应核对对应预期记录 ID 是否仍有效，并把正式验收结果记录在 PR 中。

## 本地启动

1. 在项目根目录将 `.env.example` 复制为 `.env`，只在本机 `.env` 中填写 `DEEPSEEK_API_KEY` 和 `DASHSCOPE_API_KEY`。如果百炼控制台提供工作空间专属 API Host，将 `DASHSCOPE_BASE_URL` 改成控制台给出的 `compatible-mode/v1` 地址。两个 Key 均只保存在后端环境中。`DEEPSEEK_BASE_URL` 和 `DASHSCOPE_BASE_URL` 必须使用 HTTPS；HTTP 仅允许用于 localhost 或 loopback IP 的本地开发地址，其他配置会阻止后端启动。
2. 安装后端依赖：

   ```powershell
   python -m pip install -r backend/requirements.txt
   ```

3. 在项目根目录启动 API（PowerShell）：

   ```powershell
   Get-Content .env | ForEach-Object {
     if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
   }
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

4. 另开终端运行 `npm run dev -- --host 127.0.0.1 --port 4173`。Vite 会把 `/api` 转发到本地 FastAPI。

## 提问限制

- 对话每条消息限 2–400 字，仅接收黑夜君临相关主题；最多携带 8 条近期对话消息，不接收文件、图片或工具调用。确认配装条件后，提交给配装接口的问题合并后限 8–240 字。
- 每个客户端 IP 每分钟最多请求 5 次。配装请求最多 900 件遗物、6 个槽位和 40 条当前流派规则。
- 每个 HTTP 请求体最多 750,000 字节；服务端先检查声明长度，再按 ASGI 请求流累计实际字节数，超限返回 HTTP 413，只暂存上限内的数据，不累积超限后的剩余请求体。
- 所有 AI 接口共享同一客户端每分钟限流；默认全站每天最多发起 100 次 DeepSeek 请求（UTC 日界线重置），分别由 `AI_REQUESTS_PER_MINUTE` 和 `AI_REQUESTS_PER_DAY` 配置。计数保存在 `AGENT_MEMORY_DB` 的 SQLite 数据库中，单机多进程共享；多服务器部署需改用 Redis 等共享限流存储。
- Uvicorn 依赖范围为 `uvicorn[standard]>=0.30,<1.0`，没有锁定精确版本；Docker 构建会安装满足范围的版本。Uvicorn 默认已启用 `X-Forwarded-*` 解析，且默认只信任 `FORWARDED_ALLOW_IPS` 环境变量指定的来源或 `127.0.0.1`。Docker 启动命令显式启用该解析，并读取可选的 `FORWARDED_ALLOW_IPS`（逗号分隔的 IP/CIDR），默认值为 `127.0.0.1`。
- Ubuntu 上由同机 Caddy 代理到 loopback 地址时，使用 `FORWARDED_ALLOW_IPS=127.0.0.1`；若 Uvicorn 实际看到的代理地址是 `::1` 或容器网桥地址，应只配置该代理的准确地址/CIDR，并限制后端端口只能由该代理访问。Caddy 的 `reverse_proxy` 会生成/追加 `X-Forwarded-*`，默认忽略客户端传入的这些值，避免直接转发伪造值。不要设为 `*`，也不要信任任意公网来源。
- Render Web Service 的入口代理地址不等于 loopback。未把该代理加入可信列表时，Uvicorn 会忽略其 `X-Forwarded-For`，限流只能按入口代理地址计数，访客可能共享每分钟额度。Render 文档说明可从 `X-Forwarded-For` 读取原始客户端 IP（[Render DDoS 防护说明](https://render.com/articles/how-render-handles-ddos-attacks)），但部署前必须取得并核实适用于该服务的代理 IP/CIDR，再配置 `FORWARDED_ALLOW_IPS`；在可信地址可核实前不要使用通配符。若无法取得可信代理范围，就保留安全默认值并接受共享限流，或改为直接连接客户端的受支持拓扑。
- 请求次数上限不能精确限制人民币费用，实际花费仍取决于模型、输入长度和输出长度；还应在 DeepSeek 账户侧设置余额或预算提醒。CORS 只约束浏览器，不是 API 认证或防刷手段。
- 推荐方案必须引用本次清单中的遗物实例 ID，且通过后端和前端的类型、颜色、槽位合法性校验。用户点击“应用配装到装配预览”后才会改变浏览器内的装配预览。
- 对话记录按浏览器会话标识保存；后端不写入用户的存档或流派规则。DeepSeek API 使用量会按 DeepSeek 账户当前价格计费。

## 用户反馈收件箱

- 首页每条助手回答提供“回答有错？向窝反馈”，标题栏提供“向我提建议”。邮箱可留空；只有用户主动勾选“附上当前这一轮的问题与回答”时，浏览器才把这两个字段附在本次反馈中，不会发送整段历史。
- 提交接口为 `POST /api/feedback`；管理员收件箱接口为 `GET /api/admin/feedback`，使用 `Authorization: Bearer <口令>` 鉴权。管理员页面是前端静态地址 `/admin-feedback.html`，口令只保留在页面内存，不写 URL 或浏览器存储。
- 管理员收件箱和口令提交必须使用 HTTPS。公网 HTTP 部署仍可访问站点的只读功能，但收件箱页面会禁用登录，后端也会拒绝 HTTP 收件箱请求；本机 `localhost`、`127.0.0.1` 和 `[::1]` 的开发访问允许 HTTP，且后端要求连接客户端确实来自回环地址。有 `Origin` 请求头时，后端拒绝非 HTTPS 公网来源，只保留本机回环开发例外。
- 后端依据 ASGI `request.url.scheme` 判断 HTTPS，不直接读取应用层可伪造的 `X-Forwarded-Proto`。TLS 在受信任反向代理终止时，需按前述 `FORWARDED_ALLOW_IPS` 仅信任实际代理源地址，让 Uvicorn 生成正确的请求 scheme；不得使用 `*`。若代理未被列入 Uvicorn 信任范围，HTTPS 外部访问会被视为 HTTP 并遭拒绝，须先修正代理信任配置。
- 设置仅供后端使用的 `FEEDBACK_ADMIN_PASSWORD`，至少 32 个字符。可用 `python -c "import secrets; print(secrets.token_urlsafe(32))"` 生成随机口令，并只填写到本机 `.env` 或后端私密环境变量，不能提交到仓库或放入 `public/`。未配置或长度不足时，反馈提交和收件箱均返回服务不可用。
- 反馈和可选邮箱/问答保存在 `AGENT_MEMORY_DB` 的 SQLite 文件中，90 天后从活动数据库删除；服务运行时每小时清理一次，启动时也会清理过期项。将 `AGENT_MEMORY_DB` 放在权限受控的持久化磁盘上；停止服务期间到期的数据会在服务重新启动后清理。若平台另有磁盘快照或数据库备份，需为备份单独设置不超过 90 天的保留期。每个客户端每分钟最多提交 5 条。
- 若前端与 API 跨源部署，`FRONTEND_ORIGINS` 必须包含前端准确来源；CORS 已允许管理员使用的 `Authorization` 请求头。

## 容器部署

项目提供 `backend/Dockerfile`，可部署到支持 Docker 的 Python 服务平台。构建上下文使用项目根目录：

```powershell
docker build -t nightreign-ai -f backend/Dockerfile .
```

未来部署服务时需配置持久化磁盘、`CHROMA_PATH`、`AGENT_MEMORY_DB`、`AGENT_MEMORY_MAX_EXCHANGES`、`AI_REQUESTS_PER_MINUTE`、`AI_REQUESTS_PER_DAY`、`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`FRONTEND_ORIGINS` 和后端私密变量 `FEEDBACK_ADMIN_PASSWORD`，并在服务端运行一次索引命令。只有确认反向代理的源地址/CIDR 后才设置可选变量 `FORWARDED_ALLOW_IPS`。本机 Chroma 和 SQLite 数据不会自动迁移；也可将源语料复制到服务端后重建索引，这会调用百炼 API。服务监听平台注入的 `PORT`，健康检查地址为 `/api/health`。部署成功后，将服务的 HTTPS 根地址填入 `public/ai-config.js` 的 `window.NIGHTREIGN_AI_API_BASE`，重新构建并发布前端。每次 Sites 发布按 `docs/RELEASES.md` 记录 Git 提交 SHA、Sites 版本、语料摘要和回退版本；GitHub 推送本身不代表 Sites 已上线。

API 密钥只保存在 FastAPI 服务端，不能填入任何 `public/` 文件或前端构建产物。

当前频率与每日调用计数保存在 SQLite 中，适用于本地或共享同一持久化数据库的单机多进程部署。正式多服务器部署应使用共享限流存储（例如 Redis），并正确配置可信反向代理，避免所有访客被误认为同一客户端。

### 用 Render 部署后端（未来迁移）

1. 将后端代码、`backend/knowledge_base/` 和 `public/` 中的资料文件提交到 GitHub。不要提交 `.env` 或存档文件。
2. 在 Render 新建 **Web Service**，连接本项目 GitHub 仓库，选择 **Docker**，仓库根目录作为构建上下文，Dockerfile 路径设为 `backend/Dockerfile`。
3. 为 Chroma 和 `AGENT_MEMORY_DB` SQLite 数据库挂载持久化磁盘。在服务的私密环境变量中设置 `CHROMA_PATH`、`AGENT_MEMORY_DB`、`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`FRONTEND_ORIGINS` 和至少 32 字符的 `FEEDBACK_ADMIN_PASSWORD`。后者只配置在后端私密变量，不能放入静态前端。`FRONTEND_ORIGINS` 填 Sites 网站的完整 HTTPS 来源，不含末尾斜杠，例如 `https://nightreign-relic-atlas.shrewdsky2.chatgpt.site`。健康检查路径设为 `/api/health`。首次部署后运行 `python -m backend.index_knowledge`，确认 `/api/knowledge/status` 返回 `ok`。
4. 部署后确认 `https://<你的 Render 域名>/api/health` 返回正常结果，将该 HTTPS 根地址写入 `public/ai-config.js` 的 `window.NIGHTREIGN_AI_API_BASE`，再构建并发布 Sites 前端，并将同一批改动同步到 GitHub。

公开访问前还应在 DeepSeek 账户侧设置余额或预算提醒。应用层按请求次数封顶，不能精确限定人民币花费。
