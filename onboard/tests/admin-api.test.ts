/**
 * Admin API 越权矩阵（V3.0 起固化，2026-11-08 批次8 切到知识库接口）。
 *
 * 红线：所有 /api/admin/* 的安全边界是 requireAdmin——这里固化
 * 「无票 / 游客票 / USER 票 → 一律 403，且 403 判定发生在任何查库之前」。
 * ADMIN 放行与业务逻辑的端到端验证走本地 dev 实测（见 PROGRESS），
 * 单测不连库，保证快且稳。
 */
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TOKEN_COOKIE, signUserToken } from '@/lib/auth/jwt';
import { GET as statsGET } from '@/app/api/admin/stats/route';
import { GET as messagesGET } from '@/app/api/admin/messages/route';
import { GET as memoriesGET, DELETE as memoriesDELETE } from '@/app/api/admin/memories/route';
import { GET as knowledgeGET, POST as knowledgePOST } from '@/app/api/admin/knowledge/route';
import { PUT as knowledgePUT } from '@/app/api/admin/knowledge/[id]/route';
import { GET as usersGET } from '@/app/api/admin/users/route';
import { PUT as usersPUT } from '@/app/api/admin/users/[id]/route';

const SECRET = 'test-secret-for-vitest-0123456789';

function req(path: string, cookieValue?: string): NextRequest {
  const headers = new Headers();
  if (cookieValue) headers.set('cookie', cookieValue);
  return new NextRequest(`http://localhost${path}`, { headers });
}

/** PUT helper：构造带 ADMIN 票的请求并直调 handler（ctx.params 用 Promise 包，对齐 Next 15） */
function callPUT(id: string, body: unknown, cookieValue?: string) {
  const headers = new Headers();
  if (cookieValue) headers.set('cookie', cookieValue);
  headers.set('content-type', 'application/json');
  const req = new NextRequest(`http://localhost/api/admin/knowledge/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  return knowledgePUT(req, { params: Promise.resolve({ id }) });
}

beforeAll(() => {
  vi.stubEnv('AUTH_SECRET', SECRET);
});

describe('Admin API 越权矩阵', () => {
  it('无票 → 接口全 403', async () => {
    expect((await statsGET(req('/api/admin/stats'))).status).toBe(403);
    expect((await messagesGET(req('/api/admin/messages'))).status).toBe(403);
    expect((await memoriesGET(req('/api/admin/memories'))).status).toBe(403);
    expect((await knowledgeGET(req('/api/admin/knowledge'))).status).toBe(403);
    expect((await knowledgePOST(req('/api/admin/knowledge'))).status).toBe(403);
    expect((await usersGET(req('/api/admin/users'))).status).toBe(403);
    expect(
      (
        await usersPUT(req('/api/admin/users/u_x'), {
          params: Promise.resolve({ id: 'u_x' }),
        })
      ).status,
    ).toBe(403);
  });

  it('USER 票（登录但非管理员）→ 接口全 403', async () => {
    const token = await signUserToken('u_normal', 'USER');
    const cookie = `${TOKEN_COOKIE}=${token}`;
    expect((await statsGET(req('/api/admin/stats', cookie))).status).toBe(403);
    expect((await messagesGET(req('/api/admin/messages', cookie))).status).toBe(403);
    expect((await memoriesGET(req('/api/admin/memories', cookie))).status).toBe(403);
    expect((await knowledgeGET(req('/api/admin/knowledge', cookie))).status).toBe(403);
    expect((await knowledgePOST(req('/api/admin/knowledge', cookie))).status).toBe(403);
    expect((await usersGET(req('/api/admin/users', cookie))).status).toBe(403);
  });

  it('伪造票 → 403（签名校验不过）', async () => {
    expect((await statsGET(req('/api/admin/stats', `${TOKEN_COOKIE}=not.a.jwt`))).status).toBe(403);
  });

  // 2026-11-07 底层换血：记忆管理已下线。
  // 守卫分层语义仍未变：无票/USER → 403（上面两条）；ADMIN 放行后由业务层接管。
  it('ADMIN 票 → GET 返回 200 空列表（兼容壳：结构不变、不假装有数据）', async () => {
    const token = await signUserToken('u_boss', 'ADMIN');
    const res = await memoriesGET(req('/api/admin/memories', `${TOKEN_COOKIE}=${token}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });

  it('ADMIN 票 + DELETE → 501 NOT_IMPLEMENTED（写操作明确拒绝，不返回假成功）', async () => {
    const token = await signUserToken('u_boss', 'ADMIN');
    const res = await memoriesDELETE(
      req('/api/admin/memories?userId=u_x', `${TOKEN_COOKIE}=${token}`),
    );
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('NOT_IMPLEMENTED');
    expect(body.message).toBe('记忆管理已下线，HR 业务不读 memory');
  });
});

describe('知识库 PUT 校验层（批次8：校验必须发生在查库之前，不连库可测）', () => {
  const ADMIN = async () => `${TOKEN_COOKIE}=${await signUserToken('u_boss', 'ADMIN')}`;

  it('ADMIN + 非法 status → 400（不打 DB）', async () => {
    const res = await callPUT('faq_001', { status: 'published' }, await ADMIN());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('active 或 draft');
  });

  it('ADMIN + 空对象（无可更新字段）→ 400', async () => {
    const res = await callPUT('faq_001', {}, await ADMIN());
    expect(res.status).toBe(400);
  });

  it('ADMIN + 空 question → 400', async () => {
    const res = await callPUT('faq_001', { question: '   ' }, await ADMIN());
    expect(res.status).toBe(400);
  });

  it('ADMIN + tags 非数组 → 400', async () => {
    const res = await callPUT('faq_001', { tags: '入职材料' }, await ADMIN());
    expect(res.status).toBe(400);
  });

  it('ADMIN + isDeleted 非布尔 → 400', async () => {
    const res = await callPUT('faq_001', { isDeleted: 'yes' }, await ADMIN());
    expect(res.status).toBe(400);
  });

  it('ADMIN + 非法 JSON 请求体 → 400', async () => {
    const headers = new Headers();
    headers.set('cookie', await ADMIN());
    headers.set('content-type', 'application/json');
    const bad = new NextRequest('http://localhost/api/admin/knowledge/faq_001', {
      method: 'PUT',
      headers,
      body: '{oops',
    });
    const res = await knowledgePUT(bad, { params: Promise.resolve({ id: 'faq_001' }) });
    expect(res.status).toBe(400);
  });

  // ── POST（批次9：新增条目）校验层，同样全部发生在查库之前 ──
  const postReq = (body: unknown, cookieValue?: string) => {
    const headers = new Headers();
    if (cookieValue) headers.set('cookie', cookieValue);
    headers.set('content-type', 'application/json');
    return new NextRequest('http://localhost/api/admin/knowledge', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  };

  it('ADMIN POST + 缺 question → 400', async () => {
    const res = await knowledgePOST(postReq({ answer: 'x' }, await ADMIN()));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('question');
  });

  it('ADMIN POST + 缺 answer → 400', async () => {
    const res = await knowledgePOST(postReq({ question: 'x' }, await ADMIN()));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('answer');
  });

  it('ADMIN POST + 空白 question → 400', async () => {
    const res = await knowledgePOST(postReq({ question: '   ', answer: 'x' }, await ADMIN()));
    expect(res.status).toBe(400);
  });

  it('ADMIN POST + tags 非数组 → 400', async () => {
    const res = await knowledgePOST(
      postReq({ question: 'q', answer: 'a', tags: '入职材料' }, await ADMIN()),
    );
    expect(res.status).toBe(400);
  });

  it('ADMIN POST + 非法 status → 400', async () => {
    const res = await knowledgePOST(
      postReq({ question: 'q', answer: 'a', status: 'published' }, await ADMIN()),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('active 或 draft');
  });
});

describe('用户管理 PUT 校验层（批次10：校验必须发生在查库之前，不连库可测）', () => {
  const ADMIN = async () => `${TOKEN_COOKIE}=${await signUserToken('u_boss', 'ADMIN')}`;

  function callUsersPUT(body: unknown, cookieValue?: string) {
    const headers = new Headers();
    if (cookieValue) headers.set('cookie', cookieValue);
    headers.set('content-type', 'application/json');
    const req = new NextRequest('http://localhost/api/admin/users/u_x', {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    return usersPUT(req, { params: Promise.resolve({ id: 'u_x' }) });
  }

  it('ADMIN + 非法 employeeType → 400（不打 DB）', async () => {
    const res = await callUsersPUT({ employeeType: 'boss' }, await ADMIN());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_EMPLOYEE_TYPE');
  });

  it('ADMIN + 非法 onboardingDate → 400（不打 DB）', async () => {
    const res = await callUsersPUT(
      { employeeType: 'employee', onboardingDate: 'not-a-date' },
      await ADMIN(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_ONBOARDING_DATE');
  });

  it('ADMIN + 非法 JSON 请求体 → 400', async () => {
    const headers = new Headers();
    headers.set('cookie', await ADMIN());
    headers.set('content-type', 'application/json');
    const bad = new NextRequest('http://localhost/api/admin/users/u_x', {
      method: 'PUT',
      headers,
      body: '{oops',
    });
    const res = await usersPUT(bad, { params: Promise.resolve({ id: 'u_x' }) });
    expect(res.status).toBe(400);
  });
});
