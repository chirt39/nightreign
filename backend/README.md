# DeepSeek 遗物配装 API

此服务只接收受限的遗物搭配请求，不读取或保存原始 `.sl2` 文件。前端会把当前浏览器中解析出的遗物实例 ID、名称、颜色、类型、词条，用户编写的搭配知识规则、问题和当前槽位提交给 FastAPI；API 再将这些摘要发送给 DeepSeek。知识库保存在当前浏览器本机，并会随每次配装请求发送。不要在不信任的网络上公开此服务。

## 本地启动

1. 在项目根目录将 `.env.example` 复制为 `.env`，只在本机 `.env` 中填写 `DEEPSEEK_API_KEY`。
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

- 用户直接描述配装需求，不再选择咨询方向。每次只接收一条 8–240 字的问题；问题必须包含游戏、角色、遗物、武器、词条或战斗配装相关词语。不接收聊天历史、文件、图片或工具调用。
- 每个客户端 IP 每分钟最多 5 次；请求最多 900 件遗物、6 个槽位、40 条当前流派规则，以及 30 条自定义知识库规则（每条最多 300 字）。
- 返回方案必须引用本次清单中的遗物实例 ID，且通过后端和前端的类型、颜色、槽位合法性校验。用户点击“应用方案”后才会改变浏览器内的装配预览。
- 后端不写入用户的存档或流派规则，也不保存请求正文。DeepSeek API 使用量会按 DeepSeek 账户当前价格计费。

## 容器部署

项目提供 `backend/Dockerfile`，可部署到支持 Docker 的 Python 服务平台。构建上下文使用项目根目录：

```powershell
docker build -t nightreign-ai -f backend/Dockerfile .
```

部署服务时设置 `DEEPSEEK_API_KEY` 为私密环境变量，将 `FRONTEND_ORIGINS` 设置为线上网站的完整来源（例如 `https://nightreign-relic-atlas.shrewdsky2.chatgpt.site`），其余配置可沿用默认值。服务监听平台注入的 `PORT`，健康检查地址为 `/api/health`。部署成功后，将服务的 HTTPS 根地址填入 `public/ai-config.js` 的 `window.NIGHTREIGN_AI_API_BASE`，重新构建并发布前端。

API 密钥只保存在 FastAPI 服务端，不能填入任何 `public/` 文件或前端构建产物。

当前频率限制保存在单个 FastAPI 进程的内存中，适用于本地或单实例试运行。正式多实例部署应使用共享限流存储（例如 Redis），并正确配置可信反向代理，避免所有访客被误认为同一客户端。
