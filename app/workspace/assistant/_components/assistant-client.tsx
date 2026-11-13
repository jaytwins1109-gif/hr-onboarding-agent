'use client';

// 员工服务助手聊天界面（文档第 15 步）。
// 本步只负责「问与记」：回复由服务端给固定占位话术，真正的制度检索与带依据回答在下一步接入。

import { useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, BookOpen, CalendarDays, ClipboardList, Loader2, Sparkles } from 'lucide-react';
import { MAX_QUESTION_LENGTH } from '@/lib/workspace/consultations';

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  seq: number;
  createdAt: string;
}

export interface InitialConsultation {
  id: string;
  title: string;
  messages: ChatMessage[];
}

interface Props {
  name: string;
  initialConsultation: InitialConsultation | null;
}

const QUICK_CARDS = [
  {
    label: '了解公司制度',
    hint: '看看有哪些制度可以查',
    question: '公司有哪些制度可以查？',
    icon: BookOpen,
  },
  {
    label: '查查我的年假',
    hint: '只查本人记录',
    question: '我今年还剩多少年假？',
    icon: CalendarDays,
  },
  {
    label: '找到办事方法',
    hint: '报销、请假怎么走',
    question: '报销应该怎么办？',
    icon: ClipboardList,
  },
];

const SAMPLE_QUESTIONS = ['年假可以结转到明年吗？', '试用期有哪些规定？'];

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function AssistantClient({ name, initialConsultation }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialConsultation?.messages ?? []);
  const [consultationId, setConsultationId] = useState<string | null>(
    initialConsultation?.id ?? null,
  );
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(preset?: string) {
    const content = (preset ?? draft).trim();
    if (!content || busy) return;
    if (content.length > MAX_QUESTION_LENGTH) {
      setError(`问题最多 ${MAX_QUESTION_LENGTH} 字，请精简后再发`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/workspace/consultations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: content, consultationId }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        consultationId?: string;
        messages?: ChatMessage[];
      } | null;
      if (!res.ok) {
        setError(data?.error || '发送失败，请稍后再试');
        return;
      }
      setMessages(data?.messages ?? []);
      setConsultationId(data?.consultationId ?? null);
      setDraft('');
      // 让服务端重取侧栏「最近咨询」，新会话立刻出现在列表里
      router.refresh();
    } catch {
      setError('连接不上服务，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 输入法选字时的回车不能误发送（keyCode 229 覆盖部分浏览器的合成事件）
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const showWelcome = messages.length === 0 && !busy;

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[560px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {initialConsultation ? initialConsultation.title : '开始新咨询'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">工作中的疑问，从这里开始。</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          员工服务助手
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {showWelcome ? (
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center gap-2 text-blue-700">
              <Sparkles className="h-5 w-5" />
              <span className="text-xs font-medium">你好，{name}</span>
            </div>
            <h3 className="mt-4 text-2xl font-bold text-slate-900">工作中的疑问，从这里开始。</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              可以先从下面的话题开始，也可以直接输入你的问题。
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {QUICK_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.label}
                    type="button"
                    onClick={() => void send(card.question)}
                    className="group rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-400 hover:bg-blue-50"
                  >
                    <Icon className="h-5 w-5 text-blue-700" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">{card.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                  </button>
                );
              })}
            </div>

            <p className="mt-7 text-xs font-medium text-slate-500">试着问问</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SAMPLE_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void send(question)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:border-blue-400 hover:text-blue-700"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-blue-700 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p
                      className={`mt-2 text-[11px] ${isUser ? 'text-blue-100' : 'text-slate-400'}`}
                    >
                      {timeLabel(message.createdAt)}
                      {!isUser && ' · 本轮为占位回复，不作为制度依据'}
                    </p>
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在提交你的问题…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm focus-within:border-blue-500">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_QUESTION_LENGTH}
              rows={2}
              placeholder="输入你的问题，例如：我还有几天年假？"
              className="min-h-[48px] flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              aria-label="发送问题"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
            <span>回车发送，Shift + 回车换行</span>
            <span>
              {draft.length}/{MAX_QUESTION_LENGTH}
            </span>
          </div>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
          <p className="mt-3 text-xs font-medium text-slate-500">回答前核对制度与数据</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            制度解释附原文依据；个人信息仅查询本人记录。依据不足时会明确说明。
          </p>
        </div>
      </div>
    </div>
  );
}
