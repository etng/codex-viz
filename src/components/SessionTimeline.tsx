"use client";

import useSWR from "swr";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { SessionTimelineResponse, TokenUsage, TokenUsageInfo } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function badgeClass(kind: string) {
  switch (kind) {
    case "user":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "assistant":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "tool_call":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "tool_output":
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
    case "error":
      return "bg-red-50 text-red-700 border-red-200";
    case "token_count":
      return "bg-slate-50 text-slate-600 border-slate-200";
    default:
      return "bg-white text-zinc-700 border-zinc-200";
  }
}

function bubbleAlign(kind: string) {
  if (kind === "user") return "justify-end";
  if (kind === "assistant") return "justify-start";
  return "justify-center";
}

function bubbleClass(kind: string) {
  switch (kind) {
    case "user":
      return "bg-blue-50 border-blue-200 text-slate-800";
    case "assistant":
      return "bg-emerald-50 border-emerald-200 text-slate-800";
    case "tool_call":
      return "bg-amber-50 border-amber-200 text-slate-800";
    case "tool_output":
      return "bg-slate-50 border-slate-200 text-slate-700";
    case "error":
      return "bg-rose-50 border-rose-200 text-rose-700";
    case "token_count":
      return "bg-slate-50 border-slate-100 text-slate-700";
    default:
      return "bg-white border-slate-200 text-slate-700";
  }
}

function bubbleWidth(kind: string) {
  if (kind === "user" || kind === "assistant") return "max-w-[72%]";
  return "max-w-[88%]";
}

function kindLabel(kind: string) {
  switch (kind) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool_call":
      return "tool call";
    case "tool_output":
      return "tool output";
    case "error":
      return "error";
    case "token_count":
      return "token usage";
    default:
      return "other";
  }
}

function previewText(text: string, maxChars = 600, maxLines = 10) {
  const lines = text.split("\n");
  const limitedLines = lines.slice(0, maxLines);
  const joined = limitedLines.join("\n");
  if (lines.length > maxLines || joined.length > maxChars) {
    return `${joined.slice(0, maxChars)}\n…`;
  }
  return joined;
}

function formatCount(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString();
}

function renderTokenUsageLine(prefix: string, usage?: TokenUsage | null) {
  if (!usage) return null;
  return (
    <div className="text-xs text-slate-700">
      {prefix}：总 {formatCount(usage.total)} · 输入 {formatCount(usage.input)} · 输出 {formatCount(usage.output)} · 缓存{" "}
      {formatCount(usage.cachedInput)} · 推理 {formatCount(usage.reasoningOutput)}
    </div>
  );
}

export default function SessionTimeline({ sessionId }: { sessionId: string }) {
  const { data, error, isLoading } = useSWR<SessionTimelineResponse>(
    `/api/session/${encodeURIComponent(sessionId)}`,
    fetcher
  );

  const parentRef = useRef<HTMLDivElement | null>(null);
  const [filters, setFilters] = useState({
    user: true,
    assistant: true,
    tool_call: true,
    tool_output: true,
    error: true,
    other: false
  });

  const items = useMemo(() => data?.events ?? [], [data?.events]);
  const displayItems = useMemo(() => {
    const out: (typeof items[number] & { tokenUsageMeta?: TokenUsageInfo })[] = [];
    let lastIndex = -1;
    for (const item of items) {
      if (item.kind === "token_count") {
        if (lastIndex >= 0) out[lastIndex] = { ...out[lastIndex], tokenUsageMeta: item.tokenUsage };
        continue;
      }
      out.push(item);
      lastIndex = out.length - 1;
    }
    return out;
  }, [items]);
  const filteredItems = useMemo(() => {
    return displayItems.filter((it) => filters[it.kind as keyof typeof filters]);
  }, [displayItems, filters]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      user: 0,
      assistant: 0,
      tool_call: 0,
      tool_output: 0,
      error: 0,
      other: 0
    };
    for (const it of displayItems) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [displayItems]);


  if (error) {
    return (
      <section className="panel rounded-2xl p-4 text-sm text-rose-600">
        载入失败：{String(error)}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="panel rounded-2xl p-4 text-sm text-slate-500">
        正在加载时间线…
      </section>
    );
  }

  const summary = data.summary;
  const tokenMetrics = [
    { label: "Token 总量", value: summary.tokensTotal },
    { label: "输入 Token", value: summary.tokensInput },
    { label: "输出 Token", value: summary.tokensOutput }
  ];

  return (
    <section className="space-y-3">
      <div className="panel rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            <span className="text-slate-500">开始：</span>
            <span className="tabular-nums">{summary.startedAt ?? "—"}</span>
            <span className="mx-2 text-slate-300">|</span>
            <span className="text-slate-500">结束：</span>
            <span className="tabular-nums">{summary.endedAt ?? "—"}</span>
          </div>
          <Link href="/sessions" className="text-sm text-slate-500 hover:text-slate-700">
            返回列表
          </Link>
        </div>
        <div className="mt-2 text-xs text-slate-500">cwd：{summary.cwd ?? "—"}</div>
        <div className="mt-3 grid gap-2 text-slate-600 sm:grid-cols-3">
          {tokenMetrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-slate-100 bg-white/50 p-2 text-xs">
              <div className="text-[11px] text-slate-500">{metric.label}</div>
              <div className="tabular-nums text-sm font-semibold text-slate-800">{formatCount(metric.value)}</div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          缓存输入：{formatCount(summary.tokensCachedInput)} · 推理输出：{formatCount(
            summary.tokensReasoningOutput
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(
          [
            { key: "user", label: "user" },
            { key: "assistant", label: "assistant" },
            { key: "tool_call", label: "tool call" },
            { key: "tool_output", label: "tool output" },
            { key: "error", label: "error" },
            { key: "other", label: "other" }
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
            className={`rounded-full border px-2.5 py-1 ${
              filters[f.key] ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {f.label} · {counts[f.key] ?? 0}
          </button>
        ))}
      </div>

      {data.truncated ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          事件过多，已截断显示（仅展示前 {items.length} 条）。
        </div>
      ) : null}

      <div ref={parentRef} className="panel h-[70dvh] overflow-auto rounded-2xl">
        <div className="space-y-4 px-3 py-4">
          {filteredItems.map((item, index) => {
            const text = item.text ?? "";
            const preview = previewText(text);
            const isLong = text.length > preview.length || text.split("\n").length > 10;
            const deltaUsageLine = renderTokenUsageLine("本次增量", item.tokenUsageMeta?.delta);
            const totalUsageLine = renderTokenUsageLine("累计", item.tokenUsageMeta?.total);
            return (
              <div key={`${item.ts}-${index}`} className="flex flex-col gap-2">
                <div className={`flex ${bubbleAlign(item.kind)}`}>
                  <div className={`${bubbleWidth(item.kind)} group space-y-2`}>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${badgeClass(
                          item.kind
                        )}`}
                      >
                        {kindLabel(item.kind)}
                        {item.name ? `: ${item.name}` : ""}
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-400">{item.ts}</span>
                    </div>
                    {item.text ? (
                      isLong ? (
                        <div className="space-y-2">
                          <div className={`rounded-2xl border px-3 py-2 text-xs ${bubbleClass(item.kind)}`}>
                            <pre className="whitespace-pre-wrap break-words">{preview}</pre>
                          </div>
                          <details className="text-[11px] text-slate-500">
                            <summary className="cursor-pointer">展开全文</summary>
                            <div className={`mt-2 rounded-2xl border px-3 py-2 text-xs ${bubbleClass(item.kind)}`}>
                              <pre className="whitespace-pre-wrap break-words">{text}</pre>
                            </div>
                          </details>
                        </div>
                      ) : (
                        <div className={`rounded-2xl border px-3 py-2 text-xs ${bubbleClass(item.kind)}`}>
                          <pre className="whitespace-pre-wrap break-words">{text}</pre>
                        </div>
                      )
                    ) : (
                      <div className="text-xs text-slate-500">（无文本内容）</div>
                    )}
                    {deltaUsageLine || totalUsageLine ? (
                      <div className="hidden rounded-2xl border border-slate-100 bg-white/80 px-3 py-2 text-[11px] text-slate-600 shadow-sm transition-opacity group-hover:block">
                        <div className="space-y-1">
                          <div className="text-[11px] text-slate-400">Token 用量</div>
                          {deltaUsageLine ?? (
                            <div className="text-[11px] text-slate-400">本次 token 变化未记录</div>
                          )}
                          {totalUsageLine}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="h-px bg-slate-100/70" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
