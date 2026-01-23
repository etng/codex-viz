# Codex Viz

[English](#codex-viz-local) | [中文](#codex-viz本地)

Codex Viz is a local-first dashboard for exploring your Codex CLI sessions. It indexes your local JSONL history and turns it into clear trends, token usage, tool insights, and a focused word cloud.

If you want fast answers to “what did I do”, “how much did it cost”, and “where did my time go”, this is the smallest tool that feels big.

---

# Codex Viz（本地）

Codex Viz 是一个**本地优先**的 Codex CLI 会话可视化面板。它只读取你本机的 JSONL 历史，快速生成趋势、Token 使用、工具洞察与输入词云。

你想知道“我最近都在做什么”“消耗了多少 Token”“哪些工具最常用”，这里一眼就能看到。

## 功能亮点

- 本地索引：SQLite 缓存，快速查询
- 趋势看板：会话、消息、工具、Token 趋势
- Token 统计：基于 `event_msg.token_count` 的 `total_token_usage` 增量累计，首条/重置时用 `last_token_usage` 兜底
  - Prompt(含缓存) = `input_tokens`；`cached_input_tokens` 为其中命中缓存的子集
- 词云：对 user 输入做轻量分词（英文词 + 中文 2/3-gram）
- 工具排行：Top 工具一眼可见

## 快速开始

```bash
pnpm i
pnpm dev
```

打开 `http://localhost:3000`

## 可选环境变量

- `CODEX_SESSIONS_DIR`：默认 `~/.codex/sessions`
- `CODEX_VIZ_CACHE_DIR`：默认 `~/.codex-viz/cache`

## 适用场景

- 想追踪个人/团队在 Codex 上的投入与产出
- 需要快速复盘近期任务与工具使用偏好
- 希望用更直观的方式理解 Token 消耗

---

# Codex Viz (Local)

Codex Viz is a **local-first** dashboard for Codex CLI sessions. It reads your JSONL history on your machine and turns it into trends, token usage, tool insights, and a focused user-input word cloud.

If you want to quickly answer “what I worked on”, “how many tokens I used”, and “which tools I rely on”, this gives you that at a glance.

## Highlights

- Local indexing with SQLite for fast queries
- Trend chart for sessions, messages, tools, and tokens
- Token accounting from `event_msg.token_count` using incremental `total_token_usage`
  - Prompt (incl. cache) = `input_tokens`; `cached_input_tokens` is a subset of it
- Lightweight word cloud from user input (EN tokens + ZH 2/3-gram)
- Top tools leaderboard

## Quick Start

```bash
pnpm i
pnpm dev
```

Open `http://localhost:3000`

## Optional Env Vars

- `CODEX_SESSIONS_DIR` (default `~/.codex/sessions`)
- `CODEX_VIZ_CACHE_DIR` (default `~/.codex-viz/cache`)

## Use Cases

- Track personal/team Codex usage and trends
- Review recent work and tool preferences
- Make token usage more tangible
