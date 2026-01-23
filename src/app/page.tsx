import Link from "next/link";
import Dashboard from "@/components/Dashboard";

export default async function Page() {
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Codex Viz</h1>
          <p className="mt-1 text-sm text-zinc-600">本地读取 ~/.codex/sessions，SQLite 索引加速。</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/sessions"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          >
            会话列表
          </Link>
        </div>
      </header>

      <Dashboard />

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-900">提示</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
          <li>首次打开会进行索引（流式解析 jsonl），之后会增量更新缓存。</li>
          <li>默认读取目录：~/.codex/sessions，可用环境变量 CODEX_SESSIONS_DIR 覆盖。</li>
          <li>默认缓存目录：~/.codex-viz/cache，可用环境变量 CODEX_VIZ_CACHE_DIR 覆盖。</li>
        </ul>
      </section>
    </main>
  );
}
