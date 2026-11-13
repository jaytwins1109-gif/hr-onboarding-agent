// app/api/auth/me/route.ts
//
// 「我现在是谁」。旧业务的"当前记忆快照"已随业务下线（2026-11-07 底层换血）：
// TODO(hr-assistant): 记忆/偏好功能已下线，HR 业务不读 memory；保留空结构仅为兼容旧 UI 侧栏。
//
// 保留的职责：
// - 身份判定与字段结构（userId / email / isGuest / memory）完全不变，旧 UI 不改也能跑；
// - 顺带负责**补发游客票据**：新访客从没发过消息，本来没有 cx_guest；
//   这时候点"注册"会被 upgrade 的票据校验挡成 403（那道校验是防账号被绑走的，
//   不能删）。所以在 identity 判定之后，票据缺失/不匹配就签一张一起带回去。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  GUEST_COOKIE,
  GUEST_MAX_AGE,
  TOKEN_COOKIE,
  TOKEN_MAX_AGE,
  clearCookieString,
  cookieString,
  signUserToken,
  normalizeRole,
  userTokenRemaining,
  verifyUserToken,
} from '@/lib/auth/jwt';
import { resolveIdentity } from '@/lib/auth/identity';

export const runtime = 'nodejs';

interface MemoryPayload {
  core_profile: string[];
  summary_memory: string[];
  active_fragments: string[];
}

const EMPTY_MEMORY: MemoryPayload = {
  core_profile: [],
  summary_memory: [],
  active_fragments: [],
};

export async function GET(req: NextRequest) {
  const ticket = await verifyUserToken(req.cookies.get(TOKEN_COOKIE)?.value);
  /**
   * 票据有效但库里没这个人（账号被删）：
   * 落到游客分支，并**把过期票据清掉**——否则这张票还会在 AI 入口被当成登录态，
   * 一个已经删掉的账号能继续用、还会被 writeMemory 顺手 upsert 复活。
   */
  let staleToken = false;

  if (ticket) {
    try {
      const user = await prisma.user.findUnique({ where: { id: ticket.userId } });
      if (user) {
        // TODO(hr-assistant): 记忆/偏好功能已下线，HR 业务不读 memory；保留空结构仅为兼容旧 UI 侧栏。
        const res = NextResponse.json({
          userId: user.id,
          email: user.email,
          isGuest: user.isGuest,
          role: user.role,
          memory: EMPTY_MEMORY,
        });
        /**
         * 滑动续期：票据寿命过半就换一张新的。
         *
         * 不续的话，登录 30 天后的那一刻用户会被静默踢回游客态——记忆还在，
         * 但侧栏突然"变空"，他只会觉得"这破站又抽了"。前端每次打开页面都会打
         * 这个接口，所以活跃用户永远在被踢之前就换好票了。
         * 只在过半时续，避免每次刷新都写一次 Set-Cookie。
         */
        const remaining = await userTokenRemaining(req.cookies.get(TOKEN_COOKIE)?.value);
        if (remaining !== null && remaining < TOKEN_MAX_AGE / 2) {
          const fresh = await signUserToken(user.id, normalizeRole(user.role)).catch(() => null);
          if (fresh) {
            res.headers.append('Set-Cookie', cookieString(TOKEN_COOKIE, fresh, TOKEN_MAX_AGE));
          }
        }
        return res;
      }
      staleToken = true;
    } catch (err) {
      console.error('[auth/me]', err);
      return NextResponse.json({ error: '读取账号信息失败' }, { status: 500 });
    }
  }

  // 游客分支：认 x-guest-id 头（前端每次都会带），没有就现发一个
  const identity = await resolveIdentity(req);

  // TODO(hr-assistant): 记忆/偏好功能已下线，HR 业务不读 memory；保留空结构仅为兼容旧 UI 侧栏。
  const res = NextResponse.json({
    userId: identity.userId,
    email: null,
    isGuest: true,
    role: null,
    memory: EMPTY_MEMORY,
  });
  if (staleToken) {
    res.headers.append('Set-Cookie', clearCookieString(TOKEN_COOKIE));
  }
  if (identity.guestTicket) {
    res.headers.append(
      'Set-Cookie',
      cookieString(GUEST_COOKIE, identity.guestTicket, GUEST_MAX_AGE),
    );
  }
  return res;
}
