// lib/chat/logger.ts — 聊天日志落库（V3.0 Admin「对话审查」数据源）
//
// 两条红线：
//   1. **fire-and-forget**：写库失败只打一行错误，绝不阻断、绝不变慢用户的对话。
//      这里返回 void、内部不 await——调用方连 `await` 都不需要写。
//   2. **只存用户看得到的内容**：用户原话 / 模型 final 定稿文本。
//      delta 不落（流式中间态没审查价值）、trace 原始 JSON 不落（那是 lib/chat/trace 的事）。
//      （旧业务的 cards 推荐卡字段已随 schema 瘦身删除——HR 问答不产卡。）
//
// 隐私开关：ADMIN_REVIEW_SCOPE=all（默认，全记）| guest_only（只记游客）。
// guest_only 的用途：注册用户的对话属个人数据，运营方按需收敛审查范围。
import { prisma } from '@/lib/db';
import { tracePrefix } from './trace';

type LogRole = 'user' | 'assistant';

export function shouldLog(isGuest: boolean): boolean {
  const scope = (process.env.ADMIN_REVIEW_SCOPE || 'all').trim().toLowerCase();
  return scope !== 'guest_only' || isGuest;
}

/**
 * 落一条聊天日志。返回 void（fire-and-forget），调用方写 `logMessage({...})` 即可。
 *
 * User 行先 upsert：游客纯陪聊/追问可能从未写过记忆，User 表里没有他的行，
 * Message.userId 的外键会直接拒绝——先补一行空 User（幂等，主键命中很快）。
 */
export function logMessage(msg: {
  userId: string;
  isGuest: boolean;
  role: LogRole;
  content: string;
  traceId?: string;
}): void {
  if (!msg.content?.trim()) return; // 空文案（异常分支的空 reply）没有审查价值
  if (!shouldLog(msg.isGuest)) return;

  prisma.user
    .upsert({ where: { id: msg.userId }, create: { id: msg.userId }, update: {} })
    .then(() =>
      prisma.message.create({
        data: {
          userId: msg.userId,
          role: msg.role,
          content: msg.content,
          traceId: msg.traceId ?? null,
        },
      }),
    )
    .catch((e: unknown) => console.error(`${tracePrefix()}[MessageLog] 落库失败（不阻断对话）`, e));
}
