"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { SessionSummary, SessionsListResponse } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDate(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function formatSec(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function SessionsTable() {
  const [onlyWithTools, setOnlyWithTools] = useState(false);
  const [onlyWithErrors, setOnlyWithErrors] = useState(false);
  const [q, setQ] = useState("");
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
  }, [onlyWithTools, onlyWithErrors, q]);

  const key = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (onlyWithTools) sp.set("withTools", "1");
    if (onlyWithErrors) sp.set("withErrors", "1");
    sp.set("limit", String(limit));
    sp.set("offset", String(offset));
    return `/api/sessions?${sp.toString()}`;
  }, [q, onlyWithTools, onlyWithErrors, limit, offset]);

  const { data, error, isLoading } = useSWR<SessionsListResponse>(key, fetcher, {
    refreshInterval: 15_000
  });

  const sessions = useMemo(() => {
    return data?.items ?? [];
  }, [data?.items]);

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
        正在加载…
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={onlyWithTools}
              onChange={(e) => setOnlyWithTools(e.target.checked)}
            />
            仅看包含工具
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={onlyWithErrors}
              onChange={(e) => setOnlyWithErrors(e.target.checked)}
            />
            仅看有错误/中断
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索 id/cwd/originator…"
            className="w-64 max-w-[70vw] rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <div>
          共 {data?.total ?? 0} 条，当前展示 {sessions.length} 条（offset={offset}）
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 hover:bg-zinc-50"
          >
            回到第一页
          </button>
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((v) => Math.max(0, v - limit))}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 hover:bg-zinc-50 disabled:opacity-50"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={offset + limit >= (data?.total ?? 0)}
            onClick={() => setOffset((v) => v + limit)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 hover:bg-zinc-50 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-zinc-600">
              <th className="px-2">开始</th>
              <th className="px-2">时长</th>
              <th className="px-2">消息</th>
              <th className="px-2">工具</th>
              <th className="px-2">错误</th>
              <th className="px-2">cwd</th>
              <th className="px-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td className="px-2 py-6 text-zinc-500" colSpan={7}>
                  没有匹配的会话。
                </td>
              </tr>
            ) : (
              sessions.map((s: SessionSummary) => (
                <tr key={s.id} className="rounded-lg bg-zinc-50 text-zinc-800">
                  <td className="px-2 py-2 tabular-nums">{formatDate(s.startedAt)}</td>
                  <td className="px-2 py-2 tabular-nums">{formatSec(s.durationSec ?? null)}</td>
                  <td className="px-2 py-2 tabular-nums">{s.messages ?? 0}</td>
                  <td className="px-2 py-2 tabular-nums">{s.toolCalls ?? 0}</td>
                  <td className="px-2 py-2 tabular-nums">{s.errors ?? 0}</td>
                  <td className="px-2 py-2 max-w-[320px] truncate text-zinc-600">{s.cwd ?? "—"}</td>
                  <td className="px-2 py-2">
                    <Link
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs hover:bg-zinc-50"
                      href={`/sessions/${encodeURIComponent(s.id)}`}
                    >
                      查看
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
