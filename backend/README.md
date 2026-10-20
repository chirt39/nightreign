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

`GET /api/health` 是就绪检查：要求知识库源语料可读且非空、Chroma 活动集合可用、索引记录数与源语料条数一致，并且百炼向量 API Key 已配置；全部满足返回 HTTP 200，否则返回 HTTP 503 和逐项检查状态。该接口不调用 DeepSeek 或百炼，避免健康检查产生模型费用。`GET /api/knowledge/status` 可查看索引与源语料计数。

### RAG 检索评估

`backend/knowledge_base/evaluation_cases.jsonl` 保存可维护的检索评估问题和预期记录 ID。运行 `python -m backend.evaluate_knowledge_base --top-k 10` 会检索当前 Chroma 索引并输出 hit rate 与 MRR；尚未建立索引时会提示检查本地 Chroma 数据和百炼向量 API 配置。评估集当前只用于检索命中情况，不代表游戏资料已人工核验，也不能单独证明模型答案正确。新增或变更语料后，应核对对应预期记录 ID 是否仍有效，并把正式验收结果记录在 PR 中。

## 本地启动

1. 在项目根目录将 `.env.example` 复制为 `.env`，只在本机 `.env` 中填写 `DEEPSEEK_API_KEY` 和 `DASHSCOPE_API_KEY`。如果百炼控制台提供工作空间专属 API Host，将 `DASHSCOPE_BASE_URL` 改成控制台给出的 `compatible-mode/v1` 地址。两个 Key 均只保存在后端环境中。
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
- 所有 AI 接口共享同一客户端每分钟限流；默认全站每天最多发起 100 次 DeepSeek 请求（UTC 日界线重置），分别由 `AI_REQUESTS_PER_MINUTE` 和 `AI_REQUESTS_PER_DAY` 配置。计数保存在 `AGENT_MEMORY_DB` 的 SQLite 数据库中，单机多进程共享；多服务器部署需改用 Redis 等共享限流存储。
- 若 FastAPI 通过本机 Caddy 反向代理，Uvicorn 应信任本机代理头（`--proxy-headers --forwarded-allow-ips=127.0.0.1`），否则每 IP 限流可能把访客都识别成代理地址。不要信任任意公网来源的转发头。
- 请求次数上限不能精确限制人民币费用，实际花费仍取决于模型、输入长度和输出长度；还应在 DeepSeek 账户侧设置余额或预算提醒。CORS 只约束浏览器，不是 API 认证或防刷手段。
- 推荐方案必须引用本次清单中的遗物实例 ID，且通过后端和前端的类型、颜色、槽位合法性校验。用户点击“应用配装到装配预览”后才会改变浏览器内的装配预览。
- 对话记录按浏览器会话标识保存；后端不写入用户的存档或流派规则。DeepSeek API 使用量会按 DeepSeek 账户当前价格计费。

## 容器部署

项目提供 `backend/Dockerfile`，可部署到支持 Docker 的 Python 服务平台。构建上下文使用项目根目录：

```powershell
docker build -t nightreign-ai -f backend/Dockerfile .
```

未来部署服务时需配置持久化磁盘、`CHROMA_PATH`、`AGENT_MEMORY_DB`、`AGENT_MEMORY_MAX_EXCHANGES`、`AI_REQUESTS_PER_MINUTE`、`AI_REQUESTS_PER_DAY`、`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL` 和 `FRONTEND_ORIGINS`，并在服务端运行一次索引命令。本机 Chroma 和 SQLite 数据不会自动迁移；也可将源语料复制到服务端后重建索引，这会调用百炼 API。服务监听平台注入的 `PORT`，健康检查地址为 `/api/health`。部署成功后，将服务的 HTTPS 根地址填入 `public/ai-config.js` 的 `window.NIGHTREIGN_AI_API_BASE`，重新构建并发布前端。每次 Sites 发布按 `docs/RELEASES.md` 记录 Git 提交 SHA、Sites 版本、语料摘要和回退版本；GitHub 推送本身不代表 Sites 已上线。

API 密钥只保存在 FastAPI 服务端，不能填入任何 `public/` 文件或前端构建产物。

当前频率与每日调用计数保存在 SQLite 中，适用于本地或共享同一持久化数据库的单机多进程部署。正式多服务器部署应使用共享限流存储（例如 Redis），并正确配置可信反向代理，避免所有访客被误认为同一客户端。

### 用 Render 部署后端（未来迁移）

1. 将后端代码、`backend/knowledge_base/` 和 `public/` 中的资料文件提交到 GitHub。不要提交 `.env` 或存档文件。
2. 在 Render 新建 **Web Service**，连接本项目 GitHub 仓库，选择 **Docker**，仓库根目录作为构建上下文，Dockerfile 路径设为 `backend/Dockerfile`。
3. 为 Chroma 和对话 SQLite 数据库挂载持久化磁盘。在服务的私密环境变量中设置 `CHROMA_PATH`、`AGENT_MEMORY_DB`、`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL` 和 `FRONTEND_ORIGINS`。后者填 Sites 网站的完整 HTTPS 来源，不含末尾斜杠，例如 `https://nightreign-relic-atlas.shrewdsky2.chatgpt.site`。健康检查路径设为 `/api/health`。首次部署后运行 `python -m backend.index_knowledge`，确认 `/api/knowledge/status` 返回 `ok`。
4. 部署后确认 `https://<你的 Render 域名>/api/health` 返回正常结果，将该 HTTPS 根地址写入 `public/ai-config.js` 的 `window.NIGHTREIGN_AI_API_BASE`，再构建并发布 Sites 前端，并将同一批改动同步到 GitHub。

公开访问前还应在 DeepSeek 账户侧设置余额或预算提醒。应用层按请求次数封顶，不能精确限定人民币花费。
