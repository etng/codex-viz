# 开发文档

本文档面向参与开发与维护的贡献者。

## 项目结构

- `src/app/api/*`：Next.js API 路由
- `src/components/*`：前端组件
- `src/lib/*`：索引、解析、SQLite 访问与类型
- `README.md`：对外说明（中英）

## 本地开发

```bash
pnpm i
pnpm dev
```

访问 `http://localhost:3000`

## 数据来源

默认从 `~/.codex/sessions/**/*.jsonl` 读取（可通过 `CODEX_SESSIONS_DIR` 覆盖）。

## 索引与缓存

- SQLite 缓存目录：`~/.codex-viz/cache`（可通过 `CODEX_VIZ_CACHE_DIR` 覆盖）
- 索引文件：`index.sqlite`
- 词云 token 统计缓存：`user_token_counts` 表

## Token 统计口径

- 来源：`event_msg.token_count`
- 计算：用 `total_token_usage` 的增量累计；首条/重置时用 `last_token_usage` 兜底
- Prompt(含缓存)：`input_tokens`（其中 `cached_input_tokens` 为命中缓存的子集）

## 重要约定

- 不读取远端数据，默认仅处理本地日志
- 变更索引结构时需调整 `INDEX_VERSION`

## 常见排查

- 趋势或词云不更新：删除 `~/.codex-viz/cache/index.sqlite*` 后刷新页面
- token 统计异常：确认日志内是否存在 `event_msg.token_count`
