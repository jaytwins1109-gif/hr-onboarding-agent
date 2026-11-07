/**
 * 品牌形象：白色小猫（蓝眼、粉鼻、腮红、三根胡须、粉耳内）。
 *
 * 参考手绘/黏土风的小白猫重绘为纯 SVG：
 * 无外部图片、无渐变 id，16px 气泡头像到 80px 品牌位同源。
 * 小尺寸下靠「白身 + 蓝眼 + 粉鼻」三要素认人，胡须与腮红只做大尺寸的点缀。
 * 眼睛自带两段 SVG 原生动画（SMIL，无 JS/无 CSS 依赖）：
 *   ① 高光持续呼吸闪烁（一闪一闪）；② 每 4.6s 快速眨一次眼。
 * 以后换形象只改这一个文件，调用点保持 `<Mascot className="h-6 w-6" />`。
 */
export function Mascot({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 56"
      className={className}
      role="img"
      aria-label="小初"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 两只耳朵：外白内粉 */}
      <path d="M14 26 Q11 8 27 14 Z" fill="#FFFFFF" />
      <path d="M17.5 22.5 Q16 13 23.5 16.5 Z" fill="#FBCFE8" />
      <path d="M50 26 Q53 8 37 14 Z" fill="#FFFFFF" />
      <path d="M46.5 22.5 Q48 13 40.5 16.5 Z" fill="#FBCFE8" />

      {/* 头：白圆脸 + 下颌一道极淡的暖灰，撑出体积 */}
      <ellipse cx="32" cy="31" rx="16.5" ry="14.5" fill="#FFFFFF" />
      <ellipse cx="32" cy="38" rx="11" ry="6" fill="#EDEFF4" opacity="0.7" />

      {/* 眉毛：两道短弧，参考图里的手绘小眉（眼睛放大后上移避让） */}
      <path
        d="M19.5 23 Q25 20 30 23"
        stroke="#CBD5E1"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M34 23 Q39 20 44.5 23"
        stroke="#CBD5E1"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />

      {/* 眼睛：眼白 + 蓝虹膜 + 深瞳 + 高光（比旧版大一档）。
          每层都挂同一个眨眼节律：一个周期 4.6s，在 88%~96% 处 ry 快速压扁再弹回。
          SMIL 的 values/keyTimes 逐层写死，不依赖 CSS 与 JS。 */}
      <ellipse cx="25" cy="29.8" rx="6.2" ry="7" fill="#FFFFFF">
        <animate
          attributeName="ry"
          values="7;7;0.7;7;7"
          keyTimes="0;0.88;0.92;0.96;1"
          dur="4.6s"
          repeatCount="indefinite"
        />
      </ellipse>
      <ellipse cx="25" cy="30.3" rx="5.3" ry="6.1" fill="#60A5FA">
        <animate
          attributeName="ry"
          values="6.1;6.1;0.6;6.1;6.1"
          keyTimes="0;0.88;0.92;0.96;1"
          dur="4.6s"
          repeatCount="indefinite"
        />
      </ellipse>
      <ellipse cx="25" cy="30.8" rx="3.3" ry="4.3" fill="#1E293B">
        <animate
          attributeName="ry"
          values="4.3;4.3;0.4;4.3;4.3"
          keyTimes="0;0.88;0.92;0.96;1"
          dur="4.6s"
          repeatCount="indefinite"
        />
      </ellipse>
      {/* 主高光：呼吸闪烁（一闪一闪的主体） */}
      <circle cx="23.2" cy="27.6" r="1.5" fill="#FFFFFF">
        <animate
          attributeName="opacity"
          values="0.45;1;0.45"
          keyTimes="0;0.5;1"
          dur="1.6s"
          repeatCount="indefinite"
        />
      </circle>
      {/* 次级闪点：错开半拍，让两只眼的高光不完全同步 */}
      <circle cx="27.2" cy="33.2" r="0.8" fill="#FFFFFF">
        <animate
          attributeName="opacity"
          values="0;0.9;0"
          keyTimes="0;0.5;1"
          dur="2.4s"
          begin="0.8s"
          repeatCount="indefinite"
        />
      </circle>

      <ellipse cx="39" cy="29.8" rx="6.2" ry="7" fill="#FFFFFF">
        <animate
          attributeName="ry"
          values="7;7;0.7;7;7"
          keyTimes="0;0.88;0.92;0.96;1"
          dur="4.6s"
          repeatCount="indefinite"
        />
      </ellipse>
      <ellipse cx="39" cy="30.3" rx="5.3" ry="6.1" fill="#60A5FA">
        <animate
          attributeName="ry"
          values="6.1;6.1;0.6;6.1;6.1"
          keyTimes="0;0.88;0.92;0.96;1"
          dur="4.6s"
          repeatCount="indefinite"
        />
      </ellipse>
      <ellipse cx="39" cy="30.8" rx="3.3" ry="4.3" fill="#1E293B">
        <animate
          attributeName="ry"
          values="4.3;4.3;0.4;4.3;4.3"
          keyTimes="0;0.88;0.92;0.96;1"
          dur="4.6s"
          repeatCount="indefinite"
        />
      </ellipse>
      <circle cx="37.2" cy="27.6" r="1.5" fill="#FFFFFF">
        <animate
          attributeName="opacity"
          values="0.45;1;0.45"
          keyTimes="0;0.5;1"
          dur="1.6s"
          begin="0.4s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="41.2" cy="33.2" r="0.8" fill="#FFFFFF">
        <animate
          attributeName="opacity"
          values="0;0.9;0"
          keyTimes="0;0.5;1"
          dur="2.4s"
          begin="1.6s"
          repeatCount="indefinite"
        />
      </circle>

      {/* 粉鼻 + 腮红 */}
      <circle cx="32" cy="37.6" r="1.9" fill="#F472B6" />
      <circle cx="19.5" cy="35.5" r="3" fill="#FBCFE8" opacity="0.9" />
      <circle cx="44.5" cy="35.5" r="3" fill="#FBCFE8" opacity="0.9" />

      {/* 胡须：左右各两根 */}
      <path
        d="M13.5 31 L6.5 29.5 M13.5 34 L6.5 35.5 M50.5 31 L57.5 29.5 M50.5 34 L57.5 35.5"
        stroke="#CBD5E1"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
