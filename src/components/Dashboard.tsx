"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import type { IndexSnapshot } from "@/lib/types";
import UserWordCloud from "@/components/UserWordCloud";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatInt(n: number) {
  return Intl.NumberFormat("zh-CN").format(n);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function sumSlice(values: number[], start: number, end: number) {
  if (values.length === 0) return 0;
  let total = 0;
  for (let i = start; i <= end; i++) total += values[i] ?? 0;
  return total;
}

export default function Dashboard() {
  const { data, error, isLoading } = useSWR<IndexSnapshot>("/api/index", fetcher, {
    refreshInterval: 15_000
  });
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const safeDaily = data?.daily ?? {};
  const safeTools = data?.tools ?? {};

  const dailyKeys = useMemo(() => Object.keys(safeDaily).sort(), [safeDaily]);
  const dailySessions = useMemo(() => dailyKeys.map((k) => safeDaily[k]?.sessions ?? 0), [dailyKeys, safeDaily]);
  const dailyMessages = useMemo(() => dailyKeys.map((k) => safeDaily[k]?.messages ?? 0), [dailyKeys, safeDaily]);
  const dailyTools = useMemo(() => dailyKeys.map((k) => safeDaily[k]?.toolCalls ?? 0), [dailyKeys, safeDaily]);
  const dailyErrors = useMemo(() => dailyKeys.map((k) => safeDaily[k]?.errors ?? 0), [dailyKeys, safeDaily]);
  const dailyTokens = useMemo(() => dailyKeys.map((k) => safeDaily[k]?.tokensTotal ?? 0), [dailyKeys, safeDaily]);
  const dailyTokensInput = useMemo(() => dailyKeys.map((k) => safeDaily[k]?.tokensInput ?? 0), [dailyKeys, safeDaily]);
  const dailyTokensOutput = useMemo(
    () => dailyKeys.map((k) => safeDaily[k]?.tokensOutput ?? 0),
    [dailyKeys, safeDaily]
  );
  const dailyTokensCachedInput = useMemo(
    () => dailyKeys.map((k) => safeDaily[k]?.tokensCachedInput ?? 0),
    [dailyKeys, safeDaily]
  );
  const dailyTokensReasoningOutput = useMemo(
    () => dailyKeys.map((k) => safeDaily[k]?.tokensReasoningOutput ?? 0),
    [dailyKeys, safeDaily]
  );
  const dailyTokensPrompt = useMemo(() => dailyKeys.map((k) => safeDaily[k]?.tokensInput ?? 0), [dailyKeys, safeDaily]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const total = dailyKeys.length;
    if (!total) return { rangeStart: 0, rangeEnd: 0 };
    if (!zoom) return { rangeStart: 0, rangeEnd: total - 1 };
    const start = clamp(Math.floor((zoom.start / 100) * (total - 1)), 0, total - 1);
    const end = clamp(Math.ceil((zoom.end / 100) * (total - 1)), start, total - 1);
    return { rangeStart: start, rangeEnd: end };
  }, [dailyKeys.length, zoom]);

  const stats = useMemo(
    () => ({
      sessions: sumSlice(dailySessions, rangeStart, rangeEnd),
      messages: sumSlice(dailyMessages, rangeStart, rangeEnd),
      toolCalls: sumSlice(dailyTools, rangeStart, rangeEnd),
      errors: sumSlice(dailyErrors, rangeStart, rangeEnd),
      tokensTotal: sumSlice(dailyTokens, rangeStart, rangeEnd),
      tokensInput: sumSlice(dailyTokensInput, rangeStart, rangeEnd),
      tokensOutput: sumSlice(dailyTokensOutput, rangeStart, rangeEnd),
      tokensCachedInput: sumSlice(dailyTokensCachedInput, rangeStart, rangeEnd),
      tokensReasoningOutput: sumSlice(dailyTokensReasoningOutput, rangeStart, rangeEnd)
    }),
    [
      dailySessions,
      dailyMessages,
      dailyTools,
      dailyErrors,
      dailyTokens,
      dailyTokensInput,
      dailyTokensOutput,
      dailyTokensCachedInput,
      dailyTokensReasoningOutput,
      rangeStart,
      rangeEnd
    ]
  );

  const topTools = Object.entries(safeTools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

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
        正在索引并加载数据…
      </section>
    );
  }

  const rangeLabel = `${dailyKeys[rangeStart] ?? "-"} ~ ${dailyKeys[rangeEnd] ?? "-"}`;
  const generatedAt = new Date(data.generatedAt).toLocaleString();

  return (
    <section className="space-y-6">
      <div className="mb-2 flex flex-col items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white/50 p-6 shadow-sm backdrop-blur-xl md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">数据概览</h2>
            <div className="flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 shadow-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"></span>
              </span>
              Local-first Intelligence
            </div>
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            当前显示 {rangeLabel} 的会话数据，支持拖动时间轴进行多维分析。
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex flex-col items-end gap-1">
            <span className="text-slate-400">更新于 {generatedAt}</span>
            <span className="flex items-center gap-1 font-medium text-emerald-600">
              索引服务正常
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="panel panel-glow relative overflow-hidden rounded-2xl p-5">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-500/15 blur-2xl" />
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">会话数</div>
          <div className="mt-4 flex items-end justify-between">
            <div className="mono text-3xl font-semibold text-slate-900">{formatInt(stats.sessions)}</div>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-600">
              区间
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500">{rangeLabel}</div>
        </div>

        <div className="panel relative overflow-hidden rounded-2xl p-5">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl" />
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">消息量</div>
          <div className="mt-4 flex items-end justify-between">
            <div className="mono text-3xl font-semibold text-slate-900">{formatInt(stats.messages)}</div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-600">
              工具 {formatInt(stats.toolCalls)}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500">用户 + 助手</div>
        </div>

        <div className="panel relative overflow-hidden rounded-2xl p-5">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-500/15 blur-2xl" />
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Token</div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
            <div className="mono text-3xl font-semibold text-slate-900">{formatInt(stats.tokensTotal)}</div>
            <span className="max-w-full rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] text-cyan-700">
              Prompt {formatInt(stats.tokensInput)}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            缓存 {formatInt(stats.tokensCachedInput)} · 输出 {formatInt(stats.tokensOutput)}
          </div>
        </div>

        <div className="panel relative overflow-hidden rounded-2xl p-5">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/15 blur-2xl" />
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">错误/中断</div>
          <div className="mt-4 flex items-end justify-between">
            <div className="mono text-3xl font-semibold text-slate-900">{formatInt(stats.errors)}</div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              文件 {formatInt(data.totals.files)}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500">影响会话质量</div>
        </div>
      </div>

      <div className="panel rounded-3xl p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">趋势雷达</div>
            <div className="mt-1 text-xs text-slate-500">多维度趋势，可缩放区间自动刷新指标</div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600">
            Zoom: {rangeLabel}
          </div>
        </div>
        <ReactECharts
          style={{ height: 320 }}
          onEvents={{
            dataZoom: (params: any) => {
              const payload = Array.isArray(params?.batch) ? params.batch[0] : params;
              const start = typeof payload?.start === "number" ? payload.start : null;
              const end = typeof payload?.end === "number" ? payload.end : null;
              if (start == null || end == null) return;
              setZoom({ start, end });
            }
          }}
          option={{
            backgroundColor: "transparent",
            color: ["#2563eb", "#16a34a", "#f59e0b", "#0ea5e9", "#22c55e", "#94a3b8", "#f97316", "#06b6d4", "#a855f7"],
            tooltip: {
              trigger: "axis",
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              borderColor: "rgba(148, 163, 184, 0.35)",
              textStyle: { color: "#0f172a" }
            },
            legend: {
              data: ["会话", "消息", "工具", "Token", "Prompt(含缓存)", "输入", "输出", "缓存输入", "推理输出"],
              selected: {
                会话: true,
                消息: true,
                工具: true,
                Token: false,
                "Prompt(含缓存)": false,
                输入: false,
                输出: false,
                缓存输入: false,
                推理输出: false
              },
              textStyle: { color: "#64748b" }
            },
            grid: { left: 40, right: 20, top: 36, bottom: 54 },
            dataZoom: [
              { type: "inside", xAxisIndex: 0, start: zoom?.start, end: zoom?.end },
              {
                type: "slider",
                xAxisIndex: 0,
                height: 20,
                bottom: 10,
                borderColor: "rgba(148, 163, 184, 0.35)",
                fillerColor: "rgba(37, 99, 235, 0.12)",
                handleStyle: { color: "rgba(37, 99, 235, 0.6)" },
                start: zoom?.start,
                end: zoom?.end
              }
            ],
            xAxis: {
              type: "category",
              data: dailyKeys,
              axisLabel: { hideOverlap: true, color: "#64748b" },
              axisLine: { lineStyle: { color: "rgba(148, 163, 184, 0.35)" } }
            },
            yAxis: {
              type: "value",
              axisLabel: { color: "#64748b" },
              splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.18)" } }
            },
            series: [
              { name: "会话", type: "line", smooth: true, data: dailySessions },
              { name: "消息", type: "line", smooth: true, data: dailyMessages },
              { name: "工具", type: "line", smooth: true, data: dailyTools },
              { name: "Token", type: "line", smooth: true, data: dailyTokens },
              { name: "Prompt(含缓存)", type: "line", smooth: true, data: dailyTokensPrompt },
              { name: "输入", type: "line", smooth: true, data: dailyTokensInput },
              { name: "输出", type: "line", smooth: true, data: dailyTokensOutput },
              { name: "缓存输入", type: "line", smooth: true, data: dailyTokensCachedInput },
              { name: "推理输出", type: "line", smooth: true, data: dailyTokensReasoningOutput }
            ]
          }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <UserWordCloud />
        </div>
        <div className="panel rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Top 工具</div>
            <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[11px] text-slate-600">
              使用频率
            </span>
          </div>
          <ol className="space-y-2 text-sm text-slate-600">
            {topTools.length === 0 ? (
              <li className="text-slate-500">暂无工具调用</li>
            ) : (
              topTools.map(([name, count]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700">{name}</span>
                  <span className="mono text-xs text-slate-500">{formatInt(count)}</span>
                </li>
              ))
            )}
          </ol>
        </div>
      </div>
    </section>
  );
}
