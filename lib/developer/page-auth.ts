// lib/developer/page-auth.ts — Developer 页面层鉴权（server-only）
//
// /developer 的守卫比 /admin 更严：只认 cx_token 里 role === 'DEVELOPER' 的登录票。
// 不认 V1 口令票据（cx_admin）——口令票只能进管理后台，底层配置必须实名 DEVELOPER；
// middleware（edge）已拦一层，这里再验签一次——纵深防御。
import { cookies } from 'next/headers';
import { TOKEN_COOKIE, verifyUserToken } from '@/lib/auth/jwt';

export async function isDeveloperPageAuthed(): Promise<boolean> {
  const store = await cookies();
  const ticket = await verifyUserToken(store.get(TOKEN_COOKIE)?.value);
  return ticket?.role === 'DEVELOPER';
}
