// lib/workspace/answer-service.ts
//
// 第 17 段编排层：异步生成带引用回答。纯规则都在 answer-schema.ts，这里只负责
// 「查库 → 决定模式 → 检索 → 调模型 → 回填快照 → 落库」。
//
// 红线：
//   1. 无真实模型配置（Mock / test-null）直接降级 insufficient，绝不把 Mock 的自然语言当 JSON 解析。
//   2. 检索先过 canViewPolicy（在 retrieveForQuestion 内部），权限永远排在排序之前。
//   3. 引用快照整份落库（payloadJson + citationsJson + sourceFingerprint），不依赖后续制度状态。
//   4. 任何异常都把任务标 failed 并给出原因，前端不会一直转圈。

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { callLlm, decideLlmMode } from '@/lib/llm/client';
import { loadLlmConfigFromDb } from '@/lib/llm/config';
import { ANSWER_SYSTEM_PROMPT, buildAnswerUserPrompt } from './answer-prompt';
import {
  assembleAnswer,
  sourceFingerprint,
  type AnswerPayload,
  type PolicyMeta,
} from './answer-schema';
import { retrieveForQuestion, type RetrievalPolicy, type RetrievedChunk } from './retrieval';

const TOP_K = 4;

export interface AnswerJobInput {
  consultationId: string;
  messageId: string;
  userId: string;
  question: string;
  department: string | null;
}

async function loadPolicies(): Promise<RetrievalPolicy[]> {
  return (await prisma.policyDocument.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      scope: true,
      version: true,
      effectiveDate: true,
      status: true,
      content: true,
    },
  })) as RetrievalPolicy[];
}

/** 引用快照里的生效日期 / 适用范围来自库，不采信模型输出 */
async function loadPolicyMeta(chunks: RetrievedChunk[]): Promise<Record<string, PolicyMeta>> {
  const ids = [...new Set(chunks.map((chunk) => chunk.policyId))];
  if (ids.length === 0) return {};
  const rows = await prisma.policyDocument.findMany({
    where: { id: { in: ids } },
    select: { id: true, effectiveDate: true, scope: true },
  });
  return Object.fromEntries(
    rows.map((row) => [row.id, { effectiveDate: row.effectiveDate, scope: row.scope }]),
  );
}

async function persistDone(answerId: string, payload: AnswerPayload, chunks: RetrievedChunk[]) {
  await prisma.consultationAnswer.update({
    where: { id: answerId },
    data: {
      status: 'done',
      answerStatus: payload.status,
      payloadJson: JSON.stringify(payload),
      citationsJson: JSON.stringify(payload.citations),
      sourceFingerprint: sourceFingerprint(chunks),
      model: payload.model,
      elapsedMs: payload.elapsedMs,
      error: null,
    },
  });
}

/**
 * 后台任务：POST 触发后即刻返回，前端轮询 GET 看状态。
 * 失败的每一条路径都有明确落点（done + 依据不足 / failed + 原因），不会卡在 pending。
 */
export async function generateAnswer(answerId: string, input: AnswerJobInput): Promise<void> {
  const started = Date.now();
  try {
    let cfg = null;
    try {
      cfg = await loadLlmConfigFromDb();
    } catch {
      cfg = null;
    }
    const mode = decideLlmMode(cfg, process.env.NODE_ENV ?? 'development');
    const live = mode.kind === 'live';

    let chunks: RetrievedChunk[] = [];
    let llmResponse: string | null = null;
    let model = '本地演示模式';

    if (mode.kind === 'live') {
      model = mode.config.model;
      const policies = await loadPolicies();
      chunks = retrieveForQuestion(input.question, policies, input.department, {
        topK: TOP_K,
      }).chunks;
      if (chunks.length > 0) {
        llmResponse = await callLlm(
          [
            { role: 'system', content: ANSWER_SYSTEM_PROMPT },
            { role: 'user', content: buildAnswerUserPrompt(input.question, chunks) },
          ],
          // 显式复用刚才判定过的配置，避免二次读库；密钥只在服务端内存里
          { config: mode.config },
        );
      }
    }

    const policyMeta = await loadPolicyMeta(chunks);
    const payload = assembleAnswer({
      question: input.question,
      chunks,
      mode: live ? 'live' : 'unavailable',
      llmResponse,
      model,
      elapsedMs: Date.now() - started,
      policyMeta,
    });
    await persistDone(answerId, payload, chunks);
  } catch (error) {
    const reason = error instanceof Error ? error.message : '生成回答时发生未知错误';
    await prisma.consultationAnswer
      .update({
        where: { id: answerId },
        data: {
          status: 'failed',
          error: reason.slice(0, 300),
          elapsedMs: Date.now() - started,
        },
      })
      .catch(() => undefined);
  }
}

/** 幂等触发：同一条 user 消息只跑一次；failed 允许重跑 */
export async function startAnswerJob(
  input: AnswerJobInput,
): Promise<{ id: string; reused: boolean }> {
  const key = {
    consultationId: input.consultationId,
    messageId: input.messageId,
  };
  const existing = await prisma.consultationAnswer.findUnique({
    where: { consultationId_messageId: key },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== 'failed') {
    return { id: existing.id, reused: true };
  }

  const id = existing?.id ?? `a_${randomUUID()}`;
  if (existing) {
    await prisma.consultationAnswer.update({
      where: { id },
      data: {
        status: 'pending',
        answerStatus: null,
        payloadJson: '{}',
        citationsJson: '[]',
        sourceFingerprint: '',
        model: '',
        elapsedMs: 0,
        error: null,
      },
    });
  } else {
    await prisma.consultationAnswer.create({
      data: {
        id,
        ...key,
        userId: input.userId,
        question: input.question,
        status: 'pending',
        payloadJson: '{}',
        citationsJson: '[]',
        sourceFingerprint: '',
        model: '',
        elapsedMs: 0,
      },
    });
  }

  void generateAnswer(id, input);
  return { id, reused: false };
}
