# Deployment templates

`nginx-nightreign.http.conf` serves the built site and proxies `/api/` to the
existing loopback backend. It is the HTTP stage only. AI and feedback endpoints
keep their HTTPS requirement and will reject public HTTP requests.

`Dockerfile.reuse-runtime` updates backend code without reinstalling Python
dependencies. Before using it, tag the currently deployed image with a
release-specific rollback tag and pass that local tag as `BASE_IMAGE`. Build
with `--pull=false` so Docker uses the local image. Confirm the installed
FastAPI, Uvicorn, Chroma, httpx, and jieba versions satisfy
`backend/requirements.txt` before building.

Keep the existing persistent `local-data` mount for Chroma and SQLite. Stop the
backend before taking a consistent archive of that directory, then restart it.
Do not run `python -m backend.index_knowledge` as part of a code-only update.
Before switching containers, verify the release knowledge corpus is compatible
with the existing Chroma collection; matching record counts alone do not prove
that the indexed content is identical. If `/api/health` is not ready after the
update, roll back to the saved image and container configuration without
rebuilding the index.

Store the backend environment file outside the public document root with mode
`0600`. Configure `FRONTEND_ORIGINS` with the exact HTTPS site origins and keep
`FEEDBACK_ADMIN_PASSWORD` server-side with at least 32 random characters. Do
not put credentials in this repository or in the static build.

The Nginx template forwards the public scheme to Uvicorn. For later HTTPS
termination, configure `FORWARDED_ALLOW_IPS` to trust only the actual Docker
proxy peer address discovered on the server; do not use `*`. Nginx replaces
`X-Forwarded-For` with the connected client address instead of appending a
visitor-supplied forwarding chain. Until a TLS
certificate and HTTPS server block are reviewed and installed, public AI and
feedback actions remain unavailable by design.
