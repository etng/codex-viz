import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { getCacheDir, getSessionsDir } from "@/lib/paths";
import type {
  DailyAgg,
  IndexSnapshot,
  SessionSummary,
  SessionTimelineResponse,
  SessionsListResponse,
  TimelineEvent,
  TokenUsage
} from "@/lib/types";
import { getDb, migrateDb } from "@/lib/sqlite";

const INDEX_VERSION = 3;
const SESSION_DIR = "session";

let inMemoryIndex: IndexSnapshot | null = null;
let inFlight: Promise<IndexSnapshot> | null = null;
let lastRefreshMs = 0;

function safeJsonParse(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function toIso(ts: unknown): string | null {
  if (typeof ts !== "string") return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dayKeyFromIso(iso: string | null) {
  if (!iso) return "unknown";
  return iso.slice(0, 10);
}

async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true });
}

async function readJsonFile<T>(p: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(p: string, obj: unknown) {
  const tmp = `${p}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fsp.rename(tmp, p);
}

async function listJsonlFiles(root: string) {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile() && ent.name.endsWith(".jsonl")) out.push(full);
    }
  }
  await walk(root);
  return out;
}

function summarizeFromMeta(sessionId: string, file: string, meta: any): SessionSummary {
  const payload = meta?.payload ?? {};
  return {
    id: payload?.id ?? sessionId,
    file,
    startedAt: toIso(meta?.timestamp) ?? toIso(payload?.timestamp),
    endedAt: null,
    durationSec: null,
    cwd: typeof payload?.cwd === "string" ? payload.cwd : null,
    originator: typeof payload?.originator === "string" ? payload.originator : null,
    cliVersion: typeof payload?.cli_version === "string" ? payload.cli_version : null,
    messages: 0,
    toolCalls: 0,
    errors: 0,
    tokensTotal: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCachedInput: 0,
    tokensReasoningOutput: 0
  };
}

function extractMessageText(payload: any): string | null {
  const content = payload?.content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const c of content) {
    if (c?.type === "input_text" && typeof c?.text === "string") parts.push(c.text);
    else if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
    else if (typeof c?.text === "string") parts.push(c.text);
  }
  const txt = parts.join("\n").trim();
  return txt ? txt : null;
}

function toNum(value: any) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeTokenUsage(usage: any) {
  return {
    total: toNum(usage?.total_tokens),
    input: toNum(usage?.input_tokens),
    output: toNum(usage?.output_tokens),
    cachedInput: toNum(usage?.cached_input_tokens),
    reasoningOutput: toNum(usage?.reasoning_output_tokens)
  };
}

function hasTokenUsageData(usage: TokenUsage) {
  return (
    usage.total > 0 ||
    usage.input > 0 ||
    usage.output > 0 ||
    usage.cachedInput > 0 ||
    usage.reasoningOutput > 0
  );
}

async function buildFileIndex(file: string) {
  const sessionId = path.basename(file, ".jsonl");
  const tools: Record<string, number> = {};
  const callIdToToolName = new Map<string, string>();
  const userTexts: string[] = [];
  const tokenUsage = {
    total: 0,
    input: 0,
    output: 0,
    cachedInput: 0,
    reasoningOutput: 0
  };
  let lastTotalUsage: {
    total: number;
    input: number;
    output: number;
    cachedInput: number;
    reasoningOutput: number;
  } | null = null;

  let summary: SessionSummary = {
    id: sessionId,
    file,
    startedAt: null,
    endedAt: null,
    durationSec: null,
    cwd: null,
    originator: null,
    cliVersion: null,
    messages: 0,
    toolCalls: 0,
    errors: 0,
    tokensTotal: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCachedInput: 0,
    tokensReasoningOutput: 0
  };

  let firstTs: string | null = null;
  let lastTs: string | null = null;

  const stream = fs.createReadStream(file, "utf8");
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const obj: any = safeJsonParse(line);
    if (!obj) continue;
    const ts = toIso(obj.timestamp);
    if (ts) {
      if (!firstTs) firstTs = ts;
      lastTs = ts;
    }

    if (obj.type === "session_meta") {
      summary = summarizeFromMeta(sessionId, file, obj);
      if (!firstTs && summary.startedAt) firstTs = summary.startedAt;
    }

    if (obj.type === "event_msg") {
      const pt = obj.payload?.type;
      if (pt === "turn_aborted") summary.errors += 1;
      if (pt === "token_count") {
        const usageTotal = normalizeTokenUsage(obj.payload?.info?.total_token_usage);
        const usageLast = normalizeTokenUsage(obj.payload?.info?.last_token_usage);
        const hasTotal = usageTotal.total > 0;
        const hasLast = usageLast.total > 0;

        if (hasTotal) {
          if (lastTotalUsage) {
            const delta = {
              total: Math.max(0, usageTotal.total - lastTotalUsage.total),
              input: Math.max(0, usageTotal.input - lastTotalUsage.input),
              output: Math.max(0, usageTotal.output - lastTotalUsage.output),
              cachedInput: Math.max(0, usageTotal.cachedInput - lastTotalUsage.cachedInput),
              reasoningOutput: Math.max(0, usageTotal.reasoningOutput - lastTotalUsage.reasoningOutput)
            };
            tokenUsage.total += delta.total;
            tokenUsage.input += delta.input;
            tokenUsage.output += delta.output;
            tokenUsage.cachedInput += delta.cachedInput;
            tokenUsage.reasoningOutput += delta.reasoningOutput;
            if (usageTotal.total < lastTotalUsage.total && hasLast) {
              tokenUsage.total += usageLast.total;
              tokenUsage.input += usageLast.input;
              tokenUsage.output += usageLast.output;
              tokenUsage.cachedInput += usageLast.cachedInput;
              tokenUsage.reasoningOutput += usageLast.reasoningOutput;
            }
          } else if (hasLast) {
            tokenUsage.total += usageLast.total;
            tokenUsage.input += usageLast.input;
            tokenUsage.output += usageLast.output;
            tokenUsage.cachedInput += usageLast.cachedInput;
            tokenUsage.reasoningOutput += usageLast.reasoningOutput;
          }
          lastTotalUsage = usageTotal;
        } else if (hasLast) {
          tokenUsage.total += usageLast.total;
          tokenUsage.input += usageLast.input;
          tokenUsage.output += usageLast.output;
          tokenUsage.cachedInput += usageLast.cachedInput;
          tokenUsage.reasoningOutput += usageLast.reasoningOutput;
        }

      }
    }

    if (obj.type === "response_item") {
      const payload = obj.payload ?? {};
      const pt = payload.type;
      if (pt === "message") {
        const role = payload.role;
        if (role === "user" || role === "assistant") summary.messages += 1;
        if (role === "user") {
          const txt = extractMessageText(payload);
          if (txt) userTexts.push(txt);
        }
      } else if (pt === "function_call" || pt === "custom_tool_call") {
        summary.toolCalls += 1;
        const name = typeof payload.name === "string" ? payload.name : "unknown";
        tools[name] = (tools[name] ?? 0) + 1;
        const callId = typeof payload.call_id === "string" ? payload.call_id : null;
        if (callId) callIdToToolName.set(callId, name);
      } else if (pt === "function_call_output" || pt === "custom_tool_call_output") {
        const out = typeof payload.output === "string" ? payload.output : null;
        const callId = typeof payload.call_id === "string" ? payload.call_id : null;
        const toolName = callId ? callIdToToolName.get(callId) : undefined;
        if (out) {
          // 常见：输出里直接带 error 文本
          if (/error|exception|traceback/i.test(out)) summary.errors += 1;
          // 常见：custom_tool_call_output 里包了一层 JSON，包含 exit_code
          if (out.startsWith("{")) {
            try {
              const parsed: any = JSON.parse(out);
              const exitCode = parsed?.metadata?.exit_code;
              if (typeof exitCode === "number" && exitCode !== 0) summary.errors += 1;
            } catch {
              // ignore
            }
          }
        }
        // 兜底：如果某些工具输出为空但工具名可识别，仍保留统计（summary 已在 call 时统计）
        void toolName;
      }
    }
  }

  summary.startedAt = summary.startedAt ?? firstTs;
  summary.endedAt = lastTs;
  if (summary.startedAt && summary.endedAt) {
    const a = new Date(summary.startedAt).getTime();
    const b = new Date(summary.endedAt).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) summary.durationSec = Math.floor((b - a) / 1000);
  }

  const dailyKey = dayKeyFromIso(summary.startedAt ?? firstTs);
  const userTokenCounts = tokenizeUserTexts(userTexts);
  return { sessionId, summary, tools, dailyKey, userTokenCounts, tokenUsage };
}

function stripCodeAndUrls(input: string) {
  let s = input;
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`[^`]*`/g, " ");
  s = s.replace(/https?:\/\/\S+/g, " ");
  s = s.replace(/\b[a-f0-9]{32,}\b/gi, " "); // hashes
  return s;
}

const STOPWORDS_ZH = new Set([
  "的",
  "了",
  "是",
  "我",
  "你",
  "他",
  "她",
  "它",
  "我们",
  "你们",
  "他们",
  "她们",
  "它们",
  "这",
  "那",
  "一个",
  "一下",
  "一下子",
  "以及",
  "还有",
  "但是",
  "因为",
  "所以",
  "如果",
  "然后",
  "可以",
  "需要",
  "怎么",
  "为什么",
  "什么",
  "请",
  "帮我",
  "一下吧"
]);

const STOPWORDS_EN = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "it",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "as",
  "at",
  "by",
  "from",
  "not"
]);

function addCount(map: Map<string, number>, token: string, inc = 1) {
  const t = token.trim();
  if (!t) return;
  map.set(t, (map.get(t) ?? 0) + inc);
}

function tokenizeUserTexts(texts: string[]) {
  const counts = new Map<string, number>();
  for (const raw of texts) {
    const cleaned = stripCodeAndUrls(raw).toLowerCase();

    // 英文/数字混合词
    const en = cleaned.match(/[a-z][a-z0-9_-]{1,}/g);
    if (en) {
      for (const w of en) {
        if (w.length < 2 || w.length > 30) continue;
        if (STOPWORDS_EN.has(w)) continue;
        addCount(counts, w);
      }
    }

    // 中文：取连续汉字块，再做 2/3-gram（更接近“词”）
    const zhBlocks = cleaned.match(/[\u4e00-\u9fff]{2,}/g);
    if (zhBlocks) {
      for (const b of zhBlocks) {
        if (STOPWORDS_ZH.has(b)) continue;
        // 整块也算一个 token（短块更像词）
        if (b.length <= 4) addCount(counts, b);
        // 2-gram
        for (let i = 0; i + 1 < b.length; i++) {
          const t2 = b.slice(i, i + 2);
          if (!STOPWORDS_ZH.has(t2)) addCount(counts, t2);
        }
        // 3-gram（只在块较长时）
        if (b.length >= 4) {
          for (let i = 0; i + 2 < b.length; i++) {
            const t3 = b.slice(i, i + 3);
            if (!STOPWORDS_ZH.has(t3)) addCount(counts, t3);
          }
        }
      }
    }
  }
  const obj: Record<string, number> = {};
  for (const [k, v] of counts) obj[k] = v;
  return obj;
}

async function refreshSqliteIndex(): Promise<void> {
  migrateDb();
  const d = getDb();

  const sessionsDir = getSessionsDir();
  const cacheDir = getCacheDir();
  await ensureDir(cacheDir);
  await ensureDir(path.join(cacheDir, SESSION_DIR));

  const files = await listJsonlFiles(sessionsDir);
  const fileSet = new Set(files);

  const selectPrev = d.prepare("SELECT mtime_ms as mtimeMs, size FROM files WHERE file = ?");
  const deleteFile = d.prepare("DELETE FROM files WHERE file = ?");
  const deleteToolCounts = d.prepare("DELETE FROM tool_counts WHERE file = ?");
  const deleteUserTokenCounts = d.prepare("DELETE FROM user_token_counts WHERE file = ?");
  const upsertFile = d.prepare(`
    INSERT INTO files (
      file, mtime_ms, size, session_id, daily_key,
      started_at, ended_at, duration_sec, cwd, originator, cli_version,
      messages, tool_calls, errors,
      tokens_total, tokens_input, tokens_output, tokens_cached_input, tokens_reasoning_output
    ) VALUES (
      @file, @mtimeMs, @size, @sessionId, @dailyKey,
      @startedAt, @endedAt, @durationSec, @cwd, @originator, @cliVersion,
      @messages, @toolCalls, @errors,
      @tokensTotal, @tokensInput, @tokensOutput, @tokensCachedInput, @tokensReasoningOutput
    )
    ON CONFLICT(file) DO UPDATE SET
      mtime_ms=excluded.mtime_ms,
      size=excluded.size,
      session_id=excluded.session_id,
      daily_key=excluded.daily_key,
      started_at=excluded.started_at,
      ended_at=excluded.ended_at,
      duration_sec=excluded.duration_sec,
      cwd=excluded.cwd,
      originator=excluded.originator,
      cli_version=excluded.cli_version,
      messages=excluded.messages,
      tool_calls=excluded.tool_calls,
      errors=excluded.errors,
      tokens_total=excluded.tokens_total,
      tokens_input=excluded.tokens_input,
      tokens_output=excluded.tokens_output,
      tokens_cached_input=excluded.tokens_cached_input,
      tokens_reasoning_output=excluded.tokens_reasoning_output
  `);
  const upsertTool = d.prepare(`
    INSERT INTO tool_counts (file, tool_name, count)
    VALUES (?, ?, ?)
    ON CONFLICT(file, tool_name) DO UPDATE SET count=excluded.count
  `);
  const upsertUserToken = d.prepare(`
    INSERT INTO user_token_counts (file, token, count)
    VALUES (?, ?, ?)
    ON CONFLICT(file, token) DO UPDATE SET count=excluded.count
  `);
  const storedVersion = Number((d.prepare("SELECT value FROM meta WHERE key='version'").get() as any)?.value ?? 0);
  const needRebuild = storedVersion !== INDEX_VERSION;

  d.exec("BEGIN IMMEDIATE");
  try {
    if (needRebuild) {
      d.exec("DELETE FROM tool_counts; DELETE FROM user_token_counts; DELETE FROM files;");
    }

    const existingRows = d.prepare("SELECT file FROM files").all() as { file: string }[];
    for (const row of existingRows) {
      if (!fileSet.has(row.file)) {
        deleteToolCounts.run(row.file);
        deleteUserTokenCounts.run(row.file);
        deleteFile.run(row.file);
      }
    }

    for (const file of files) {
      let st: fs.Stats;
      try {
        st = await fsp.stat(file);
      } catch {
        continue;
      }

      const prev = selectPrev.get(file) as { mtimeMs: number; size: number } | undefined;
      if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) continue;

      const built = await buildFileIndex(file);
      upsertFile.run({
        file,
        mtimeMs: st.mtimeMs,
        size: st.size,
        sessionId: built.sessionId,
        dailyKey: built.dailyKey,
        startedAt: built.summary.startedAt,
        endedAt: built.summary.endedAt,
        durationSec: built.summary.durationSec,
        cwd: built.summary.cwd,
        originator: built.summary.originator,
        cliVersion: built.summary.cliVersion,
        messages: built.summary.messages,
        toolCalls: built.summary.toolCalls,
        errors: built.summary.errors,
        tokensTotal: built.tokenUsage.total,
        tokensInput: built.tokenUsage.input,
        tokensOutput: built.tokenUsage.output,
        tokensCachedInput: built.tokenUsage.cachedInput,
        tokensReasoningOutput: built.tokenUsage.reasoningOutput
      });

      deleteToolCounts.run(file);
      for (const [name, count] of Object.entries(built.tools)) {
        upsertTool.run(file, name, count);
      }

      deleteUserTokenCounts.run(file);
      for (const [token, count] of Object.entries(built.userTokenCounts)) {
        if (!token || count <= 0) continue;
        upsertUserToken.run(file, token, count);
      }
    }

    d.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('sessionsDir', ?)").run(sessionsDir);
    d.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('generatedAt', ?)").run(new Date().toISOString());
    d.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('version', ?)").run(String(INDEX_VERSION));

    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

function queryIndexSnapshot(): IndexSnapshot {
  migrateDb();
  const d = getDb();
  const cacheDir = getCacheDir();
  const sessionsDir = (d.prepare("SELECT value FROM meta WHERE key='sessionsDir'").get() as any)?.value ?? getSessionsDir();
  const generatedAt =
    (d.prepare("SELECT value FROM meta WHERE key='generatedAt'").get() as any)?.value ?? new Date().toISOString();

  const totalsRow = d
    .prepare(
      "SELECT COUNT(*) as files, COUNT(*) as sessions, COALESCE(SUM(messages),0) as messages, COALESCE(SUM(tool_calls),0) as toolCalls, COALESCE(SUM(errors),0) as errors, COALESCE(SUM(tokens_total),0) as tokensTotal, COALESCE(SUM(tokens_input),0) as tokensInput, COALESCE(SUM(tokens_output),0) as tokensOutput, COALESCE(SUM(tokens_cached_input),0) as tokensCachedInput, COALESCE(SUM(tokens_reasoning_output),0) as tokensReasoningOutput FROM files"
    )
    .get() as any;

  const dailyRows = d
    .prepare(
      "SELECT daily_key as day, COUNT(*) as sessions, COALESCE(SUM(messages),0) as messages, COALESCE(SUM(tool_calls),0) as toolCalls, COALESCE(SUM(errors),0) as errors, COALESCE(SUM(tokens_total),0) as tokensTotal, COALESCE(SUM(tokens_input),0) as tokensInput, COALESCE(SUM(tokens_output),0) as tokensOutput, COALESCE(SUM(tokens_cached_input),0) as tokensCachedInput, COALESCE(SUM(tokens_reasoning_output),0) as tokensReasoningOutput FROM files GROUP BY daily_key"
    )
    .all() as any[];

  const daily: Record<string, DailyAgg> = {};
  for (const r of dailyRows) {
    daily[String(r.day)] = {
      sessions: Number(r.sessions ?? 0),
      messages: Number(r.messages ?? 0),
      toolCalls: Number(r.toolCalls ?? 0),
      errors: Number(r.errors ?? 0),
      tokensTotal: Number(r.tokensTotal ?? 0),
      tokensInput: Number(r.tokensInput ?? 0),
      tokensOutput: Number(r.tokensOutput ?? 0),
      tokensCachedInput: Number(r.tokensCachedInput ?? 0),
      tokensReasoningOutput: Number(r.tokensReasoningOutput ?? 0)
    };
  }

  const toolRows = d
    .prepare("SELECT tool_name as name, COALESCE(SUM(count),0) as c FROM tool_counts GROUP BY tool_name")
    .all() as any[];
  const tools: Record<string, number> = {};
  for (const r of toolRows) tools[String(r.name)] = Number(r.c ?? 0);

  return {
    version: INDEX_VERSION,
    generatedAt,
    sessionsDir,
    cacheDir,
    totals: {
      files: Number(totalsRow.files ?? 0),
      sessions: Number(totalsRow.sessions ?? 0),
      messages: Number(totalsRow.messages ?? 0),
      toolCalls: Number(totalsRow.toolCalls ?? 0),
      errors: Number(totalsRow.errors ?? 0),
      tokensTotal: Number(totalsRow.tokensTotal ?? 0),
      tokensInput: Number(totalsRow.tokensInput ?? 0),
      tokensOutput: Number(totalsRow.tokensOutput ?? 0),
      tokensCachedInput: Number(totalsRow.tokensCachedInput ?? 0),
      tokensReasoningOutput: Number(totalsRow.tokensReasoningOutput ?? 0)
    },
    tools,
    daily
  };
}

async function ensureFreshIndex() {
  const now = Date.now();
  if (now - lastRefreshMs < 10_000) return;
  lastRefreshMs = now;
  await refreshSqliteIndex();
  inMemoryIndex = queryIndexSnapshot();
}

export async function listSessions(options: {
  q?: string;
  withTools?: boolean;
  withErrors?: boolean;
  limit?: number;
  offset?: number;
}): Promise<SessionsListResponse> {
  await ensureFreshIndex();
  const d = getDb();

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);

  const where: string[] = [];
  const params: any[] = [];

  if (options.withTools) where.push("tool_calls > 0");
  if (options.withErrors) where.push("errors > 0");

  const q = options.q?.trim();
  if (q) {
    where.push("(session_id LIKE ? OR IFNULL(cwd,'') LIKE ? OR IFNULL(originator,'') LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = d.prepare(`SELECT COUNT(*) as c FROM files ${whereSql}`).get(...params) as any;
  const rows = d
    .prepare(
    `SELECT
      session_id as id,
      file,
      started_at as startedAt,
      ended_at as endedAt,
      duration_sec as durationSec,
      cwd,
      originator,
      cli_version as cliVersion,
      messages,
      tool_calls as toolCalls,
      errors,
      tokens_total as tokensTotal,
      tokens_input as tokensInput,
      tokens_output as tokensOutput,
      tokens_cached_input as tokensCachedInput,
      tokens_reasoning_output as tokensReasoningOutput
    FROM files
      ${whereSql}
      ORDER BY (started_at IS NULL), started_at DESC
      LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as any[];

  const items: SessionSummary[] = rows.map((r) => ({
    id: String(r.id),
    file: String(r.file),
    startedAt: r.startedAt ?? null,
    endedAt: r.endedAt ?? null,
    durationSec: r.durationSec ?? null,
    cwd: r.cwd ?? null,
    originator: r.originator ?? null,
    cliVersion: r.cliVersion ?? null,
    messages: Number(r.messages ?? 0),
    toolCalls: Number(r.toolCalls ?? 0),
    errors: Number(r.errors ?? 0),
    tokensTotal: Number(r.tokensTotal ?? 0),
    tokensInput: Number(r.tokensInput ?? 0),
    tokensOutput: Number(r.tokensOutput ?? 0),
    tokensCachedInput: Number(r.tokensCachedInput ?? 0),
    tokensReasoningOutput: Number(r.tokensReasoningOutput ?? 0)
  }));

  return { generatedAt: new Date().toISOString(), total: Number(totalRow.c ?? 0), items };
}

export async function getUserWordCloud(options: {
  days?: number | null;
  limit?: number;
  minCount?: number;
  q?: string;
  withTools?: boolean;
  withErrors?: boolean;
}) {
  await ensureFreshIndex();
  const d = getDb();

  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  const minCount = Math.min(Math.max(options.minCount ?? 2, 1), 1000);
  const days = options.days == null ? null : Math.min(Math.max(options.days, 1), 3650);

  const where: string[] = [];
  const params: any[] = [];

  if (options.withTools) where.push("f.tool_calls > 0");
  if (options.withErrors) where.push("f.errors > 0");

  const q = options.q?.trim();
  if (q) {
    where.push("(f.session_id LIKE ? OR IFNULL(f.cwd,'') LIKE ? OR IFNULL(f.originator,'') LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  if (days != null) {
    const minIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    where.push("(f.started_at IS NOT NULL AND f.started_at >= ?)");
    params.push(minIso);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalUniqueRow = d
    .prepare(
      `SELECT COUNT(*) as c FROM (
        SELECT utc.token
        FROM user_token_counts utc
        JOIN files f ON f.file = utc.file
        ${whereSql}
        GROUP BY utc.token
        HAVING SUM(utc.count) >= ?
      )`
    )
    .get(...params, minCount) as any;

  const rows = d
    .prepare(
      `SELECT utc.token as name, SUM(utc.count) as value
       FROM user_token_counts utc
       JOIN files f ON f.file = utc.file
       ${whereSql}
       GROUP BY utc.token
       HAVING SUM(utc.count) >= ?
       ORDER BY value DESC
       LIMIT ?`
    )
    .all(...params, minCount, limit) as any[];

  return {
    generatedAt: new Date().toISOString(),
    days,
    limit,
    minCount,
    totalUnique: Number(totalUniqueRow.c ?? 0),
    items: rows.map((r) => ({ name: String(r.name), value: Number(r.value ?? 0) }))
  };
}

async function getSessionById(sessionId: string): Promise<SessionSummary | null> {
  await ensureFreshIndex();
  const d = getDb();
  const row = d
    .prepare(
      `SELECT
        session_id as id,
        file,
        started_at as startedAt,
        ended_at as endedAt,
        duration_sec as durationSec,
        cwd,
        originator,
        cli_version as cliVersion,
        messages,
        tool_calls as toolCalls,
        errors,
        tokens_total as tokensTotal,
        tokens_input as tokensInput,
        tokens_output as tokensOutput,
        tokens_cached_input as tokensCachedInput,
        tokens_reasoning_output as tokensReasoningOutput
      FROM files WHERE session_id = ? LIMIT 1`
    )
    .get(sessionId) as any;
  if (!row) return null;
  return {
    id: String(row.id),
    file: String(row.file),
    startedAt: row.startedAt ?? null,
    endedAt: row.endedAt ?? null,
    durationSec: row.durationSec ?? null,
    cwd: row.cwd ?? null,
    originator: row.originator ?? null,
    cliVersion: row.cliVersion ?? null,
    messages: Number(row.messages ?? 0),
    toolCalls: Number(row.toolCalls ?? 0),
    errors: Number(row.errors ?? 0),
    tokensTotal: Number(row.tokensTotal ?? 0),
    tokensInput: Number(row.tokensInput ?? 0),
    tokensOutput: Number(row.tokensOutput ?? 0),
    tokensCachedInput: Number(row.tokensCachedInput ?? 0),
    tokensReasoningOutput: Number(row.tokensReasoningOutput ?? 0)
  };
}

async function buildOrUpdateIndex(): Promise<IndexSnapshot> {
  await ensureFreshIndex();
  return queryIndexSnapshot();
}

export async function getIndex(): Promise<IndexSnapshot> {
  if (inMemoryIndex && Date.now() - lastRefreshMs < 10_000) return inMemoryIndex;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const fresh = await buildOrUpdateIndex();
    inMemoryIndex = fresh;
    return fresh;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function timelineCachePath(cacheDir: string, id: string) {
  return path.join(cacheDir, SESSION_DIR, `${encodeURIComponent(id)}.json`);
}

async function findFileForSession(sessionId: string) {
  const sessionsDir = getSessionsDir();
  const files = await listJsonlFiles(sessionsDir);
  const exact = files.find((f) => path.basename(f, ".jsonl") === sessionId);
  if (exact) return exact;
  // 兼容：如果用户传的是 meta id（uuid），尝试在文件内找（慢路径）
  for (const f of files) {
    const stream = fs.createReadStream(f, "utf8");
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      const obj: any = safeJsonParse(line);
      if (obj?.type === "session_meta" && obj?.payload?.id === sessionId) return f;
      break; // 只看第一行即可（大概率就是 session_meta）
    }
  }
  return null;
}

async function buildTimeline(file: string, summary: SessionSummary): Promise<SessionTimelineResponse> {
  const events: TimelineEvent[] = [];
  let truncated = false;
  const maxEvents = 5000;
  const callIdToName = new Map<string, string>();
  let lastTotalUsage: TokenUsage | null = null;

  const stream = fs.createReadStream(file, "utf8");
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const obj: any = safeJsonParse(line);
    if (!obj) continue;

    const ts = toIso(obj.timestamp) ?? "";

    if (obj.type === "event_msg") {
      const pt = obj.payload?.type;
      if (pt === "turn_aborted") {
        events.push({ ts, kind: "error", text: "turn_aborted" });
      } else if (pt === "token_count") {
        const usageTotal = normalizeTokenUsage(obj.payload?.info?.total_token_usage);
        const usageLast = normalizeTokenUsage(obj.payload?.info?.last_token_usage);
        const hasTotal = hasTokenUsageData(usageTotal);
        const hasLast = hasTokenUsageData(usageLast);
        let deltaUsage: TokenUsage | null = null;
        if (hasTotal) {
          if (lastTotalUsage) {
            deltaUsage = {
              total: Math.max(0, usageTotal.total - lastTotalUsage.total),
              input: Math.max(0, usageTotal.input - lastTotalUsage.input),
              output: Math.max(0, usageTotal.output - lastTotalUsage.output),
              cachedInput: Math.max(0, usageTotal.cachedInput - lastTotalUsage.cachedInput),
              reasoningOutput: Math.max(0, usageTotal.reasoningOutput - lastTotalUsage.reasoningOutput)
            };
            if (usageTotal.total < lastTotalUsage.total && hasLast) {
              deltaUsage.total += usageLast.total;
              deltaUsage.input += usageLast.input;
              deltaUsage.output += usageLast.output;
              deltaUsage.cachedInput += usageLast.cachedInput;
              deltaUsage.reasoningOutput += usageLast.reasoningOutput;
            }
          } else if (hasLast) {
            deltaUsage = { ...usageLast };
          }
          lastTotalUsage = usageTotal;
        } else if (hasLast) {
          deltaUsage = { ...usageLast };
        }

        const totalUsageForEvent = hasTotal ? usageTotal : null;
        const deltaUsageForEvent = deltaUsage && hasTokenUsageData(deltaUsage) ? deltaUsage : null;
        if (totalUsageForEvent || deltaUsageForEvent) {
          events.push({
            ts,
            kind: "token_count",
            tokenUsage: {
              total: totalUsageForEvent,
              delta: deltaUsageForEvent
            }
          });
        }
      }
    }

    if (obj.type === "response_item") {
      const payload = obj.payload ?? {};
      const pt = payload.type;
      if (pt === "message") {
        const role = payload.role;
        const text = extractMessageText(payload) ?? "";
        if (role === "user") events.push({ ts, kind: "user", text });
        else if (role === "assistant") events.push({ ts, kind: "assistant", text });
        else events.push({ ts, kind: "other", text });
      } else if (pt === "function_call" || pt === "custom_tool_call") {
        const name = typeof payload.name === "string" ? payload.name : "unknown";
        const callId = typeof payload.call_id === "string" ? payload.call_id : null;
        if (callId) callIdToName.set(callId, name);
        const args = typeof payload.arguments === "string" ? payload.arguments : null;
        const input = typeof payload.input === "string" ? payload.input : null;
        events.push({ ts, kind: "tool_call", name, text: args ?? "" });
        if (!args && input) {
          events[events.length - 1] = { ts, kind: "tool_call", name, text: input };
        }
      } else if (pt === "function_call_output" || pt === "custom_tool_call_output") {
        const callId = typeof payload.call_id === "string" ? payload.call_id : null;
        const name =
          typeof payload.name === "string" ? payload.name : callId ? callIdToName.get(callId) : undefined;
        const out = typeof payload.output === "string" ? payload.output : "";
        events.push({ ts, kind: "tool_output", name, text: out });
      }
    }

    if (events.length >= maxEvents) {
      truncated = true;
      break;
    }
  }

  return { summary, truncated, events };
}

export async function getSessionTimeline(sessionId: string): Promise<SessionTimelineResponse> {
  const index = await getIndex();
  const cacheDir = index.cacheDir;
  const session = await getSessionById(sessionId);
  const file = session?.file ?? (await findFileForSession(sessionId));

  if (!file) {
    return {
      summary: {
        id: sessionId,
        file: "",
        startedAt: null,
        endedAt: null,
        durationSec: null,
        cwd: null,
        originator: null,
        cliVersion: null,
        messages: 0,
        toolCalls: 0,
        errors: 1,
        tokensTotal: 0,
        tokensInput: 0,
        tokensOutput: 0,
        tokensCachedInput: 0,
        tokensReasoningOutput: 0
      },
      truncated: false,
      events: [{ ts: new Date().toISOString(), kind: "error", text: "未找到对应 session 文件" }]
    };
  }

  const st = await fsp.stat(file);
  const cachePath = timelineCachePath(cacheDir, sessionId);
  const cached = await readJsonFile<SessionTimelineResponse & { fileMtimeMs?: number; fileSize?: number }>(cachePath);

  const cacheHasTokenSummary =
    cached &&
    cached.summary &&
    typeof cached.summary.tokensTotal === "number" &&
    typeof cached.summary.tokensInput === "number" &&
    typeof cached.summary.tokensOutput === "number" &&
    typeof cached.summary.tokensCachedInput === "number" &&
    typeof cached.summary.tokensReasoningOutput === "number";
  const cacheHasTokenDelta =
    !cached?.events ||
    !cached.events.some(
      (event) => event.kind === "token_count" && (!event.tokenUsage || !("delta" in event.tokenUsage))
    );

  if (
    cached &&
    cached.fileMtimeMs === st.mtimeMs &&
    cached.fileSize === st.size &&
    cacheHasTokenSummary &&
    cacheHasTokenDelta
  ) {
    return { summary: cached.summary, truncated: cached.truncated, events: cached.events };
  }

  const summary = session ?? (await buildFileIndex(file)).summary;
  const built = await buildTimeline(file, summary);

  await writeJsonFile(cachePath, { ...built, fileMtimeMs: st.mtimeMs, fileSize: st.size });
  return built;
}
