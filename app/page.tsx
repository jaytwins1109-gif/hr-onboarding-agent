'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { AuthDialog, type AuthMode } from './_components/auth-dialog';
import { Bubble } from './_components/bubble';
import { HeroCard, SkeletonBubble } from './_components/hero-card';
import { Mascot } from './_components/mascot';
import { NavBtn } from './_components/nav-btn';
import { useAuth } from './_components/use-auth';
import { useDebouncedWrite } from './_components/use-debounced-write';
import {
  DEPRECATED_KEYS,
  OLD_ERA_PATTERN,
  QUICK,
  STORE_KEY,
  WELCOME,
  WELCOME_CARDS,
} from './_components/constants';
import type { Msg } from './_components/types';

// ────────────────────────────────────────────────
//  主壳子
// ────────────────────────────────────────────────
export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  /** 右侧「我的」抽屉：账号与聊天记录 */
  const [myOpen, setMyOpen] = useState(false);
  /**
   * 读档完成了吗？没完成之前**不许写盘**。
   *
   * 首帧的 messages 只有欢迎语，读档是 effect 里做的。放行太早的话，
   * 落盘逻辑会先把"只有欢迎语"这一版写回去，把历史覆盖掉。
   */
  const [hydrated, setHydrated] = useState(false);

  /**
   * 账号态：真源在服务端 cookie，这里只是它的投影。
   * `userId` 未登录时是本地那个 u_xxx——升级不换 id，所以历史天然继承。
   */
  const auth = useAuth();
  /** 登录/注册弹窗；null = 关着 */
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  /**
   * 统一请求头：游客身份走 `x-guest-id`（服务端以它为准），
   * 登录态则认 HttpOnly cookie（`credentials: same-origin` 带上）。
   * 两条并存：已登录时 cookie 优先，头里的 id 会被忽略——这是服务端定的优先级。
   */
  function requestHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-guest-id': auth.userId };
  }

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 会话代号：每开一次新对话就 +1。
   *
   * 流式响应是异步回来的，掐断之后队列里可能还躺着几个 delta 或 final。
   * 渲染前比对一下代号，不是当前会话就整个丢掉——
   * 否则用户看到的就是「开了新对话，上一句又迟到了一下」。
   */
  const sessionId = useRef(0);
  /** 正在进行的流式请求；开新对话时用它掐断，别让旧流继续往下读 */
  const streamAbort = useRef<AbortController | null>(null);

  // 进来先捞上次的记录。
  // 旧业务（零食助手「脆脆」）时代的残留必须在这里拦下：
  // ① 三把废弃 key（`cx_profile_v1` / `cx_want_v1` / `cx_profile_reset_20261102`）直接删掉；
  // ② `cx_chat_v1` 里如果混着旧时代的消息（「脆脆」「零食」等关键词），读档即销毁——
  //    只删聊天记录这一把 key，登录票据（cookie）与用户标识（USER_KEY）都不碰。
  useEffect(() => {
    let restored = false;
    try {
      // 1. 旧版本废弃 key：功能上已无用，顺手清掉，避免"彻底清理"只清一半
      for (const dead of DEPRECATED_KEYS) {
        if (localStorage.getItem(dead) !== null) localStorage.removeItem(dead);
      }

      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved?.messages)) {
          // 2. 旧时代串台检查：消息里出现零食业务关键词就整份作废，
          //    只清 STORE_KEY，回到干净的欢迎语初始状态。
          const fromOldEra = saved.messages.some(
            (m: any) => typeof m?.content === 'string' && OLD_ERA_PATTERN.test(m.content),
          );
          if (fromOldEra) {
            localStorage.removeItem(STORE_KEY);
          } else {
            // 旧档里可能混着旧业务的「纯卡片消息」（content 为空、cards 有值）：
            // 卡片渲染已删，这类消息会变成空气泡，直接丢掉；有过渡语的保留成普通气泡。
            const usable = saved.messages.filter(
              (m: any) => m && typeof m.content === 'string' && m.content.trim(),
            );
            if (usable.length) {
              setMessages(usable);
              restored = true;
            }
          }
        }
      }
    } catch {
      // 存坏了就当没存过；顺手把这把 key 也清掉，防止下次再炸
      try {
        localStorage.removeItem(STORE_KEY);
      } catch {
        /* 忽略 */
      }
    }

    // 没有历史可捞时，欢迎语是唯一一条没时间戳的消息，挂载后给它补上。
    // 捞到历史就不补：那批消息带着发送当时的时间，不能被改写成"现在"。
    if (!restored) {
      setMessages((prev) => prev.map((m) => (m.ts ? m : { ...m, ts: Date.now() })));
    }

    // 到这里内存里的状态才是"用户上次看到的那一版"，现在才允许落盘
    setHydrated(true);
  }, []);

  // 落盘：debounce 写，别让流式每吐一个字就同步 setItem 一次。
  // 引用要靠 useMemo 稳住，否则输入框敲一个字也会把定时器重置掉。
  const storeSnapshot = useMemo(() => ({ messages }), [messages]);
  useDebouncedWrite(STORE_KEY, storeSnapshot, hydrated, 400);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // 输入框随内容长高，最多到 160px 后自己滚
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  /**
   * 注册 / 登录提交。
   * 账号态由 `useAuth` 内部 refresh 收口，这里只负责弹窗的开关与报错展示。
   */
  async function handleAuthSubmit(email: string, password: string) {
    const mode = authMode;
    if (!mode || authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const r =
        mode === 'upgrade'
          ? await auth.upgrade(email, password)
          : await auth.login(email, password);
      if (!r.ok) {
        setAuthError(r.error || '没成功，稍后再试');
        return;
      }
      setAuthMode(null);
    } finally {
      setAuthBusy(false);
    }
  }

  /** 退出登录：只清登录态，聊天记录留在本机 */
  async function handleLogout() {
    await auth.logout();
  }

  function openAuth(mode: AuthMode) {
    setAuthError(null);
    setAuthMode(mode);
  }

  /**
   * 把后端返回落到界面上。一次性接口与流式 final 共用这一份——
   * 两条路各写一遍，渲染逻辑迟早长歪。
   *
   * @param replaceId 流式占位气泡的 id；传了就替换它，没传就追加新消息
   * @param refreshed 最终文案和流式已吐的字不一致（被本地改写过）：挂淡入动画
   */
  function applyPayload(data: any, replaceId?: string, refreshed?: boolean) {
    // 洗一遍再入列：空白文本会渲染成空气泡
    const replyText = typeof data?.reply === 'string' ? data.reply.trim() : '';

    const msg: Msg | null = replyText
      ? { role: 'assistant', content: replyText, ts: Date.now(), refreshed }
      : null;

    if (replaceId) {
      setMessages((prev) => {
        const rest = prev.filter((m) => m.id !== replaceId);
        return msg ? [...rest, msg] : rest;
      });
    } else if (msg) {
      setMessages((prev) => [...prev, msg]);
    }
  }

  /**
   * 新建会话：只重置「这一轮对话」。
   *
   * 环境类的东西不动：皮肤、本地聊天记录以外的设置都属于用户主动设的，
   * 不属于"这一轮对话"。
   */
  function newChat() {
    // 先掐断正在进行的流。不掐的话，旧流读完会把 final 补上来，
    // 用户看到的就是"开了新对话，上一句又迟到了一下"
    streamAbort.current?.abort();
    streamAbort.current = null;

    // 代号 +1：掐断之后回调队列里可能还躺着几个 delta / final，
    // 靠代号在渲染前挡掉，避免气泡闪一下或留下没闭合的空泡
    sessionId.current += 1;

    setMessages([{ role: 'assistant', content: WELCOME, ts: Date.now() }]);
    setInput('');
    setLoading(false);

    inputRef.current?.focus();
  }

  /**
   * 流式发送：模型吐一个字就往气泡里填一个字。
   *
   * 为什么要留一条降级路：流式的好处是"立刻有反应"，代价是链路更长——
   * 代理缓冲、超时、断网都可能让它半路失败，而且那时用户已经看到半句话了。
   * 所以这里的原则是：**流式只负责抢先显示，最终内容一律以 final 事件为准**。
   * final 没到就退回一次性接口，用户最多是"没看到打字效果"，而不是"发不出去"。
   *
   * @returns true 表示这轮已处理完（成功或已给提示）；false 表示需要调用方走一次性接口
   */
  async function streamChat(payload: Record<string, unknown>, session: number): Promise<boolean> {
    // 每条流配一个 controller：新对话要能把它掐断，不给旧流继续往下读的机会
    const ctrl = new AbortController();
    streamAbort.current = ctrl;

    const res = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: requestHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    // 400 是"没写内容"这类可预期的拒绝，给句提示就行，不用降级重发
    if (res.status === 400) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '说点什么呀', ts: Date.now() },
      ]);
      return true;
    }
    // 限流同理：服务端已经说明了"慢点"，照原话给用户，
    // 别走下面的降级重发——那会再打一次接口，正好把限流撞得更死
    if (res.status === 429) {
      let hint = '慢点，一口气说太多了，缓一下再聊';
      try {
        const data = await res.json();
        if (typeof data?.error === 'string' && data.error) hint = data.error;
      } catch {
        /* 响应体不是 JSON 就用默认话术 */
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: hint, ts: Date.now() }]);
      return true;
    }
    if (!res.ok || !res.body) return false;

    // 占位气泡：先插进去，后面靠 id 定位反复改写它
    const bubbleId = 's_' + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: bubbleId, role: 'assistant', content: '', ts: Date.now() },
    ]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let acc = '';
    let finalized = false;

    // 渲染前先确认还是同一个会话：掐断之后队列里可能还排着几个 delta
    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((prev) =>
        sessionId.current === session ? prev.map((m) => (m.id === bubbleId ? fn(m) : m)) : prev,
      );

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // 会话已经被重置：后面的字全部丢弃，别再往新列表里写
      if (sessionId.current !== session) return true;

      buf += decoder.decode(value, { stream: true });

      // SSE 以空行分帧；最后一段可能不完整，留在 buffer 里等下一块
      const frames = buf.split('\n\n');
      buf = frames.pop() || '';

      for (const frame of frames) {
        const ev = /^event:\s*(\w+)$/m.exec(frame)?.[1];
        const rawData = /^data:\s*(.+)$/m.exec(frame)?.[1];
        if (!ev || !rawData) continue;

        let data: any;
        try {
          data = JSON.parse(rawData);
        } catch {
          continue;
        }

        if (ev === 'delta' && data.text) {
          // 逐块追加：这一步是纯渲染，不碰任何业务判断
          acc += data.text;
          patch((m) => ({ ...m, content: acc }));
        } else if (ev === 'error') {
          patch((m) => ({
            ...m,
            content: data.message || '啊？刚卡了一下，再说一次？',
          }));
          return true;
        } else if (ev === 'final') {
          finalized = true;
          // 会话已经被"新对话"重置：这条结果整个作废。
          // 少了这道判断，用户就会看到"新会话里凭空冒出上一轮的回答"
          if (sessionId.current !== session) return true;
          //
          // 【剪句平滑收尾】：final 可能比 delta 已经吐出去的字**短**。
          // 直接整体替换，用户看过的字凭空消失，像灵异事件。
          // 垫一句"重说"，把"变化"变成一个有意的动作。
          // 阈值 -6：只是 trim / 标点级别的微小差异不触发。
          const finalText = typeof data.reply === 'string' ? data.reply.trim() : '';
          const clipped = !!finalText && !!acc && finalText.length < acc.length - 6;
          applyPayload(
            clipped ? { ...data, reply: `哎呀刚才嘴瓢了，重说——${finalText}` } : data,
            bubbleId,
            clipped,
          );
        }
      }
    }

    if (!finalized) {
      // 流结束却没收到 final：已经吐出来的留着（用户已经看了），一个字的才给提示
      patch((m) => (m.content ? m : { ...m, content: '啊？网断了？再说一次？' }));
    }
    return true;
  }

  // ── 发送 ──────────────────────────────────────
  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || loading) return;

    // 记下发起时的会话代号：异步回来后比对一下，中途被"新对话"重置就整个丢弃
    const mySession = sessionId.current;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text, ts: Date.now() }]);
    setLoading(true);

    // 后端是「单轮 FAQ 检索」：每次只按本轮 message 在知识库里查，
    // 不需要上下文。所以请求体只带 message（不传 output_mode → 服务端默认 chat_text）。
    const payload = { message: text };

    try {
      // 优先走流式：先让用户看到字在动，最终内容以 final 为准
      if (await streamChat(payload, mySession)) return;

      // 流式链路不通（代理不支持、老浏览器）→ 退回一次性接口
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: requestHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      // 这轮已经被"新对话"重置了，结果别往新会话里塞
      if (sessionId.current !== mySession) return;

      if (!res.ok) {
        // 原始 error（可能是 Key 未配置、500 之类）只留在控制台，界面上不吓人
        // trace_id 是服务端这一轮的 TraceID：浏览器控制台报错时带上它，
        // 就能直接翻服务端日志把那轮对话捞出来（不用靠时间猜）
        if (data?.error)
          console.error(
            `[Chat] 请求失败：${data.error}`,
            data.trace_id ? `trace_id=${data.trace_id}` : '（服务端没给 trace_id）',
          );
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '啊？刚卡了一下，再说一次？',
            ts: Date.now(),
          },
        ]);
        return;
      }

      applyPayload(data);
    } catch (e: any) {
      // 用户主动"新对话"掐断的，不是真的出错，别弹"网断了"吓人
      if (e?.name === 'AbortError') return;
      // 同理，这轮已经被重置了就什么都不做
      if (sessionId.current !== mySession) return;

      console.error('[Chat] 发送失败：', e);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '啊？网断了？再说一次？',
          ts: Date.now(),
        },
      ]);
    } finally {
      // 会话已经换人了就别动，免得把新会话的状态覆盖回去
      if (sessionId.current === mySession) {
        streamAbort.current = null;
        setLoading(false);
      }
    }
  }

  /**
   * 骨架屏判定（渲染派生，只读不改）：
   * loading 且流式占位还没吐出第一个字 → 显示呼吸假气泡；
   * 占位里已经有字了 → 回到原来的“小初正在想”。
   * 一次性接口路径没有 's_' 占位，全程显示假气泡，直到 applyPayload 落地。
   */
  const lastMsg = messages[messages.length - 1];
  const streamingStarted = !!lastMsg?.id?.startsWith('s_') && !!lastMsg.content;
  const waitingFirst = loading && !streamingStarted;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 sm:p-6">
      <div className="flex h-[90vh] w-full max-w-[1200px] gap-6">
        {/* ── 左侧品牌卡（深色沉浸式，桌面常驻）────────── */}
        <aside className="hidden w-[300px] shrink-0 lg:block">
          <HeroCard onScene={(t) => void send(t)} busy={loading} />
        </aside>

        {/* ── 右侧聊天区 ──────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* Header：h-16，底边极细分割线 */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-100 px-4 sm:gap-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E293B]">
                <Mascot className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-slate-800 sm:text-sm">
                  和小初聊聊
                </div>
                <div className="hidden text-[11px] text-slate-400 sm:block">
                  在线 · 入职问题随时问
                </div>
              </div>
            </div>

            <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-1.5">
              <button
                onClick={newChat}
                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 sm:px-4"
              >
                ＋ 新对话
              </button>
              <NavBtn onClick={() => setMyOpen(true)} label="账号与聊天记录">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-600">
                  👤
                </span>
              </NavBtn>
            </nav>
          </header>

          <div
            ref={listRef}
            className="scroll-slim flex-1 space-y-4 overflow-y-auto bg-white px-6 py-5"
          >
            {messages.map((m, i) =>
              // 无历史时首条欢迎语由下方欢迎区块承担，不重复渲染旧式气泡
              i === 0 && messages.length <= 1 && m.content === WELCOME ? null : (
                <Bubble key={i} msg={m} />
              ),
            )}

            {/* 欢迎区块：仅在无历史消息时展示（对齐参考稿，全端可见） */}
            {messages.length <= 1 && !loading && (
              <div className="animate-fade-in pb-2 pt-4">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                  ✨ 入职咨询助手
                </span>
                <h2 className="mt-3 text-2xl font-extrabold text-slate-800">入职问题，问我吧 👋</h2>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
                  入职材料、当天流程、遇到问题找谁，都能问。
                  <br />
                  可以选下面的话题，也可以在输入框直接提问。
                </p>

                {/* 快捷提问卡：细边框圆角，hover 轻微上浮 */}
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {WELCOME_CARDS.map((s) => (
                    <button
                      key={s.title}
                      onClick={() => send(s.text)}
                      className="group animate-fade-in rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg">
                          {s.icon}
                        </div>
                        <span className="text-xs text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500">
                          →
                        </span>
                      </div>
                      <div className="mt-2.5 font-bold text-slate-700">{s.title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{s.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 骨架屏：loading 且还没收到首个 delta 时，给一个呼吸假气泡；
                字开始流动后就回到“正在想”的点点点 */}
            {waitingFirst && <SkeletonBubble />}
            {!waitingFirst && loading && streamingStarted && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1E293B]">
                  <Mascot className="h-3 w-3" />
                </span>
                小初正在想
                <span className="dot-typing flex gap-1">
                  <span>·</span>
                  <span>·</span>
                  <span>·</span>
                </span>
              </div>
            )}
          </div>

          {/* ── 输入区：固定在卡片底部，p-4 + 顶部分割线 ── */}
          <div className="shrink-0 border-t border-slate-100 p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 transition focus-within:ring-2 focus-within:ring-slate-200">
              {/* 快捷短语：输入容器内部上方的小按钮行 */}
              {messages.length > 1 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                  {QUICK.map((q) => (
                    <button
                      key={q.text}
                      onClick={() => send(q.text)}
                      disabled={loading}
                      className="inline-flex min-h-[32px] items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                    >
                      <span className="mr-1">{q.icon}</span>
                      {q.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 p-2 pl-3">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="说点什么…"
                  className="scroll-slim min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="shrink-0 rounded-full bg-cx-300 px-5 py-2 text-sm font-bold text-white shadow transition hover:bg-cx-400 disabled:opacity-40"
                >
                  发送
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-300">
              内容由 AI 生成，仅供参考 · Enter 发送，Shift+Enter 换行
            </p>
          </div>
        </main>

        {/* ── 「我的」抽屉：只剩账号与聊天记录 ──── */}
        {myOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMyOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-80 animate-fade-in overflow-y-auto bg-white p-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-bold text-slate-700">我的</span>
                <button
                  onClick={() => setMyOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg p-1 text-slate-400 hover:bg-slate-50"
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>

              {/* 账号区：游客态提示"记录只在本机"，给注册/登录入口 */}
              <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-400">账号</h3>
                {auth.loading ? (
                  <p className="text-xs text-slate-400">正在读取账号…</p>
                ) : auth.email ? (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        {auth.email}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        换设备登录，聊天记录跟着走
                      </div>
                    </div>
                    <button
                      onClick={() => void handleLogout()}
                      className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      退出
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      游客态的聊天记录只存在这台设备，清缓存就没了。
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => openAuth('upgrade')}
                        className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-full bg-cx-300 px-3 py-1 text-[11px] font-bold text-white hover:bg-cx-400"
                      >
                        注册（保留聊天记录）
                      </button>
                      <button
                        onClick={() => openAuth('login')}
                        className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        登录
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        )}

        {/* 登录/注册弹窗 */}
        {authMode && (
          <AuthDialog
            mode={authMode}
            busy={authBusy}
            error={authError}
            onClose={() => setAuthMode(null)}
            onSubmit={handleAuthSubmit}
            onSwitch={(m) => {
              setAuthError(null);
              setAuthMode(m);
            }}
          />
        )}
      </div>
    </div>
  );
}
