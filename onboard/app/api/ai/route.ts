// app/api/ai/route.ts
// 前端入口（普通一次性响应）。
//
// 2026-11-07 底层换血：旧业务大脑（callBrain / 意图纠偏 / 选品 / 记忆抽取）整体移除，
// 业务只剩一条链路：知识库检索 → 权限守卫 → FAQ 关键词匹配 → 固定兜底，
// 全部在 lib/chat/handlers.ts → lib/llm/local-workflow.ts。
//
// 保留的东西（UI 依赖，一行不能少）：
//   - 身份解析（cx_token cookie / x-guest-id 头，不认 body.userId）与游客票据补发
//   - 限流、TraceID 链路日志、消息落库（fire-and-forget）
//   - 响应契约：chat_text 模式回 { reply, trace_id }；structured_json 模式回 { result, trace_id }
//
// 流式版本见 app/api/ai/stream/route.ts，SSE 事件协议不变（delta / final / error）。

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

interface AiRequestBody {
  message: string;
  /** 旧客户端兼容字段：换血后不参与任何业务判断，原样忽略 */
  // TODO(hr-assistant): 旧业务请求体字段，前端已停发；下批清理类型声明。
  history?: unknown[];
  filters?: unknown;
  inRecommendContext?: boolean;
  lastPicks?: string[];
  userProfile?: Record<string, unknown>;
  /** 输出模式：chat_text（默认，UI 用）| structured_json（程序化调用用） */
  output_mode?: OutputMode;
}

function outputModeOf(raw: unknown): OutputMode {
  return raw === 'structured_json' ? 'structured_json' : 'chat_text';
}

export async function POST(req: NextRequest) {
  // TraceID 在入口就生成：这一轮所有打点都靠它串起来
  const traceId = newTraceId();
  try {
    const body = (await req.json()) as AiRequestBody;
    if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json({ error: '说点什么呀' }, { status: 400 });
    }

    // 身份：登录态 cookie 优先，其次 x-guest-id 头。**不认 body.userId**。
    const identity = await resolveIdentity(req);
    const userId = identity.userId;

    // 限流：按 userId 计
    const limited = checkRateLimit(userId);
    if (!limited.ok) {
      const res = NextResponse.json(
        { error: '慢点，一口气说太多了，缓一下再聊', retry_after: limited.retryAfter },
        { status: 429 },
      );
      if (identity.guestTicket) {
        res.headers.append(
          'Set-Cookie',
          cookieString(GUEST_COOKIE, identity.guestTicket, GUEST_MAX_AGE),
        );
      }
      return res;
    }

    const outputMode = outputModeOf(body.output_mode);

    traceRequest(traceId, {
      message: body.message,
      entry: '/api/ai',
      userId,
      identity: identity.source,
    });

    // 用户原话落库（fire-and-forget，见 lib/chat/logger.ts 的两条红线）
    logMessage({
      userId,
      isGuest: identity.isGuest,
      role: 'user',
      content: body.message,
      traceId,
    });

    const payload = await runWithTrace(traceId, async () => {
      // 角色只以系统传入的上下文为准。批次10 起接通知识角色管道：
      //   - 游客恒 new_hire（游客无员工类型概念，最保守视角）；
      //   - 登录用户每次请求读库映射（employeeType 不入 JWT，转正立即生效，见
      //     lib/auth/knowledge-role.ts）；ADMIN 全可见。
      const knowledgeRole = identity.isGuest
        ? 'new_hire'
        : await resolveKnowledgeRole(identity.userId, identity.role);
      return handleTurn({ message: body.message, userRole: knowledgeRole, outputMode });
    });

    const replyText = typeof payload.result === 'string' ? payload.result : payload.result.answer;

    traceResponse(traceId, replyText, 0, {
      degraded: false,
      route: outputMode,
      awaiting: false,
    });
    // AI 最终回复落库（结构化模式落 answer 文本，不落 JSON 包装）
    logMessage({
      userId,
      isGuest: identity.isGuest,
      role: 'assistant',
      content: replyText,
      traceId,
    });

    // chat_text：{ reply, trace_id }（UI 契约）；structured_json：{ result, trace_id }
    const res = NextResponse.json(
      outputMode === 'structured_json'
        ? { result: payload.result, trace_id: traceId }
        : { reply: replyText, trace_id: traceId },
    );
    // 游客第一次来（或换了 id）时补发签名票据：/api/auth/upgrade 要靠它证明"这个 id 是我"
    if (identity.guestTicket) {
      res.headers.append(
        'Set-Cookie',
        cookieString(GUEST_COOKIE, identity.guestTicket, GUEST_MAX_AGE),
      );
    }
    return res;
  } catch (err: unknown) {
    const e = err as { message?: string };
    traceError('AI Route Error', err, traceId);
    return NextResponse.json(
      { error: e?.message || '服务出了点问题', trace_id: traceId },
      { status: 500 },
    );
  }
}
