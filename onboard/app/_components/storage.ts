import { USER_KEY } from './constants';

/**
 * 取（或首次生成）本浏览器的用户标识。
 * 放在函数里而不是 state：send 可能在 state 生效前就被触发，直接读 localStorage 最稳。
 */
export function ensureUserId(): string {
  try {
    let uid = localStorage.getItem(USER_KEY);
    if (!uid) {
      uid = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(USER_KEY, uid);
    }
    return uid;
  } catch {
    // 隐私模式写不了 localStorage，退回匿名桶，至少不报错
    return 'anonymous';
  }
}
