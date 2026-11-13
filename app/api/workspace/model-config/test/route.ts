// app/api/workspace/model-config/test/route.ts — 真的调用一次已保存的模型连接
//
// 密钥只在服务端解密后放进 Authorization 头，任何回包都不带密钥。
// 失败按「地址 / 密钥 / 模型名」三类给中文原因，不把上游英文报错原样甩给管理员。

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canConfigureModel } from '@/lib/workspace/access';
import {
  decryptSecret,
  endpointForChat,
  successMessage,
  testFailureMessage,
} from '@/lib/workspace/model-config';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

const TIMEOUT_MS = 10000;

export async function POST() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canConfigureModel(viewer.role)) {
    return NextResponse.json({ error: '当前账号无权测试模型连接' }, { status: 403 });
  }

  const cfg = await prisma.modelConfig.findUnique({ where: { id: 'default' } });
  if (!cfg || !cfg.endpoint || !cfg.modelName) {
    return NextResponse.json({ error: '请先保存接口地址与模型名称' }, { status: 400 });
  }
  if (!cfg.hasKey || !cfg.encryptedKey) {
    return NextResponse.json({ error: '尚未保存模型密钥，请先保存配置再测试' }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(cfg.encryptedKey, process.env.AUTH_SECRET ?? '');
  } catch {
    return NextResponse.json(
      { ok: false, message: '已保存的密钥无法解密，请重新保存一次配置' },
      { status: 200 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(endpointForChat(cfg.endpoint), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.modelName,
        messages: [{ role: 'user', content: '请只回复：连接正常' }],
        temperature: cfg.temperature,
        max_tokens: Math.min(cfg.maxTokens, 32),
        stream: false,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, message: testFailureMessage(res.status, text) },
        { status: 200 },
      );
    }
    let units = 0;
    try {
      const data = JSON.parse(text) as { usage?: { total_tokens?: number } };
      units = Number(data.usage?.total_tokens ?? 0);
    } catch {
      units = 0;
    }
    return NextResponse.json({
      ok: true,
      message: successMessage(Date.now() - started, units),
    });
  } catch {
    return NextResponse.json({ ok: false, message: testFailureMessage(null, '') }, { status: 200 });
  } finally {
    clearTimeout(timer);
  }
}
