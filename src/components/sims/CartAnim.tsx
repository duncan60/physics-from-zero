import type { CSSProperties } from 'react';
import { useReducedMotion } from '../useReducedMotion';

// SVG 的 viewBox 座標。購物車畫在左邊（x 約 6～82），往右開 TRAVEL 停下來。
const VIEW_W = 320;
const VIEW_H = 108;
const TRAVEL = 228;

/**
 * 滑桿題答對時的購物車：從左邊出發、越跑越快（等加速度，位置和時間平方成正比）往右開。
 * 減少動態效果時不播放動畫，直接畫在終點。顏色都在 styles.css 用 CSS 變數設定，淺色、深色模式都看得清楚。
 */
export function CartAnim(): React.JSX.Element {
  const reduced = useReducedMotion();
  const style = { '--lp-cart-travel': `${TRAVEL}px` } as CSSProperties;
  return (
    <svg
      className={reduced ? 'lp-cart-anim' : 'lp-cart-anim lp-cart-anim--play'}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      role="img"
      aria-label="購物車加速前進"
      style={style}
    >
      <line className="lp-cart-ground" x1="0" y1="99" x2={VIEW_W} y2="99" />
      <g className="lp-cart" transform={reduced ? `translate(${TRAVEL} 0)` : undefined}>
        <path className="lp-cart-frame" d="M6 26 H18 L30 70 L33 80 H76" />
        <path className="lp-cart-basket" d="M22 36 H82 L74 70 H30 Z" />
        <path className="lp-cart-rib" d="M42 36 L45 70 M62 36 L59 70 M26 53 H78" />
        <circle className="lp-cart-wheel" cx="38" cy="90" r="8" />
        <circle className="lp-cart-wheel" cx="70" cy="90" r="8" />
      </g>
    </svg>
  );
}
