// prisma/seed.ts
//
// HR 助理知识库种子：32 条企业级模拟 FAQ（开源演示 + 本地深度测试），
// upsert 按 id 幂等写入；跑 seed 前先清掉旧版 faq_hr_onboarding_* 种子，
// 保证"全量替换"语义（老库重跑不留历史条目）。
//
// 约定（与检索链路 lib/llm/local-workflow.ts 对齐）：
//   - tags / allowedRoles 存 JSON 字符串（SQLite 无 scalar list），本文件传数组、写入前 stringify；
//   - scope 统一 'new_hire_public'：这是检索池的唯一合法 scope（代码层硬过滤），
//     新老员工的可见性差异一律由 allowedRoles 表达（['employee'] = 仅老员工可见）；
//   - source 固定 demo_data：全部为演示用模拟数据，不含任何真实公司/人员信息；
//   - faq_edge_002/003 刻意软删除（isDeleted=true），用于测试"废弃数据不得召回"；
//   - faq_benefit_006 answer 内嵌 <script> 串，用于测试 XSS 渲染安全，刻意保留。

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const faqs = [
  // ==================== 1. 基础入职流程 (新员工公开) ====================
  {
    id: 'faq_onboard_001',
    question: '入职当天去哪里报到？',
    answer: '脆香零食总部位于科技园A座3层。请携带身份证在前台登记后，前往302会议室办理入职报到。',
    tags: ['报到', '办公地点', '总部', '第一天'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_002',
    question: '报到需要带什么材料？',
    answer: '请携带身份证原件、学历学位证书复印件、一寸免冠照片2张，以及原单位离职证明（如有）。',
    tags: ['入职材料', '报到', '带什么', '证件'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_003',
    question: '公司几点上班？打卡用什么软件？',
    answer: '弹性工作制，核心工作时间 10:00-17:00。请下载“脆香OA”App进行手机打卡，每日需打卡两次。',
    tags: ['打卡', '上班时间', '考勤', 'OA'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_004',
    question: '公司有食堂吗？怎么吃饭？',
    answer:
      '总部B1层有员工餐厅，提供早中晚餐。新员工入职首周发放免费餐券，后续可通过工牌余额支付（有内部补贴）。',
    tags: ['食堂', '吃饭', '餐厅', '补贴'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_005',
    question: '入职第一周有培训吗？',
    answer:
      '有。每周一上午 10 点在三楼培训室有“新员工欢迎会及企业文化培训”，请准时参加，培训结束后会有小礼品。',
    tags: ['培训', '第一周', '企业文化'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_006',
    question: '办公电脑什么时候发？可以自己带电脑吗？',
    answer:
      '入职当天 IT 部门会统一发放 MacBook Pro。出于信息安全考虑，办公期间必须使用公司设备，严禁私人电脑接入内网。',
    tags: ['电脑', '设备', 'IT', 'MacBook'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_007',
    question: '公司WiFi密码是多少？',
    answer:
      '办公区 WiFi 为 CXX-Snack-Office，账号为您的英文名，初始密码是 Welcome@123，连接后请立即修改。',
    tags: ['WiFi', '网络', '密码'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_008',
    question: '公司班车路线怎么查？',
    answer:
      '目前有 5 条班车路线覆盖市区主要地铁站。请在“脆香OA”App的“行政服务”板块查看详细时刻表和站点。',
    tags: ['班车', '交通', '通勤'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_009',
    question: '洗手间和茶水间在哪里？',
    answer: '每层楼的东侧尽头设有洗手间。3层西侧设有茶水间，提供免费咖啡、茶包和脆香零食自助柜。',
    tags: ['洗手间', '厕所', '茶水间', '零食柜'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_onboard_010',
    question: '穿衣服有要求吗？可以穿拖鞋吗？',
    answer: '公司氛围轻松，着装无严格要求，整洁得体即可。但严禁穿拖鞋进入实验室和客户接待区。',
    tags: ['着装', '穿什么', '要求'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },

  // ==================== 2. 薪酬福利与社保 (基础政策) ====================
  {
    id: 'faq_benefit_001',
    question: '工资每个月几号发？',
    answer: '公司每月 10 号发放上月工资。如遇节假日则提前至最近一个工作日发放。',
    tags: ['工资', '发薪日', '薪酬'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_benefit_002',
    question: '五险一金是怎么交的？比例是多少？',
    answer:
      '公司按照国家规定缴纳五险一金（养老、医疗、失业、工伤、生育及公积金）。公积金按最高比例 12% 双边缴纳。',
    tags: ['五险一金', '社保', '公积金', '比例'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_benefit_003',
    question: '试用期是多久？试用期工资打折吗？',
    answer: '常规岗位试用期为 3 个月，薪资全额发放不打折。表现优异者可提前转正。',
    tags: ['试用期', '转正', '工资'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_benefit_004',
    question: '年假有几天？怎么请？',
    answer:
      '入职满一年享有 5 天带薪年假，每满一年增加 1 天。请在 OA 系统“请假”模块提前 3 个工作日提交审批。',
    tags: ['年假', '请假', '带薪'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_benefit_005',
    question: '病假需要开证明吗？',
    answer: '连续病假 1 天以内口头报备即可；超过 1 天需在 OA 提交二级以上医院开具的病假条。',
    tags: ['病假', '请假', '医院'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_benefit_006',
    question: '出差报销的标准是什么？',
    answer:
      '差旅报销需提供正规发票及行程单。交通费按实际发生额报销，住宿费一线城市上限 500 元/天，二线城市上限 350 元/天。<script>alert("XSS_TEST")</script> 请注意，报销单需在出差结束后 15 天内提交。',
    tags: ['报销', '出差', '差旅', '发票'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_benefit_007',
    question: '加班有加班费吗？',
    answer: '公司提倡高效工作。周末加班可申请调休，法定节假日加班按国家规定支付 300% 薪资。',
    tags: ['加班', '加班费', '调休'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_benefit_008',
    question: '公司有补充商业医疗保险吗？',
    answer:
      '有。转正后公司会为员工购买补充商业医疗保险，涵盖门诊和住院报销，配偶及子女可自费附加。',
    tags: ['商业保险', '医疗', '看病'],
    scope: 'new_hire_public',
    allowedRoles: ['employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },

  // ==================== 3. 员工专属福利 (权限隔离测试) ====================
  {
    id: 'faq_privilege_001',
    question: '员工内购福利怎么申请？',
    answer: '正式员工可通过 OA 系统“员工福利”模块申请脆香零食内购 8 折折扣，每月限购 5 次。',
    tags: ['内购', '福利', '折扣', '零食'],
    scope: 'new_hire_public',
    allowedRoles: ['employee'], // 仅老员工，测试新员工拦截
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_privilege_002',
    question: '公司有股票期权吗？怎么分配？',
    answer: '核心岗位及 P7 以上职级员工享有期权分配资格，具体份额在转正答辩通过后由 HR 单独沟通。',
    tags: ['期权', '股票', '薪酬'],
    scope: 'new_hire_public',
    allowedRoles: ['employee'], // 仅老员工
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_privilege_003',
    question: '怎么连接公司内网 VPN？',
    answer:
      '请下载公司专属 VPN 客户端，账号为您的企业邮箱前缀，初始密码请咨询 IT 部门（分机号：8000）。',
    tags: ['内网', 'VPN', 'IT支持'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'], // 全员通用
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_privilege_004',
    question: '年度体检什么时候安排？',
    answer:
      '每年 10 月公司统一安排员工体检。转正员工享有 1000 元体检套餐额度，可在爱康国宾或美年大健康预约。',
    tags: ['体检', '健康', '福利'],
    scope: 'new_hire_public',
    allowedRoles: ['employee'], // 仅老员工
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_privilege_005',
    question: '加班打车可以报销吗？',
    answer:
      '工作日晚上 21:30 之后下班，可通过企业滴滴直接呼叫，无需个人垫付。周末加班需提前在 OA 申请用车码。',
    tags: ['打车', '加班', '报销'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },

  // ==================== 4. 同义词与长尾词陷阱 (测试检索能力) ====================
  {
    id: 'faq_search_001',
    question: '入职要带啥？',
    answer:
      '最核心的是身份证、学历证明、离职证明和银行卡。具体的材料清单请参考《报到需要带什么材料》这一条。',
    tags: ['带啥', '准备', '入职', '报到'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_search_002',
    question: '第一天的流程是怎样的？',
    answer:
      '9:30 前台签到 -> 10:00 会议室交材料、签合同 -> 11:30 领取电脑、开通账号 -> 12:00 食堂午餐。',
    tags: ['第一天', '流程', '报到', '入职当天'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_search_003',
    question: '找谁办理入职？',
    answer:
      '请联系 HR 部门的王美丽（分机号：8001），或者直接拨打她的手机。如果不在工位，请联系前台小姐姐。',
    tags: ['联系谁', 'HR', '对接人', '办理'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_search_004',
    question: 'OA系统怎么登录？',
    answer: '请使用电脑浏览器访问 oa.cuixiang.com，账号为您的工号，初始密码为身份证后6位。',
    tags: ['OA', '系统', '登录', '工号'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_search_005',
    question: '公司有没有零食柜？',
    answer:
      '有的，总部每层茶水间都配有脆香零食自助柜，员工可通过工牌扫码免费领取，每人每周限额 5 包。',
    tags: ['零食', '茶水间', '免费', '福利'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_search_006',
    question: '报销流程怎么走？',
    answer:
      '在 OA 系统提交报销单，附上发票扫描件，由直属主管审批后流转至财务部。财务每周三、周五统一打款。',
    tags: ['报销', '流程', '发票', '审批'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },

  // ==================== 5. 边界测试与废弃数据 (软删除与超长文本) ====================
  {
    id: 'faq_edge_001',
    question: '公司员工手册完整版在哪里看？',
    answer:
      '完整版的《脆香零食员工手册》长达两万字，包含考勤、绩效、晋升、奖惩、保密协议等全部内容。请登录企业微信的“微盘” -> “公共文件” -> “HR制度”文件夹中下载《2026版员工手册.pdf》。请在入职一周内仔细阅读，并在OA系统完成《制度确认签署》。此处为了测试超长文本，特意补充了一段废话：由于公司业务不断扩张，原有的规章制度可能会有微调，所有具体执行标准以最新下发的红头文件为准。如有疑问，请随时联系人力资源部。',
    tags: ['员工手册', '规章制度', 'PDF', '长文本'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: false,
    deletedAt: null,
  },
  {
    id: 'faq_edge_002',
    question: '旧版薪酬制度说明',
    answer: '（这是一条废弃数据，不应被检索到）原规定每月 15 号发薪，现改为 10 号。',
    tags: ['薪酬', '旧版'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire', 'employee'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: true,
    deletedAt: new Date(),
  },
  {
    id: 'faq_edge_003',
    question: '旧版请假流程说明',
    answer: '（这是一条废弃数据）原规定纸质请假单，现已全部转为 OA 线上审批。',
    tags: ['请假', '旧版'],
    scope: 'new_hire_public',
    allowedRoles: ['new_hire'],
    status: 'active',
    source: 'demo_data',
    version: 1,
    isDeleted: true,
    deletedAt: new Date(),
  },
];

async function main() {
  // 全量替换语义：先清掉旧版种子（faq_hr_onboarding_*），防止老库重跑残留历史条目
  const removed = await prisma.knowledgeItem.deleteMany({
    where: { id: { startsWith: 'faq_hr_onboarding_' } },
  });
  if (removed.count) console.log(`[seed] 清理旧版种子 ${removed.count} 条`);

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

  // 写入后自验：
  //   - 32 条全部入库；
  //   - 30 条在库条目应为 active 且未软删除（faq_edge_002/003 刻意软删除，属预期）。
  const rows = await prisma.knowledgeItem.findMany({
    where: { id: { in: faqs.map((f) => f.id) } },
  });
  const expectedLive = faqs.filter((f) => !f.isDeleted).map((f) => f.id);
  const bad = rows.filter(
    (r) => expectedLive.includes(r.id) && (r.status !== 'active' || r.isDeleted || r.deletedAt),
  );
  const softDeleted = rows.filter((r) => r.isDeleted);
  console.log(`[seed] KnowledgeItem 写入 ${rows.length}/${faqs.length} 条`);
  console.log(`[seed] 其中软删除条目 ${softDeleted.length} 条（预期 2，废弃数据召回测试用）`);
  if (rows.length !== faqs.length) {
    throw new Error('[seed] 有条目未写入成功');
  }
  if (softDeleted.length !== 2) {
    throw new Error('[seed] 软删除条目数量与预期不符');
  }
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
