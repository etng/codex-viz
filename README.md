# Codex Viz（本地）

本项目用于**本地**读取 `~/.codex/sessions/**/*.jsonl` 的 Codex 对话历史，并做可视化呈现：

- 索引：SQLite（本地文件，默认 `~/.codex-viz/cache/index.sqlite`）
- 详情时间线：按需从 jsonl 解析，并缓存为 JSON

## 启动

```bash
pnpm i
pnpm dev
```

打开 `http://localhost:3000`

## 可选环境变量

- `CODEX_SESSIONS_DIR`：默认 `~/.codex/sessions`
- `CODEX_VIZ_CACHE_DIR`：默认 `~/.codex-viz/cache`
