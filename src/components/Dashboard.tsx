"use client";

import useSWR from "swr";
import dynamic from "next/dynamic";
import type { IndexSnapshot } from "@/lib/types";
import UserWordCloud from "@/components/UserWordCloud";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatInt(n: number) {
  return Intl.NumberFormat("zh-CN").format(n);
}

export default function Dashboard() {
  const { data, error, isLoading } = useSWR<IndexSnapshot>("/api/index", fetcher, {
    refreshInterval: 15_000
  });

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

  const dailyKeys = Object.keys(data.daily).sort();
  const dailySessions = dailyKeys.map((k) => data.daily[k]?.sessions ?? 0);
  const dailyMessages = dailyKeys.map((k) => data.daily[k]?.messages ?? 0);
  const dailyTools = dailyKeys.map((k) => data.daily[k]?.toolCalls ?? 0);

  const topTools = Object.entries(data.tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">会话数</div>
        <div className="mt-1 text-2xl font-semibold">{formatInt(data.totals.sessions)}</div>
        <div className="mt-2 text-xs text-zinc-500">更新时间：{new Date(data.generatedAt).toLocaleString()}</div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">消息数（用户+助手）</div>
        <div className="mt-1 text-2xl font-semibold">{formatInt(data.totals.messages)}</div>
        <div className="mt-2 text-xs text-zinc-500">工具调用：{formatInt(data.totals.toolCalls)}</div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm text-zinc-600">错误/中断</div>
        <div className="mt-1 text-2xl font-semibold">{formatInt(data.totals.errors)}</div>
        <div className="mt-2 text-xs text-zinc-500">session 文件：{formatInt(data.totals.files)}</div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 md:col-span-2">
        <div className="mb-2 text-sm font-medium text-zinc-900">趋势</div>
        <ReactECharts
          style={{ height: 300 }}
          option={{
            tooltip: { trigger: "axis" },
            legend: { data: ["会话", "消息", "工具"] },
            grid: { left: 40, right: 20, top: 30, bottom: 40 },
            xAxis: { type: "category", data: dailyKeys, axisLabel: { hideOverlap: true } },
            yAxis: { type: "value" },
            series: [
              { name: "会话", type: "line", smooth: true, data: dailySessions },
              { name: "消息", type: "line", smooth: true, data: dailyMessages },
              { name: "工具", type: "line", smooth: true, data: dailyTools }
            ]
          }}
        />
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

      <div className="md:col-span-3">
        <UserWordCloud />
      </div>
    </section>
  );
}
