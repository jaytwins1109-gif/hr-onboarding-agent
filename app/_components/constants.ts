/**
 * 前端常量：入职快捷问题 / 场景入口 / 欢迎语 / localStorage key / 皮肤。
 *
 * 从 `app/page.tsx` 搬出来。改文案来这里，别只改一边：
 *   - `SCENES` / `QUICK` / `WELCOME_CARDS` 三处入口的文案必须**严格对应知识库种子 FAQ**
 *     （入职材料 / 入职当天流程 / 入职咨询找谁），否则用户点一下就直接吃兜底话术；
 *   - `THEME_KEY` 必须与 `app/layout.tsx` 里防闪烁的内联脚本一致。
 */

/** 聊起来后的快捷开口：三问与知识库种子 FAQ 一一对应 */
export const QUICK = [
  { label: '入职材料', icon: '📄', text: '入职需要准备哪些材料？' },
  { label: '当天流程', icon: '🗓️', text: '入职当天流程是什么？' },
  { label: '咨询找谁', icon: '🙋', text: '入职咨询找谁？' },
];

/** 左侧深色卡的快捷咨询竖排入口：同样只给种子覆盖的三问 */
export const SCENES = [
  {
    icon: '📄',
    title: '入职材料',
    sub: '证件、证明、银行卡',
    text: '入职需要准备哪些材料？',
  },
  {
    icon: '🗓️',
    title: '当天流程',
    sub: '几点到、找谁签到',
    text: '入职当天流程是什么？',
  },
  {
    icon: '🙋',
    title: '咨询找谁',
    sub: 'HR 对接人与联系方式',
    text: '入职咨询找谁？',
  },
];

/** 右侧欢迎区块的快捷提问卡（与左侧场景同源三问，只是换一种入口形态） */
export const WELCOME_CARDS = [
  {
    icon: '📄',
    title: '入职要带什么',
    sub: '材料清单一次说清',
    text: '入职需要准备哪些材料？',
  },
  {
    icon: '🗓️',
    title: '第一天怎么走',
    sub: '签到、资料提交、账号开通',
    text: '入职当天流程是什么？',
  },
  {
    icon: '🙋',
    title: '有问题找谁',
    sub: 'HR 咨询入口',
    text: '入职咨询找谁？',
  },
];

export const WELCOME =
  '我是小初，新员工入职咨询助理。\n入职材料、当天流程、遇到问题找谁，都可以直接问我。';

/** 聊天记录存本地，刷新页面不丢 */
export const STORE_KEY = 'cx_chat_v1';

/**
 * 旧业务（零食助手「脆脆」）时代留在 localStorage 里的废弃 key：
 * 功能上已无任何消费者，进站时顺手删掉，避免旧数据常驻。
 */
export const DEPRECATED_KEYS = ['cx_profile_v1', 'cx_want_v1', 'cx_profile_reset_20261102'];

/**
 * 旧业务串台检测：历史聊天里出现这些**强特征词**就判定为零食时代的残留档，
 * 读档即销毁（只删 STORE_KEY），回到干净的欢迎语状态。
 * 只保留品牌专名，不放「零食」这类普通词——否则「公司有零食柜吗」这类
 * 正常咨询的历史会被误伤清空（2026-11-07 批次7 修正）。
 */
export const OLD_ERA_PATTERN = /(脆脆|跑跑|脆香)/;
/** 用户标识：第一次进站生成一个固定住，后端据此存/取会话，不然所有人的数据会串在一个桶里 */
export const USER_KEY = 'cx_user_v1';
/** 皮肤偏好：跟 layout.tsx 里防闪烁的内联脚本用同一个 key，改一处必须改两处 */
export const THEME_KEY = 'cx_theme_v1';

/**
 * 皮肤清单。真正决定配色的是 globals.css 里同名的 [data-theme] 变量块，
 * 这里只管按钮上的名字和一个示意色点。
 */
export const THEMES = [
  { key: 'warm', label: '暖阳灰', dot: '#334155' },
  { key: 'obsidian', label: '曜石黑', dot: '#3A332E' },
  { key: 'glacier', label: '冰川蓝', dot: '#5AA9E6' },
] as const;

export type ThemeKey = (typeof THEMES)[number]['key'];
