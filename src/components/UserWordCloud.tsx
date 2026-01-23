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
      <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        词云加载失败：{String(error)}
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        正在生成词云…
      </section>
    );
  }

  if (!data.items.length) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        最近 {data.days ?? "全部"} 天暂无可展示的词（min={data.minCount}）。
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-zinc-900">User 输入词云</div>
          <div className="mt-1 text-xs text-zinc-500">
            最近 {data.days ?? "全部"} 天 · min={data.minCount} · top={data.limit} · unique≈{data.totalUnique}
          </div>
        </div>
      </div>
      {!pluginReady ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">正在加载词云组件…</div>
      ) : (
        <ReactECharts
          style={{ height: 360 }}
          option={{
            tooltip: { formatter: (p: any) => `${p.name}: ${p.value}` },
            series: [
              {
                type: "wordCloud",
                shape: "circle",
                gridSize: 6,
                sizeRange: [10, 52],
                rotationRange: [-30, 30],
                textStyle: {
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
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
