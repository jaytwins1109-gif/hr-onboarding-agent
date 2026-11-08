// app/developer/page.tsx — 开发者控制台：系统基本信息一眼看清（server 组件）
//
// 只读诊断信息，不含任何可变状态：Node 版本、数据库连通性、当前时间、
// 运行环境。prompt 预览在 /developer/prompt。
import { prisma } from '@/lib/db';
import { buildTimeContext } from '@/lib/prompts/system-prompt';

export const dynamic = 'force-dynamic'; // 时间/数据库状态必须实时，禁止构建期静态化

export const metadata = {
  title: '开发者控制台',
};

export default async function DeveloperPage() {
  // 数据库连通性探测：能查数就是 green，查不动把错误信息摆出来
  let dbStatus = 'unknown';
  let dbLatency = '';
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
    dbLatency = `${Date.now() - dbStart}ms`;
  } catch (err) {
    dbStatus = 'error';
    dbLatency = err instanceof Error ? err.message.slice(0, 80) : 'unknown error';
  }

  const rows: Array<[string, string]> = [
    ['Node 版本', process.version],
    ['运行环境', process.env.NODE_ENV ?? 'unknown'],
    ['平台', `${process.platform} · ${process.arch}`],
    [
      '数据库',
      `${dbStatus}${dbLatency && dbStatus === 'connected' ? ` · ${dbLatency}` : ''}${dbStatus === 'error' ? ` · ${dbLatency}` : ''}`,
    ],
    ['当前时间', buildTimeContext().split('\n')[0].replace('【时间上下文】当前时间是：', '')],
    ['用户总数', String(await prisma.user.count())],
    ['知识库条目', String(await prisma.knowledgeItem.count())],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-100">开发者控制台</h1>
        <p className="mt-1 text-sm text-slate-400">
          底层系统信息只读诊断。Prompt 预览见左侧「Prompt 预览」。
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-800">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`flex items-center gap-4 px-4 py-3 ${
              i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/60'
            }`}
          >
            <span className="w-28 shrink-0 text-xs font-medium tracking-wide text-slate-500">
              {label}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200">
              {value}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
