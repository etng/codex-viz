import Link from "next/link";
import Dashboard from "@/components/Dashboard";
import { Logo } from "@/components/Logo";

export default async function Page() {
  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Codex Viz</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="https://github.com/onewesong/codex-viz.git"
            aria-label="GitHub"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white/50 p-2 text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
              <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.5-1.11-1.5-.9-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.9.85.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.02-2.75-.1-.26-.44-1.3.1-2.71 0 0 .83-.27 2.73 1.02a9.18 9.18 0 0 1 4.98 0c1.9-1.29 2.73-1.02 2.73-1.02.54 1.41.2 2.45.1 2.71.64.72 1.02 1.63 1.02 2.75 0 3.95-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92 0 1.38-.01 2.49-.01 2.83 0 .26.18.59.69.48A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
            </svg>
          </Link>
          <Link
            href="/sessions"
            className="rounded-lg border border-slate-200 bg-white/50 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
          >
            会话列表
          </Link>
        </div>
      </header>

      <Dashboard />

      <section className="panel rounded-2xl p-4">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-slate-700">
            <span className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-blue-400" />
              提示
            </span>
            <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">▶</span>
          </summary>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>首次打开会进行索引（流式解析 jsonl），之后会增量更新缓存。</li>
              <li>默认读取目录：~/.codex/sessions，可用环境变量 CODEX_SESSIONS_DIR 覆盖。</li>
              <li>默认缓存目录：~/.codex-viz/cache，可用环境变量 CODEX_VIZ_CACHE_DIR 覆盖。</li>
            </ul>
          </div>
        </details>
      </section>

      <footer className="py-4 text-center text-xs text-slate-400">
        Powered by onewesong with ♥️
      </footer>
    </main>
  );
}
