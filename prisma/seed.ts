// prisma/seed.ts
//
// HR 助理知识库种子：3 条入职 FAQ，upsert 按 id 幂等写入。
// tags / allowedRoles 存 JSON 字符串（SQLite 无 scalar list），业务层 parse。
// source 固定 seed_faq_v0.1_hr_confirm_required：答案均为占位内容，
// 正式上线前必须由 HR 逐条确认替换。

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const faqs = [
  {
    id: 'faq_hr_onboarding_001',
    question: '入职需要准备哪些材料？',
    answer:
      '常见材料包括身份证、学历/学位证明、银行卡、离职证明（如适用）、证件照等；具体清单、份数和提交方式以 offer 邮件或 HR 入职通知为准。若通知中未列明，请直接联系 HR 确认。',
    tags: ['入职材料', '新员工', '报到'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'seed_faq_v0.1_hr_confirm_required',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_hr_onboarding_002',
    question: '入职当天流程是什么？',
    answer:
      '请按 HR 入职通知中的时间、地点和对接方式到达，联系入职对接人办理签到、资料提交和账号开通等事项。不同岗位或办公地点的流程可能不同，请以 HR 通知为准。',
    tags: ['入职当天', '报到流程', '新员工'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'seed_faq_v0.1_hr_confirm_required',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_hr_onboarding_003',
    question: '入职咨询应该联系谁？',
    answer:
      '请优先通过 offer 邮件或入职通知中的 HR 对接人咨询；如果找不到具体联系方式，建议您直接联系公司 HR 部门或前台协助确认。',
    tags: ['联系HR', '入职咨询', '新员工'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'seed_faq_v0.1_hr_confirm_required',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
];

async function main() {
  for (const faq of faqs) {
    const data = {
      ...faq,
      tags: JSON.stringify(faq.tags),
      allowedRoles: JSON.stringify(faq.allowedRoles),
    };

    await prisma.knowledgeItem.upsert({
      where: { id: faq.id },
      update: data,
      create: data,
    });
  }

  // 写入后自验：3 条都应是 active 且未软删除
  const rows = await prisma.knowledgeItem.findMany({
    where: { id: { in: faqs.map((f) => f.id) } },
  });
  const bad = rows.filter((r) => r.status !== 'active' || r.isDeleted);
  console.log(`[seed] KnowledgeItem 写入 ${rows.length}/${faqs.length} 条`);
  if (bad.length) {
    throw new Error(`[seed] 异常条目：${bad.map((b) => b.id).join(', ')}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
