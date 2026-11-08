// app/developer/prompt/page.tsx — System Prompt 只读预览（server 组件）
//
// 展示与真实 LLM 调用**同一真源**拼接出的完整 Prompt（buildLiveSystemPrompt：
// 实时时间上下文 + SYSTEM_PROMPT）。模拟 new_hire 视角——这是 C 端兜底链的默认角色。
// 只读：Prompt 硬编码于 lib/prompts/system-prompt.ts，此页面不做任何编辑功能。
import { buildLiveSystemPrompt } from '@/lib/prompts/system-prompt';

export const dynamic = 'force-dynamic'; // 时间上下文每次刷新都要是"现在"

export const metadata = {
  title: 'Prompt 预览 - 开发者后台',
};

export default function DeveloperPromptPage() {
  const prompt = buildLiveSystemPrompt('new_hire');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-100">Prompt 预览</h1>
        <p className="mt-1 text-sm text-slate-400">
          模拟视角：
          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-violet-300">
            userRole = &apos;new_hire&apos;
          </code>
          （C 端兜底链默认角色）· 生成于页面加载时刻
        </p>
      </header>

      {/* 只读提示条 */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-800/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
        <span aria-hidden="true">⚠️</span>
        <span>开发者专属只读面板。Prompt 硬编码于代码中，此处仅供排查逻辑。</span>
      </div>

      {/* 暗黑代码块：长文本自动换行 */}
      <pre className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-5 text-[13px] leading-relaxed text-slate-200">
        <code className="whitespace-pre-wrap break-words font-mono">{prompt}</code>
      </pre>
    </div>
  );
}
