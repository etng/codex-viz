"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import type { WordCloudResponse } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function UserWordCloud() {
  const [pluginReady, setPluginReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("echarts-wordcloud")
      .then(() => {
        if (!cancelled) setPluginReady(true);
      })
      .catch(() => {
        if (!cancelled) setPluginReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data, error, isLoading } = useSWR<WordCloudResponse>("/api/wordcloud?days=30&limit=200&min=2", fetcher, {
    refreshInterval: 30_000
  });

  if (error) {
    return (
      <section className="panel rounded-2xl p-4 text-sm text-rose-600">
        词云加载失败：{String(error)}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="panel rounded-2xl p-4 text-sm text-slate-500">
        正在生成词云…
      </section>
    );
  }

  if (!data.items.length) {
    return (
      <section className="panel rounded-2xl p-4 text-sm text-slate-500">
        最近 {data.days ?? "全部"} 天暂无可展示的词（min={data.minCount}）。
      </section>
    );
  }

  const palette = ["#2563eb", "#16a34a", "#f59e0b", "#0ea5e9", "#22c55e", "#06b6d4", "#a855f7"];

  return (
    <section className="panel rounded-2xl p-5">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">User 输入词云</div>
          <div className="mt-1 text-xs text-slate-500">
            最近 {data.days ?? "全部"} 天 · min={data.minCount} · top={data.limit} · unique≈{data.totalUnique}
          </div>
        </div>
      </div>
      {!pluginReady ? (
        <div className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-500">
          正在加载词云组件…
        </div>
      ) : (
        <ReactECharts
          style={{ height: 360 }}
          option={{
            tooltip: {
              formatter: (p: any) => `${p.name}: ${p.value}`,
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              borderColor: "rgba(148, 163, 184, 0.35)",
              textStyle: { color: "#0f172a" }
            },
            series: [
              {
                type: "wordCloud",
                shape: "circle",
                gridSize: 6,
                sizeRange: [10, 52],
                rotationRange: [-30, 30],
                textStyle: {
                  fontFamily: "\"Space Grotesk\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif",
                  color: () => palette[Math.floor(Math.random() * palette.length)]
                },
                emphasis: { focus: "self" },
                data: data.items
              }
            ]
          }}
        />
      )}
    </section>
  );
}
