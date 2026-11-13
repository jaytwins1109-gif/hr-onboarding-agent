// app/api/workspace/model-config/route.ts — 模型配置读取与保存（仅系统管理员）
//
// 密钥只进不出：保存时加密，读取时通过 clientConfigFromRow 裁掉所有凭据字段。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canConfigureModel } from '@/lib/workspace/access';
import {
  auditDetail,
  clientConfigFromRow,
  encryptSecret,
  validateModelConfig,
} from '@/lib/workspace/model-config';
import { getWorkspaceViewer } from '@/lib/workspace/session';

export const runtime = 'nodejs';

const CONFIG_ID = 'default';
const DENY = () => NextResponse.json({ error: '当前账号无权查看模型配置' }, { status: 403 });

function newAuditId(): string {
  return `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canConfigureModel(viewer.role)) return DENY();
  const row = await prisma.modelConfig.findUnique({ where: { id: CONFIG_ID } });
  return NextResponse.json({ ok: true, config: clientConfigFromRow(row) });
}

export async function POST(req: NextRequest) {
  const viewer = await getWorkspaceViewer();
  if (!viewer) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!canConfigureModel(viewer.role)) return DENY();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validateModelConfig(body);
  if (!checked.ok || !checked.value) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const value = checked.value;
  const existing = await prisma.modelConfig.findUnique({ where: { id: CONFIG_ID } });

  let encryptedKey = existing?.encryptedKey ?? '';
  let hasKey = existing?.hasKey ?? false;
  if (value.apiKey) {
    const secret = process.env.AUTH_SECRET ?? '';
    try {
      encryptedKey = encryptSecret(value.apiKey, secret);
      hasKey = true;
    } catch {
      return NextResponse.json(
        { error: '服务端未配置加密密钥，请联系系统管理员配置 AUTH_SECRET' },
        { status: 500 },
      );
    }
  }

  const version = (existing?.version ?? 0) + 1;
  await prisma.$transaction([
    prisma.modelConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        endpoint: value.endpoint,
        modelName: value.modelName,
        encryptedKey,
        hasKey,
        temperature: value.temperature,
        maxTokens: value.maxTokens,
        version,
        updatedById: viewer.id,
      },
      update: {
        endpoint: value.endpoint,
        modelName: value.modelName,
        encryptedKey,
        hasKey,
        temperature: value.temperature,
        maxTokens: value.maxTokens,
        version,
        updatedById: viewer.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        id: newAuditId(),
        action: 'update_model_config',
        actorId: viewer.id,
        actorName: viewer.name?.trim() || viewer.email || '未填写姓名',
        target: 'model_config',
        detail: auditDetail(version),
      },
    }),
  ]);

  const saved = await prisma.modelConfig.findUnique({ where: { id: CONFIG_ID } });
  return NextResponse.json({ ok: true, config: clientConfigFromRow(saved) });
}
