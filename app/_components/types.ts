/**
 * 前端用到的数据结构。
 *
 * 从 `app/page.tsx` 里搬出来的，**只放类型、不放逻辑**。
 * 推荐卡（Rec）/ 筛选（Filters）/ 记忆快照（MemorySnapshot）已随旧业务下线删除。
 */

/** 一条消息（纯文本气泡） */
export interface Msg {
  role: 'user' | 'assistant';
  content: string;
  /** 时间戳，用来插日期分隔线；旧记录没有就当没有分隔 */
  ts?: number;
  /** 流式占位气泡的临时标识：同一条消息要被反复改写，靠它定位 */
  id?: string;
  /**
   * 流式吐出来的字被 final 整段改写了（本地防呆 / 意图纠偏）。
   * 挂上淡入动画，让替换有个视觉过渡，而不是"先出一段、啪地变成另一段"
   */
  refreshed?: boolean;
}
