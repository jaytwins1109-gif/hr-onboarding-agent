# 项目规则

> ## 【当前项目口径 · 2026-11-13】（手写补充，IDE 重新生成时请贴回）
>
> 本工作区正在按根目录 `chujian.txt` 从零构建「初见 ONBOARD」员工服务工作台。
> 下方的「提示词同步 / 知识库条目四道守卫 / 接口契约」等规则表是旧「小初 HR FAQ」项目的历史留档，
> 运行时真源已是 `lib/workspace/*`、`app/workspace/*`、`app/api/workspace/*`；
> 回归入口为 `npm run verify` / `npm test` / `npm run lint` / `npm run format:check`，旧的 `smoke` / `guard` 不存在。
> 制度可见性以 `lib/workspace/policies.ts` 的 `canViewPolicy()` 为准，年假与模型配置权限以 `lib/workspace/access.ts` 为准。
> **汇报格式约定与【新会话启动规则】仍然长期生效**；但用户已明确要求多阶段任务「做完就继续做，不用询问，做完再给总结」，
> 因此不要逐阶段停下来问方向。
>
> **目录口径 · 2026-11-13**：运行时项目已按 `chujian.txt` 规则 8 整体移入 `onboard/` 子目录。
> 上文及下方规则表里的 `lib/…`、`app/…`、`prisma/…`、`tests/…`、`samples/…` 等路径**均相对 `onboard/`**；
> `npm run verify` / `npm test` / `npm run lint` / `npm run format:check` 以及各 e2e 命令也须在 `onboard/` 下执行。
> 留档（`AGENTS.md`、`PROGRESS.md`、`chujian.txt`、`系统prompt汇总.md`、`TEST_LOG.md`、`docs/`）仍在工作区根目录。

## 【新会话启动规则】先读三个文件，再动手

每次开启新的会话（或者用户让你"继续之前的开发"），**第一件事**必须是读取以下文件：

1. `AGENTS.md`（本文件）—— 了解架构与强制规则
2. `PROGRESS.md` —— 了解当前进度、正在做什么、下一步计划、遗留问题
3. `docs/TEST_LOG.md` —— 了解最近测了哪些内容、哪些还没通过

读完以后：

- **先向用户汇报当前进度**（正在做 / 已完成 / 下一步 / 遗留问题，各一两句），并**询问下一步动作**；
- **不要盲目修改代码**——用户没确认方向之前动手，就是拿一次回归跑的时间赌运气；
- 用户给出方向后，先更新 `PROGRESS.md` 的「正在做」，再开始改；做完回来更新「已完成」。

> 本节是手写规则，`AGENTS.md` 本身由 IDE 扫描项目生成，**存在被重新生成覆盖的可能**。
> 若发现本节消失，照 `PROGRESS.md` §5 的分工表重新贴回即可。

## 汇报格式约定（长期生效，自 2026-11-07 起）

所有“给审查者的汇报”必须遵守以下格式：

1. **整体用一个外层代码块包裹，外层用四个反引号（````）**；内部 diff / 命令块用三反引号，避免嵌套冲突。
2. 汇报内部固定五段，顺序不变，空段写“无”，不省略标题：
   - 一、本轮范围（做了什么，没做什么）
   - 二、修改文件清单（文件 + 一句话说明）
   - 三、关键 diff（每文件只贴关键片段，不贴全文）
   - 四、命令输出（verify / test / lint 原文；失败贴报错原文）
   - 五、剩余风险与待确认项
3. 执行过程只留关键日志，解释统一放第五段；**汇报外不追加“总结/感想”**。

## 提示词变更必须同步《系统prompt汇总》

本项目的提示词与确定性规则**同源两处**：提示词说"该怎么答"，本地代码决定"到底答不答"。
只改一边会让文档失真、后续维护踩坑，因此为强制规则。

### 什么算「提示词变更」

下列文件的下列内容发生增删改，都算，无一例外：

| 文件 | 需要同步的内容 |
|---|---|
| `lib/prompts/system-prompt.ts` | 人设正文、「小初」口径、`SYSTEM_PROMPT` 与兼容导出 |
| `lib/llm/local-workflow.ts` | 检索范围、`canAccessKnowledgeItem` 守卫口径、FAQ 关键词匹配、固定兜底 |
| `lib/chat/handlers.ts` | chat_text / structured_json 两条出口的分流与返回结构 |
| `app/api/ai/route.ts` | `output_mode` 判定、`{reply, trace_id}` 与 `{result, trace_id}` 回包 |
| `app/api/ai/stream/route.ts` | SSE 事件（`delta` / `final` / `error`）与 final 体结构 |
| `app/_components/constants.ts` | `WELCOME` / `SCENES` / `QUICK` / `WELCOME_CARDS`（**必须严格对应种子 FAQ**） |
| `app/page.tsx` | 发送链路（请求体只带 `message`）、报错兜底文案 |

### 改之前

先读根目录 **`系统prompt汇总.md`** 对应章节，确认要改的规则在全链路里的所有落点。
例：「入职需要准备哪些材料」同时存在于——种子知识条目、`constants.ts` 的场景卡文案、
以及测试里的命中断言。**改一边必须检查另外两边。**

### 改完之后必须做

1. 更新 `系统prompt汇总.md` 对应章节；
2. 在该文档末尾「变更记录」表格追加一行（日期、改了什么、涉及文件）；
3. 跑 `npm run verify` + `npm test` + `npm run lint`（**全部离线可跑，不需要 dev server**）；
4. 新增行为同时补测试用例（`tests/`）。

### 不要做的事

- 不要在 `docs/` 下的旧业务设计留档里改人设——它们不是运行时真源。
  唯一真源是 `lib/prompts/system-prompt.ts`。
- 不要把答案正文写死进提示词：答案只能来自 `KnowledgeItem`，提示词只管语气与边界。

---

## 【知识库条目规则】四道守卫缺一不可

召回严格按 `lib/llm/local-workflow.ts` 的 `canAccessKnowledgeItem` 判定，四条同时成立才允许出场：

| # | 条件 | 说明 |
|---|---|---|
| 1 | `status === 'active'` | `draft` / `archived` 一律不出场 |
| 2 | `isDeleted === false` 且 `deletedAt` 为空 | 软删除的条目绝不出场（轨迹保留） |
| 3 | `scope` 在角色白名单内 | 当前只有 `new_hire_public` |
| 4 | `allowedRoles` 含当前角色 | JSON 字符串存数组，如 `["new_hire"]`；`employee` 为预留角色 |

### 加/改一条知识条目要动的地方

| # | 位置 | 改什么 |
|---|---|---|
| 1 | `prisma/seed.ts` | 条目正文、`tags`、`scope`、`allowedRoles`（后者两列存 **JSON 字符串**，SQLite 无 scalar list） |
| 2 | `app/_components/constants.ts` | 若该条目要出现在场景卡上，`SCENES` / `QUICK` / `WELCOME_CARDS` 文案必须与该条目问法对得上（否则点卡片就被兜底） |
| 3 | `tests/hr-assistant.test.ts` / `tests/hr-guard.test.ts` | 命中断言 + **反向断言**（越权/软删除/未覆盖问题必须拿不到答案） |

答案目前是**占位文本**（`source = seed_faq_v0.1_hr_confirm_required`），需 HR 确认后替换。

### 兜底红线

- 兜底话术**固定**为 `不清楚，建议联系 HR。`，一字不差，测试有断言；
- 命中不了、角色不符、条目被删——三种情况都走同一句兜底，**绝不猜答案**。

---

## 【接口契约】两种输出模式严格分离

| 模式 | 谁用 | 回包 |
|---|---|---|
| `chat_text`（默认） | C 端 UI（**不传 `output_mode`**） | `{ reply, trace_id }` |
| `structured_json` | 程序化调用（显式传 `output_mode: 'structured_json'`） | `{ result, trace_id }`，`result` 含 `answer` / `matched_faq_ids` / `needs_human` 等字段 |

红线：面向用户的文本（`reply`）里**不许出现**字段名、花括号、JSON 代码块——测试
`tests/hr-guard.test.ts` 有输出形态断言守着。

---

## 其他约定

- 回归入口：`npm run verify`（tsc + vitest）/ `npm test` / `npm run lint`。
  旧的 `npm run guard`、`npm run smoke` 已随旧业务一起删除，**已不存在**。
- 业务删除一律**软删除**（保留痕迹便于追溯）。
- 详细待办与已知问题清单见 `PROGRESS.md`。
