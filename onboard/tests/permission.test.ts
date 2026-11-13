/**
 * 批次10：权限分流 + 兜底拟人化单测。
 *
 * 两个被测面：
 *   1. 知识角色映射（lib/auth/knowledge-role.ts）——auth 角色（USER/ADMIN）与
 *      知识角色（new_hire/employee）正交；employeeType 不入 JWT、按 onboardingDate
 *      自动转正、脏值保守回退。resolveKnowledgeRole 连真实库验证读库映射。
 *   2. 兜底三层（lib/llm/fallback.ts + local-workflow 接线）——本地闲聊分流 /
 *      LLM 温和兜底（mock fetch）/ 静态兜底回退；structured_json 契约不变。
 *
 * vitest 不加载 .env.local → 默认无 LLM Key → softenFallback 天然返回 null，
 * 旧测试（断言 FALLBACK_TEXT）零改动；LLM 成功路径用 stub fetch 模拟。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  mapKnowledgeRole,
  resolveKnowledgeRole,
  NEW_HIRE_WINDOW_DAYS,
} from '@/lib/auth/knowledge-role';
import {
  canAccessKnowledgeItem,
  FALLBACK_JSON,
  FALLBACK_TEXT,
  runLocalWorkflow,
} from '@/lib/llm/local-workflow';
import {
  CHITCHAT_REPLY,
  EMO_REPLY,
  OFFTOPIC_REPLY,
  WEATHER_REPLY,
  isSoftFallbackTrustworthy,
  matchChitchat,
  nowReply,
  softenFallback,
} from '@/lib/llm/fallback';
import { buildLiveSystemPrompt, buildTimeContext } from '@/lib/prompts/system-prompt';
import { prisma } from '@/lib/db';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ── 知识角色映射：mapKnowledgeRole（纯函数） ─────────────────────────────

describe('mapKnowledgeRole（auth 角色与知识角色正交）', () => {
  it('ADMIN → admin（全可见），employeeType 不影响', () => {
    expect(mapKnowledgeRole({ role: 'ADMIN', employeeType: 'new_hire' })).toBe('admin');
    expect(mapKnowledgeRole({ role: 'ADMIN', employeeType: 'employee' })).toBe('admin');
  });

  it('显式 employee → employee（不受入职时间影响）', () => {
    expect(
      mapKnowledgeRole({
        role: 'USER',
        employeeType: 'employee',
        onboardingDate: new Date(), // 刚入职
      }),
    ).toBe('employee');
  });

  it(`new_hire + 入职 ≤${NEW_HIRE_WINDOW_DAYS} 天 → new_hire`, () => {
    const recent = new Date(Date.now() - 30 * 86_400_000);
    expect(
      mapKnowledgeRole({ role: 'USER', employeeType: 'new_hire', onboardingDate: recent }),
    ).toBe('new_hire');
  });

  it(`new_hire + 入职 >${NEW_HIRE_WINDOW_DAYS} 天 → 自动转正 employee`, () => {
    const old = new Date(Date.now() - (NEW_HIRE_WINDOW_DAYS + 1) * 86_400_000);
    expect(mapKnowledgeRole({ role: 'USER', employeeType: 'new_hire', onboardingDate: old })).toBe(
      'employee',
    );
  });

  it('脏值保守回退：未知 employeeType / 缺日期 / 非法日期 → new_hire', () => {
    expect(mapKnowledgeRole({ role: 'USER', employeeType: 'boss' })).toBe('new_hire');
    expect(
      mapKnowledgeRole({
        role: 'USER',
        employeeType: 'new_hire',
        onboardingDate: new Date('not-a-date'),
      }),
    ).toBe('new_hire');
    expect(mapKnowledgeRole({ role: 'USER' })).toBe('new_hire');
  });
});

// ── resolveKnowledgeRole（读库映射，连真实库） ─────────────────────────────

describe('resolveKnowledgeRole（每次请求读库，转正立即生效）', () => {
  const uid = 'u_perm_e2e_001';

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { startsWith: 'u_perm_e2e_' } } });
  });

  it('ADMIN 快照 → 直接 admin（不查库）', async () => {
    expect(await resolveKnowledgeRole('whatever', 'ADMIN')).toBe('admin');
  });

  it('库里 employeeType=employee → employee；行不存在 → new_hire（最保守）', async () => {
    await prisma.user.create({
      data: { id: uid, isGuest: false, employeeType: 'employee' },
    });
    expect(await resolveKnowledgeRole(uid, 'USER')).toBe('employee');
    expect(await resolveKnowledgeRole('u_nope_missing', 'USER')).toBe('new_hire');
  });

  it('库里 new_hire + 入职超窗口 → 读库即时转正（不入 JWT 的意义所在）', async () => {
    await prisma.user.create({
      data: {
        id: `${uid}2`,
        isGuest: false,
        employeeType: 'new_hire',
        onboardingDate: new Date(Date.now() - (NEW_HIRE_WINDOW_DAYS + 30) * 86_400_000),
      },
    });
    expect(await resolveKnowledgeRole(`${uid}2`, 'USER')).toBe('employee');
  });
});

// ── canAccessKnowledgeItem：admin 全可见分支 ─────────────────────────────

describe('canAccessKnowledgeItem（admin 全可见）', () => {
  const base = {
    isDeleted: false,
    deletedAt: null,
    status: 'active',
    scope: 'new_hire_public',
  };

  it('admin → 全可见（含 employee 专属条目）', () => {
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '["employee"]' }, 'admin')).toBe(true);
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '["new_hire"]' }, 'admin')).toBe(true);
  });

  it('admin 也不能越过软删除/状态/scope 的闸（守卫先于角色）', () => {
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '[]', isDeleted: true }, 'admin')).toBe(
      false,
    );
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '[]', status: 'draft' }, 'admin')).toBe(
      false,
    );
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '[]', scope: 'other' }, 'admin')).toBe(
      false,
    );
  });

  it('employee 命中 employee 条目；unknown 角色仍一律 false', () => {
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '["employee"]' }, 'employee')).toBe(
      true,
    );
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '["employee"]' }, 'new_hire')).toBe(
      false,
    );
    expect(canAccessKnowledgeItem({ ...base, allowedRoles: '["new_hire"]' }, 'unknown')).toBe(
      false,
    );
  });
});

// ── 兜底三层：本地闲聊分流 ─────────────────────────────────────────────

describe('matchChitchat（本地闲聊分流，零网络）', () => {
  it('纯问候/感谢/问身份 → 固定拟人引导语', () => {
    expect(matchChitchat('你好')).toBe(CHITCHAT_REPLY);
    expect(matchChitchat('你好！')).toBe(CHITCHAT_REPLY);
    expect(matchChitchat('你是谁？')).toBe(CHITCHAT_REPLY);
    expect(matchChitchat('谢谢')).toBe(CHITCHAT_REPLY);
    expect(matchChitchat('HI')).toBe(CHITCHAT_REPLY);
  });

  it('情绪宣泄/状态吐槽 → 本地安抚语（秒回，不走 LLM）', () => {
    expect(matchChitchat('不想上班')).toBe(EMO_REPLY);
    expect(matchChitchat('明天要早起报到觉得烦')).toBe(EMO_REPLY);
    expect(matchChitchat('好紧张啊')).toBe(EMO_REPLY);
    expect(matchChitchat('好累啊')).toBe(EMO_REPLY);
  });

  it('天气寒暄 → 本地接话', () => {
    expect(matchChitchat('今天天气真好')).toBe(WEATHER_REPLY);
  });

  it('跨领域越界请求（翻译/写代码）→ 本地统一拒绝语，不执行任务', () => {
    expect(matchChitchat('将 community 翻译成中文')).toBe(OFFTOPIC_REPLY);
    expect(matchChitchat('帮我翻译一下 notebook')).toBe(OFFTOPIC_REPLY);
    expect(matchChitchat('帮我写一段 Python 冒泡排序')).toBe(OFFTOPIC_REPLY);
  });

  it('业务语境豁免：问公司文件里的英文词 → 不拦截，放行 LLM 解释分支', () => {
    expect(matchChitchat('入职材料里的 certificate 是什么意思？')).toBeNull();
    expect(matchChitchat('员工手册里的 NDA 是什么？')).toBeNull();
    // 与公司文件相关的翻译请求也算业务辅助，不再拒答
    expect(matchChitchat('帮我翻译一下入职材料里的英文')).toBeNull();
  });

  it('日期/时间问答 → 本地系统时钟秒答（含质疑句），绝不触发越界拒答或 HR 兜底', () => {
    const reply = matchChitchat('今天是星期几？');
    expect(reply).toBe(nowReply());
    expect(reply).toContain('星期');
    expect(matchChitchat('你不知道今天是星期几吗')).toBe(nowReply());
    expect(matchChitchat('今天几号')).toBe(nowReply());
    expect(matchChitchat('现在几点')).toBe(nowReply());
  });

  it('事件日期不本地抢答（入职那天是星期几走 LLM 业务分支）', () => {
    expect(matchChitchat('入职那天是星期几')).toBeNull();
  });

  it('buildTimeContext 注入真实系统时间且指向 Asia/Shanghai', () => {
    const ctx = buildTimeContext();
    expect(ctx).toContain('Asia/Shanghai');
    expect(ctx).toMatch(/20\d\d年/);
    expect(buildLiveSystemPrompt()).toContain(ctx);
  });

  it('业务语境里的"计算"不被误拦成越界（年假计算仍走业务兜底链）', () => {
    expect(matchChitchat('年假怎么计算')).toBeNull();
  });

  it('问候/情绪后带强业务词 → 不分流（交 LLM 按业务分支兜底）', () => {
    expect(matchChitchat('你好，社保怎么交')).toBeNull();
    expect(matchChitchat('你好呀，请问工资几号发')).toBeNull();
    expect(matchChitchat('不想上班，公积金怎么交')).toBeNull();
    expect(matchChitchat('好累啊，入职材料交哪些')).toBeNull();
  });

  it('超长文本 → 不分流', () => {
    expect(matchChitchat('你好'.repeat(20))).toBeNull();
  });
});

// ── 兜底三层：LLM 温和兜底（mock fetch） ────────────────────────────────

describe('softenFallback（LLM 输出必须过后置闸门）', () => {
  it('业务线：保留"联系 HR"引导 → 通过闸门', () => {
    expect(
      isSoftFallbackTrustworthy(
        '这个问题我也不太确定，为了不误导你，建议直接联系 HR 确认哦',
        '社保缴费比例是多少？',
      ),
    ).toBe(true);
  });

  it('业务线：弄丢 HR 引导（疑似编政策）/ 超长 / 空文案 → 不可信', () => {
    expect(isSoftFallbackTrustworthy('您可以这样办理社保：第一步……', '社保怎么交')).toBe(false);
    expect(isSoftFallbackTrustworthy('好'.repeat(201), '不想上班')).toBe(false);
    expect(isSoftFallbackTrustworthy('', '不想上班')).toBe(false);
  });

  it('非业务线：共情安抚不提 HR → 放行（闸门不再误伤情绪回应）', () => {
    expect(isSoftFallbackTrustworthy('抱抱，不想上班的日常太真实了，摸摸头～', '不想上班')).toBe(
      true,
    );
    expect(isSoftFallbackTrustworthy('张三你好呀，以后多多关照～', '我叫张三，以后多关照')).toBe(
      true,
    );
  });

  it('词汇解释线：HR 材料里的英文词解释 → 直接放行，不要求"联系 HR"', () => {
    expect(
      isSoftFallbackTrustworthy(
        'certificate 一般指证明文件，入职材料里通常指学历/学位证明',
        '入职材料里的 certificate 是什么意思？',
      ),
    ).toBe(true);
    expect(
      isSoftFallbackTrustworthy(
        'NDA 是保密协议的缩写，签了就不能对外披露公司信息',
        '员工手册里的 NDA 是什么？',
      ),
    ).toBe(true);
  });

  it('政治/色情特征 → 无论什么线都拒收', () => {
    expect(isSoftFallbackTrustworthy('这个要问政府文件……', '不想上班')).toBe(false);
    expect(isSoftFallbackTrustworthy('约炮了解一下', '你好')).toBe(false);
  });

  it('LLM 无 Key → null（vitest 环境默认无 Key，生产失败时同样回静态话术）', async () => {
    expect(await softenFallback('社保缴费比例是多少？')).toBeNull();
  });

  it('LLM 成功（业务问题）→ 返回温和话术（mock deepseek）', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '这个问题我也不太确定，建议直接联系 HR 确认哦～' } }],
        }),
      })),
    );
    const text = await softenFallback('社保缴费比例是多少？');
    expect(text).toBe('这个问题我也不太确定，建议直接联系 HR 确认哦～');
  });

  it('LLM 成功（情绪）→ 共情回应直达（mock deepseek，无需提 HR）', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '哈哈不想上班的心情太懂了，抱抱你～' } }],
        }),
      })),
    );
    const text = await softenFallback('不想上班');
    expect(text).toBe('哈哈不想上班的心情太懂了，抱抱你～');
  });
});

// ── runLocalWorkflow 接线：未匹配/低置信分流 + structured_json 契约不变 ────

describe('runLocalWorkflow 兜底接线（批次10）', () => {
  beforeAll(async () => {
    // 保证种子在库（与 hr-assistant.test.ts 同款 upsert，幂等）
    await prisma.knowledgeItem.upsert({
      where: { id: 'faq_hr_onboarding_001' },
      create: {
        id: 'faq_hr_onboarding_001',
        question: '入职需要准备哪些材料？',
        answer: '需要携带身份证、学历学位证明、银行卡等材料。',
        tags: JSON.stringify(['入职材料', '新员工', '报到']),
        source: 'seed',
      },
      update: {},
    });
  });

  const llmOk = (content: string) =>
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    }));

  it('未匹配 + 闲聊问候 → 本地引导语（不打 LLM）', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const reply = await runLocalWorkflow({
      message: '你好',
      userRole: 'new_hire',
      outputMode: 'chat_text',
    });
    expect(reply).toBe(CHITCHAT_REPLY);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('未匹配 + 越界请求（翻译/代码）→ 本地拒绝语，零 Token（不打 LLM）', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const message of [
      '将 community 翻译成中文',
      '帮我翻译一下 notebook',
      '帮我写一段 Python 冒泡排序',
    ]) {
      const reply = await runLocalWorkflow({
        message,
        userRole: 'new_hire',
        outputMode: 'chat_text',
      });
      expect(reply).toBe(OFFTOPIC_REPLY);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('词汇解释意图优先于 FAQ 命中：问"材料里的 certificate"直接解释而非甩材料清单', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: 'certificate 指证明文件，入职材料里通常指学历/学位证明' } },
          ],
        }),
      })),
    );
    const reply = await runLocalWorkflow({
      message: '入职材料里的 certificate 是什么意思？',
      userRole: 'new_hire',
      outputMode: 'chat_text',
    });
    expect(reply).toBe('certificate 指证明文件，入职材料里通常指学历/学位证明');
  });

  it('未匹配 + 业务问题 + LLM 可用 → 温和话术', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal('fetch', llmOk('这个问题我也不太确定，为了不误导你，建议直接联系 HR 确认哦～'));
    const reply = await runLocalWorkflow({
      message: '社保缴费比例是多少',
      userRole: 'new_hire',
      outputMode: 'chat_text',
    });
    expect(reply).toBe('这个问题我也不太确定，为了不误导你，建议直接联系 HR 确认哦～');
  });

  it('未匹配 + LLM 挂 → 静态 FALLBACK_TEXT（兜底链路绝不因 LLM 坏而坏）', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const reply = await runLocalWorkflow({
      message: '社保缴费比例是多少',
      userRole: 'new_hire',
      outputMode: 'chat_text',
    });
    expect(reply).toBe(FALLBACK_TEXT);
  });

  it('未匹配 + structured_json → 严格 FALLBACK_JSON（契约分离，不走拟人化）', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal('fetch', llmOk('随便说什么'));
    const result = await runLocalWorkflow({
      message: '社保缴费比例是多少',
      userRole: 'new_hire',
      outputMode: 'structured_json',
    });
    expect(result).toEqual(FALLBACK_JSON);
  });
});
