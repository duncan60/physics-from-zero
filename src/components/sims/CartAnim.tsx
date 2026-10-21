import type { CSSProperties } from 'react';
import { cartAccelerationText } from '../../lib/slider';
import { useReducedMotion } from '../useReducedMotion';

// SVG 的 viewBox 座標。左邊留給力的箭頭，購物車從 CART_X 出發往右開；最大推力時開 TRAVEL_MAX，剛好停在右邊界內。
const VIEW_W = 360;
const VIEW_H = 110;
const CART_X = 96; // 購物車把手（最左端）的位置
const CART_W = 76;
const CART_DY = 6; // 購物車往下移，上面留一行寫標示
const HANDLE_Y = 26 + CART_DY; // 把手的高度：力的箭頭推在這裡
const LABEL_Y = 18;
const ARROW_MAX = 84; // 最大推力時箭頭的長度；箭頭尾端在 CART_X − 2 − 84 = 10，不會超出左邊
const HEAD_LENGTH = 12;
const HEAD_HALF = 8;
const SHAFT_HALF = 3;
const TRAVEL_MAX = VIEW_W - 4 - (CART_X + CART_W);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatValue(value: number): string {
  return value < 0 ? `−${-value}` : String(value);
}

/** 往右、尖端碰到把手的箭頭（一個多邊形）。很短時只剩一個縮小的三角形。 */
function arrowPoints(length: number): string {
  const tip = CART_X - 2;
  const tail = tip - length;
  const y = HANDLE_Y;
  if (length <= HEAD_LENGTH) {
    const half = (HEAD_HALF * length) / HEAD_LENGTH;
    return [`${tail},${y - half}`, `${tip},${y}`, `${tail},${y + half}`].join(' ');
  }
  const neck = tip - HEAD_LENGTH;
  return [
    `${tail},${y - SHAFT_HALF}`,
    `${neck},${y - SHAFT_HALF}`,
    `${neck},${y - HEAD_HALF}`,
    `${tip},${y}`,
    `${neck},${y + HEAD_HALF}`,
    `${neck},${y + SHAFT_HALF}`,
    `${tail},${y + SHAFT_HALF}`,
  ].join(' ');
}

/**
 * 滑桿題上方的購物車：一開始就畫出購物車（標示質量）和推它的力的箭頭，箭頭長度跟著滑桿的值（0 沒有箭頭，最大值最長）。
 * `moving`（按了「檢查」之後）：購物車連同箭頭用 a = F ÷ m 從左往右加速（等加速度，位置和時間平方成正比），
 * 答對、答錯都動，下方寫出算出來的加速度。動畫的時間固定，所以跑的距離和加速度成正比：力太小，車就開得不遠。
 * 減少動態效果時不播放動畫，直接畫在終點。顏色都在 styles.css 用 CSS 變數設定，淺色、深色模式都看得清楚。
 * 沒有給 `mass` 時照樣畫，只是不標示質量、不寫加速度。
 */
export function CartAnim(props: {
  mass?: number;
  force: number;
  max: number;
  quantity: string;
  unit: string;
  moving: boolean;
}): React.JSX.Element {
  const { mass, force, max, quantity, unit, moving } = props;
  const reduced = useReducedMotion();
  // 加速度 a = F ÷ m 和推力成正比；最大推力對應最長的箭頭、最遠的距離。
  const ratio = max > 0 ? Math.min(1, Math.max(0, force / max)) : 0;
  const arrow = round2(ARROW_MAX * ratio);
  const travel = round2(TRAVEL_MAX * ratio);
  const forceText = `${quantity} ${formatValue(force)} ${unit}`;
  const cartName = mass === undefined ? '購物車' : `質量 ${formatValue(mass)} 公斤的購物車`;
  const motion = moving ? (travel > 0 ? '，往前加速' : '，沒有動') : '';
  const play = moving && !reduced;
  const style = { '--lp-cart-travel': `${travel}px` } as CSSProperties;
  return (
    <div className="lp-cart-scene">
      <svg
        className={play ? 'lp-cart-anim lp-cart-anim--play' : 'lp-cart-anim'}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        role="img"
        aria-label={`${cartName}，${forceText}${motion}`}
        style={style}
      >
        <line className="lp-cart-ground" x1="0" y1={99 + CART_DY} x2={VIEW_W} y2={99 + CART_DY} />
        <g className="lp-cart" transform={moving && reduced ? `translate(${travel} 0)` : undefined}>
          {arrow > 0 && <polygon className="lp-cart-force" points={arrowPoints(arrow)} data-length={arrow} />}
          <text className="lp-cart-label lp-cart-label--force" x={CART_X - 2} y={LABEL_Y} textAnchor="end">
            {forceText}
          </text>
          {mass !== undefined && (
            <text className="lp-cart-label" x={CART_X + 46} y={LABEL_Y} textAnchor="middle">
              {`${formatValue(mass)} 公斤`}
            </text>
          )}
          <g transform={`translate(${CART_X - 6} ${CART_DY})`}>
            <path className="lp-cart-frame" d="M6 26 H18 L30 70 L33 80 H76" />
            <path className="lp-cart-basket" d="M22 36 H82 L74 70 H30 Z" />
            <path className="lp-cart-rib" d="M42 36 L45 70 M62 36 L59 70 M26 53 H78" />
            <circle className="lp-cart-wheel" cx="38" cy="90" r="8" />
            <circle className="lp-cart-wheel" cx="70" cy="90" r="8" />
          </g>
        </g>
      </svg>
      {/* 檢查之後寫出算出來的加速度；一直佔著一行，出現時下面的滑桿不會跳動。 */}
      {mass !== undefined && (
        <p className="lp-cart-accel" role="status">
          {moving ? cartAccelerationText(force, mass) : null}
        </p>
      )}
    </div>
  );
}
