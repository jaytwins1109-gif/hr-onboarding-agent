# TEST_LOG — 测试日志归档

> 本文件是 V3.0 冻结时的测试终态快照。之后的每次解冻开发，在此追加，不改历史。

## 解冻：底层换血（2026-11-07，零食业务 → HR 助理）

| 套件 | 命令 | 结果 | 说明 |
|---|---|---|---|
| Prisma | `npx prisma format / validate / db push --accept-data-loss` | 全过 | Product→KnowledgeItem；**仅删 Product 表，未 force-reset**，User/Memory/Message 数据保留 |
| 种子 | `npm run db:seed` | 3/3 | 3 条入职 FAQ upsert 幂等 + 写后自验（status=active、isDeleted=false） |
| 单测 | `npm run verify` / `npm test` | **41 / 41** | 新增 `tests/hr-assistant.test.ts` 12 条：种子基线、chat_text 命中含「身份证」且无 JSON 痕迹、structured_json 字段全断言（matched_faq_ids 含 faq_hr_onboarding_001 / needs_human=false）、「公司股票怎么买」兜底一字不差（no_match/low/needs_human=true）、软删除守卫（isDeleted/deletedAt/status/scope + 同内容对照条目证明有牙）、越权守卫（employee 不可召回 new_hire 条目 + employee 预留分支可用 + 未知角色拒绝）；旧 profile-guard / reco-guard 测试随零食业务删除 |
| lint | `npm run lint` | 0 error / 0 warning | — |

> 旧 `npm run smoke`（166 条零食用例）与 `guard` 脚本已随零食业务整体删除，package.json 对应脚本已移除。

## 冻结终态（2026-11-06，tag `v3.0.0`）

| 套件 | 命令 | 结果 | 说明 |
|---|---|---|---|
| 单测 + 集成 | `npm run verify`（vitest，typecheck + lint + test 合一闸门） | **133 / 133 通过** | 纯逻辑与守卫矩阵，不依赖外部服务 |
| 端到端冒烟 | `npm run smoke`（需 dev 运行中） | **166 / 166 通过** | 真打 `/api/ai` 两条路由 + 数据库读写 + 全部 Admin API + 中间件语义 |

合计 **299 条自动化断言**，冻结时全绿。

## 各版本里程碑测试记录

| 版本 | verify | smoke | 关键新增用例 |
|---|---|---|---|
| V1.0 | — | 145 | 对话主干、推荐卡三件套、限流、记忆软删除 |
| V2.0 | 103 | 156 | 登录/注册/升级票据、游客票据自检、账号删除安全 |
| V2.1 | 116 | 166 | 身份解析优先级、profile 可信白名单、场景互斥 |
| V3.0 步骤 1-2 | 116 | 166 | 迁移幂等、商品缓存一致性（库为源内存为算） |
| V3.0 步骤 3 | 121 | 166 | +5 越权矩阵：ADMIN 放行 / USER / 旧票 / 无票 / 伪造票全拦 |
| V3.0 步骤 4 | 128 | 166 | +7 落库开关矩阵（ADMIN_REVIEW_SCOPE）+ 卡片四件套 |
| V3.0 步骤 5 | 133 | 166 | +5 Admin API 越权（四接口无票/USER 票/伪造票全 403） |
| V3.0 步骤 6-7 | 133 | 166 | UI 骨架轮（零逻辑改动，断言零退化） |

## 端到端实测记录（V3.0，探针即用即删）

- **商品缓存红线**：PUT 改价 29.9→9.9 后 C 端推荐卡立即 9.9（无需重启）；软下架立即消失；Admin 弹窗新增商品 → cacheSize 51 → C 端立即推到该 SKU
- **落库红线**：两条路由各落 user/assistant 轮、流式只记 final 定稿；`guest_only` 下注册用户零记录
- **鉴权红线**：真登录 ADMIN 直进看板；垃圾票/无票/USER 全部 307
- **UI 走查**：agent-browser 实拍桌面/移动端双视口、骨架屏、趋势图、软删除闭环；C 端皮肤零污染

## 已知抖动（拍板：V3.0 冻结期不处理）

`smoke` 中"忌口优先于口味抽取"等经大脑用例每轮 FAIL 的具体条目不同（模型当轮行为差异），
复跑即绿。可选方向：经大脑断言降级为软警告。见 PROGRESS.md §3。
