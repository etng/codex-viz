# Dockerize Codex Viz

## 目标

- 用尽量小的镜像运行项目，避免把整个 `node_modules` 带到运行时镜像里。
- 用 GitHub Actions 在 GitHub 上自动构建/推送镜像。
- 提供本地 `docker run` 与 `docker compose` 的可直接运行方案，并挂载本地会话目录与缓存目录。

## 本次改动

1. `next.config.ts`
- 新增 `output: "standalone"`，让 Next.js 产出可直接运行的精简服务端包。

2. `Dockerfile`
- 使用多阶段构建：
  - `deps` 安装依赖
  - `builder` 执行 `pnpm build`
  - `runner` 仅复制 `.next/standalone` 与 `.next/static`
- 运行层不包含完整 `node_modules` 源目录，降低镜像体积。
- `builder` 固定在 `BUILDPLATFORM` 执行，避免在 QEMU 下构建 `arm64` 时触发 `next build` 的 `SIGILL`。

3. `.dockerignore`
- 排除 `.git`、`node_modules`、`.next` 等无关上下文，减少构建上下文体积与传输耗时。

4. `.github/workflows/docker.yml`
- 支持 `push`（main/tag）、`pull_request`、`workflow_dispatch`。
- 使用 `docker/build-push-action` 构建多架构镜像（`linux/amd64,linux/arm64`）。
- 非 PR 事件自动推送到 `ghcr.io/<owner>/<repo>`。

5. `compose.yaml`
- 提供本地 compose 一键运行，自动挂载：
  - `${HOME}/.codex/sessions -> /codex-sessions`（只读）
  - `${HOME}/.codex-viz/cache -> /codex-viz-cache`（读写）

## 本地直接运行（docker run）

先构建：

```bash
docker build -t codex-viz:min .
```

再运行（已带两个目录挂载）：

```bash
docker run --rm -p 3000:3000 \
  -e CODEX_SESSIONS_DIR=/codex-sessions \
  -e CODEX_VIZ_CACHE_DIR=/codex-viz-cache \
  -v "$HOME/.codex/sessions:/codex-sessions:ro" \
  -v "$HOME/.codex-viz/cache:/codex-viz-cache" \
  codex-viz:min
```

访问：`http://localhost:3000`

## 本地使用 Docker Compose

启动：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止：

```bash
docker compose down
```

> 如果你的目录不是默认路径，先在 shell 中设置 `HOME` 对应值，或直接改 `compose.yaml` 的 `volumes` 映射路径。

## GitHub Actions 构建与推送（GHCR）

工作流文件：`.github/workflows/docker.yml`

触发后：
- PR：只构建，不推送
- push 到 `main` 或 tag：构建并推送到 GHCR

镜像名格式：

```text
ghcr.io/<github-owner>/<repo>
```

例如你的 fork 是 `etng/codex-viz`，则镜像仓库是：

```text
ghcr.io/etng/codex-viz
```

你可以在 GitHub 仓库的 `Actions` 页面手动触发 `docker` 工作流（`workflow_dispatch`）。

## 推送到 fork 仓库（me remote）

新增 remote：

```bash
git remote add me git@github.com:etng/codex-viz.git
```

推送当前分支：

```bash
git push -u me master
```

后续更新推送：

```bash
git push me master
```

## 验证结果（本地）

- `pnpm build` 通过
- `docker build` 通过
- `docker run` 启动通过
- 当前构建出的本地镜像体积约 `236MB`
