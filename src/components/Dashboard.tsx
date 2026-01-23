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

  if (error) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        载入失败：{String(error)}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        正在索引并加载数据…
      </section>
    );
  }

  const dailyKeys = useMemo(() => Object.keys(data.daily).sort(), [data.daily]);
  const dailySessions = useMemo(() => dailyKeys.map((k) => data.daily[k]?.sessions ?? 0), [dailyKeys, data.daily]);
  const dailyMessages = useMemo(() => dailyKeys.map((k) => data.daily[k]?.messages ?? 0), [dailyKeys, data.daily]);
  const dailyTools = useMemo(() => dailyKeys.map((k) => data.daily[k]?.toolCalls ?? 0), [dailyKeys, data.daily]);
  const dailyErrors = useMemo(() => dailyKeys.map((k) => data.daily[k]?.errors ?? 0), [dailyKeys, data.daily]);
  const dailyTokens = useMemo(() => dailyKeys.map((k) => data.daily[k]?.tokensTotal ?? 0), [dailyKeys, data.daily]);
  const dailyTokensInput = useMemo(() => dailyKeys.map((k) => data.daily[k]?.tokensInput ?? 0), [dailyKeys, data.daily]);
  const dailyTokensOutput = useMemo(
    () => dailyKeys.map((k) => data.daily[k]?.tokensOutput ?? 0),
    [dailyKeys, data.daily]
  );
  const dailyTokensCachedInput = useMemo(
    () => dailyKeys.map((k) => data.daily[k]?.tokensCachedInput ?? 0),
    [dailyKeys, data.daily]
  );
  const dailyTokensReasoningOutput = useMemo(
    () => dailyKeys.map((k) => data.daily[k]?.tokensReasoningOutput ?? 0),
    [dailyKeys, data.daily]
  );
  const dailyTokensPrompt = useMemo(() => dailyKeys.map((k) => data.daily[k]?.tokensInput ?? 0), [dailyKeys, data.daily]);

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

  const topTools = Object.entries(data.tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">会话数</div>
        <div className="mt-1 text-2xl font-semibold">{formatInt(stats.sessions)}</div>
        <div className="mt-2 text-xs text-zinc-500">
          区间：{dailyKeys[rangeStart] ?? "-"} ~ {dailyKeys[rangeEnd] ?? "-"}
        </div>
        <div className="mt-1 text-xs text-zinc-500">更新时间：{new Date(data.generatedAt).toLocaleString()}</div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">消息数（用户+助手）</div>
        <div className="mt-1 text-2xl font-semibold">{formatInt(stats.messages)}</div>
        <div className="mt-2 text-xs text-zinc-500">工具调用：{formatInt(stats.toolCalls)}</div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">Token</div>
        <div className="mt-1 text-2xl font-semibold">{formatInt(stats.tokensTotal)}</div>
        <div className="mt-2 text-xs text-zinc-500">Prompt(含缓存) {formatInt(stats.tokensInput)}</div>
        <div className="mt-1 text-xs text-zinc-500">
          输入 {formatInt(stats.tokensInput)} / 缓存输入 {formatInt(stats.tokensCachedInput)}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          输出 {formatInt(stats.tokensOutput)} / 推理输出 {formatInt(stats.tokensReasoningOutput)}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">错误/中断</div>
        <div className="mt-1 text-2xl font-semibold">{formatInt(stats.errors)}</div>
        <div className="mt-2 text-xs text-zinc-500">session 文件：{formatInt(data.totals.files)}</div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 md:col-span-3">
        <div className="mb-2 text-sm font-medium text-zinc-900">趋势</div>
        <ReactECharts
          style={{ height: 300 }}
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
            tooltip: { trigger: "axis" },
            legend: {
              data: ["会话", "消息", "工具", "Token", "Prompt(含缓存)", "输入", "输出", "缓存输入", "推理输出"],
              selected: { 输入: false, 缓存输入: false }
            },
            grid: { left: 40, right: 20, top: 30, bottom: 40 },
            dataZoom: [
              { type: "inside", xAxisIndex: 0, start: zoom?.start, end: zoom?.end },
              { type: "slider", xAxisIndex: 0, height: 18, bottom: 8, start: zoom?.start, end: zoom?.end }
            ],
            xAxis: { type: "category", data: dailyKeys, axisLabel: { hideOverlap: true } },
            yAxis: { type: "value" },
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

      <div className="md:col-span-2">
        <UserWordCloud />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-2 text-sm font-medium text-zinc-900">Top 工具</div>
        <ol className="space-y-1 text-sm text-zinc-700">
          {topTools.length === 0 ? (
            <li className="text-zinc-500">暂无工具调用</li>
          ) : (
            topTools.map(([name, count]) => (
              <li key={name} className="flex items-center justify-between gap-2">
                <span className="truncate">{name}</span>
                <span className="tabular-nums text-zinc-500">{formatInt(count)}</span>
              </li>
            ))
          )}
        </ol>
      </div>
    </section>
  );
}
