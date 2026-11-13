// app/api/ai/stream/route.ts
// 流式版入口。
//
// 2026-11-07 底层换血：旧业务大脑（streamBrain / 意图纠偏 / 选品 / 记忆抽取）整体移除。
// 本地 FAQ 匹配是毫秒级确定性的，没有"逐字生成"，
// 所以流式协议降级为：整段回复作为一个 delta 上屏，final 给最终响应体。
//
// ── 事件协议（与前端解析保持兼容，未改） ────────────────────
//   event: stage   {"stage":"memory"|"finalizing"}   阶段提示
//   event: delta   {"text":"..."}                    reply 整段
//   event: final   {完整响应体，结构同 /api/ai}        最终结果
//   event: error   {"message":"..."}                 出错
//
// 保留：身份解析 / 游客票据补发 / 限流 / TraceID 日志 / 消息落库 / 400 / 429 语义。

import { NextRequest, NextResponse } from 'next/server';
import { handleTurn, type OutputMode } from '@/lib/chat/handlers';
import { logMessage } from '@/lib/chat/logger';
import { GUEST_COOKIE, GUEST_MAX_AGE, cookieString } from '@/lib/auth/jwt';
import { resolveIdentity } from '@/lib/auth/identity';
import { resolveKnowledgeRole } from '@/lib/auth/knowledge-role';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import {
  newTraceId,
  traceRequest,
  traceResponse,
  traceError,
  runWithTrace,
} from '@/lib/chat/trace';

export const runtime = 'nodejs';

interface StreamBody {
  message: string;
  /** 旧客户端兼容字段：换血后不参与任何业务判断，原样忽略 */
  // TODO(hr-assistant): 旧业务请求体字段，前端已停发；下批清理类型声明。
  history?: unknown[];
  filters?: unknown;
  inRecommendContext?: boolean;
  lastPicks?: string[];
  userProfile?: Record<string, unknown>;
  output_mode?: OutputMode;
}

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  return runWithTrace(traceId, () => buildStreamResponse(req, traceId));
}

async function buildStreamResponse(req: NextRequest, traceId: string) {
  const encoder = new TextEncoder();

  // 请求体与身份必须在建流之前解析完：
  // 响应头（含 Set-Cookie 的游客票据）只能在这个函数返回 Response 时一次性给全
  const body = (await req.json().catch(() => null)) as StreamBody | null;
  if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: '说点什么呀' }, { status: 400 });
  }

  const identity = await resolveIdentity(req);
  const userId = identity.userId;

  const limited = checkRateLimit(userId);
  if (!limited.ok) {
    return NextResponse.json(
      { error: '慢点，一口气说太多了，缓一下再聊', retry_after: limited.retryAfter },
      { status: 429 },
    );
  }

  // 用户原话落库：入口写一次（fire-and-forget，见 lib/chat/logger.ts）
  logMessage({
    userId,
    isGuest: identity.isGuest,
    role: 'user',
    content: body.message,
    traceId,
  });

  const outputMode: OutputMode =
    body.output_mode === 'structured_json' ? 'structured_json' : 'chat_text';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      /** final 的统一出口：[Response] 只在这里打一次 */
      const sendFinal = (payload: Record<string, unknown>) => {
        const replyText = typeof payload.reply === 'string' ? payload.reply : '';
        traceResponse(traceId, replyText, 0, {
          degraded: false,
          route: outputMode,
          awaiting: false,
        });
        // AI 最终回复落库：只记 final 定稿文本
        logMessage({
          userId,
          isGuest: identity.isGuest,
          role: 'assistant',
          content: replyText,
          traceId,
        });
        send('final', { ...payload, trace_id: traceId });
        finish();
      };

      try {
        traceRequest(traceId, {
          message: body.message,
          entry: '/api/ai/stream',
          userId,
          identity: identity.source,
        });

        send('stage', { stage: 'memory' });

        // 角色只以系统传入的上下文为准。批次10 接通知识角色管道：游客恒 new_hire，
        // 登录用户读库映射（employeeType 不入 JWT，转正立即生效）；ADMIN 全可见。
        const knowledgeRole = identity.isGuest
          ? 'new_hire'
          : await resolveKnowledgeRole(identity.userId, identity.role);
        const turn = await handleTurn({
          message: body.message,
          userRole: knowledgeRole,
          outputMode,
        });
        const replyText = typeof turn.result === 'string' ? turn.result : turn.result.answer;

        send('stage', { stage: 'finalizing' });
        // 没有逐字生成来源：把回复整块当一个 delta 发出去，
        // 占位气泡马上有字，final 到达时再按最终版本整体替换一次
        send('delta', { text: replyText });

        sendFinal(
          outputMode === 'structured_json'
            ? { reply: replyText, result: turn.result }
            : { reply: replyText },
        );
      } catch (err: unknown) {
        traceError('Stream Error', err, traceId);
        send('error', { message: '服务出了点问题，再说一次？', trace_id: traceId });
        finish();
      }
    },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // 关掉 Nginx 一类反代的缓冲，否则 SSE 会被攒成一大块再吐
    'X-Accel-Buffering': 'no',
  };
  // 游客票据：必须在响应头一次性带出去，等流开始就改不了头了
  if (identity.guestTicket) {
    headers['Set-Cookie'] = cookieString(GUEST_COOKIE, identity.guestTicket, GUEST_MAX_AGE);
  }

  return new Response(stream, { headers });
}
