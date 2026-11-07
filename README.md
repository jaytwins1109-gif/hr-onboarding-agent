# 小初 · 新员工入职咨询助理

一个基于**知识库检索**的入职 FAQ 问答助手。回答范围严格限定在 HR 维护的知识条目内：
能查到就答，查不到就固定兜底一句「不清楚，建议联系 HR。」

- 外壳：Next.js 15（App Router）
- 检索：本地确定性链路（知识库检索 → 权限守卫 → 关键词匹配 → 固定兜底），**不靠模型编答案**
- 数据源：SQLite + Prisma，业务表只有 `KnowledgeItem`（`prisma/seed.ts` 维护种子 FAQ）
- 两个出口：`chat_text`（UI 用，回 `{reply, trace_id}`）/ `structured_json`（程序化调用，回结构化结果）

---

## 快速开始

```bash
npm install
cp .env.example .env          # 填 DATABASE_URL / AUTH_SECRET
npm run db:seed               # 写入种子知识条目
npm run dev                   # http://localhost:3000
```

后台：<http://localhost:3000/admin>（口令登录，未配 `ADMIN_PASSWORD_HASH` 时后台禁用）

```bash
npm run gen-password -- 你想用的口令 --write
```

---

## 回归与检查

```bash
npm run verify   # tsc --noEmit + vitest（6 个文件 / 55 条）
npm test         # 只跑 vitest
npm run lint     # ESLint 9 flat config，0 error 0 warning 才收工
npm run db:seed  # 幂等写入种子知识条目
```

> 改文案/守卫/知识条目后，`verify` + `lint` 全绿才算完成。

---

## 一条提问是怎么走的

```text
POST /api/ai（或 /api/ai/stream）
  → 身份解析（cx_token / x-guest-id）+ 限流 + TraceID
  → handleTurn(message, role)
      1. 知识库检索：只取 active + 未软删的条目
      2. 权限守卫 canAccessKnowledgeItem：scope 匹配 + allowedRoles 含当前角色
      3. FAQ 关键词匹配（本地确定性，无模型参与）
      4. 命中 → 返回条目答案；未命中 → 固定兜底「不清楚，建议联系 HR。」
  → 落库（Message）+ 返回
```

`chat_text` 与 `structured_json` 严格分离：前者只回自然语言，后者回结构化字段，
用户可见文本里不会出现字段名、花括号或代码块。

---

## 目录结构

```text
app/
  page.tsx                 聊天界面（消息流 + 发送链路，流式优先、失败退回一次性）
  _components/             气泡 / 品牌卡 / 皮肤 / 常量 / 类型 / 鉴权 hook
  admin/                   后台外壳（看板 / 对话审查 / 商品管理页占位）
  api/ai/route.ts          一次性入口：身份 → handleTurn → chat_text|structured_json
  api/ai/stream/route.ts   流式入口（SSE：delta / final / error）
  api/admin/*              看板 / 对话 / 商品（501 兼容壳）
lib/
  prompts/system-prompt.ts ★ 人设唯一真源
  llm/local-workflow.ts    检索 + 权限守卫 + FAQ 匹配 + 兜底
  chat/handlers.ts         两个入口共用的轮次编排
  auth/                    票据 / 身份 / 守卫 / 限流
prisma/
  schema.prisma            User / Message / KnowledgeItem
  seed.ts                  种子知识条目（HR 确认后替换占位答案）
tests/                     vitest：知识库守卫、检索与兜底、Admin 越权矩阵
```

---

## 文档

| 文档 | 干什么 |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | 项目规则（新会话启动规则、汇报格式约定、知识库维护约定） |
| [`PROGRESS.md`](./PROGRESS.md) | 做到哪了：正在做 / 已完成 / 下一步 / 遗留问题 |
| [`系统prompt汇总.md`](./系统prompt汇总.md) | 全链路提示词与规则总索引（含历史变更记录） |
| [`DEPLOY.md`](./DEPLOY.md) | 部署（Docker / 云平台） |
| [`docs/`](./docs/) | 设计留档与测试日志（旧业务文档仅作历史参考） |

---

## 约定（改代码前先看）

1. **兜底话术固定**：`不清楚，建议联系 HR。`（一字不差，测试有断言）
2. **只召回合规条目**：`status='active'` + `isDeleted=false` + scope 匹配 + `allowedRoles` 含当前角色，四道缺一不可。
3. **删条目走软删除**（`isDeleted=true` + `deletedAt`），保留追溯痕迹。
4. **`chat_text` / `structured_json` 分离**：UI 不传 `output_mode`，永远拿纯文本。
5. 改人设改 `lib/prompts/system-prompt.ts`，并同步 `系统prompt汇总.md`。
