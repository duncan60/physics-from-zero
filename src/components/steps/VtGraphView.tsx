import { formatNumber } from '../../lib/answer';
import type { VtGraph } from '../../lib/types';

// SVG 的 viewBox 座標。寬 320：360px 的手機上卡片大約 328px 寬，字的大小和畫面上的字差不多。
// 左邊留給速度的數字，上面寫「速度（公尺/秒）」，下面是時間的數字和「時間（秒）」。
const VIEW_W = 320;
const FONT = 14; // 圖上的字（數字、座標軸、線的標籤），viewBox 的單位
const PAD_LEFT = 38; // 速度的數字（最多三位數）寫在這裡
const PAD_TOP = 34; // 上面一行寫「速度（公尺/秒）」
const PAD_RIGHT = 16; // 最右邊那一格的時間數字有一半在圖外
const PLOT_H = 150; // 圖的高度；速度的格子很多時會變高，每一格至少 MIN_V_GAP，最高 MAX_PLOT_H
const MIN_V_GAP = 20;
const MAX_PLOT_H = 220;
const PAD_BOTTOM = 46; // 時間的數字一行、「時間（秒）」一行
const TICK = 5; // 座標軸上刻度線的長度
const LABEL_GAP = 6; // 線的標籤和最後一個點之間的距離
const MAX_RIGHT = 120; // 右邊最多留這麼寬：標籤再長，圖也不會被擠得太窄
const MAX_TICKS = 50; // 格子數的上限（內容檢查保證數值合理；這裡只是不讓畫面卡住）
const COLORS = 3; // 線的顏色輪流用 lp-vt-c0、c1、c2（styles.css）

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 0.2 × 3 = 0.6000000000000001 這類浮點誤差，刻度上的數字不要出現。 */
function tidy(value: number): number {
  return Number(value.toFixed(9));
}

/** 文字大概多寬（viewBox 的單位）：中文字和全形符號一個字寬，數字和英文大約 0.6 個字寬。 */
function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += (ch.codePointAt(0) ?? 0) > 0x2e7f ? FONT : FONT * 0.6;
  return width;
}

/** 0、1、2…… 到 max 為止（count 是最後一格的編號）。 */
function range(count: number): number[] {
  return Array.from({ length: Math.max(0, Math.min(count, MAX_TICKS)) + 1 }, (_, i) => i);
}

/**
 * 右邊要留多寬：線的標籤寫在最後一個點的右邊，最後一個點靠近右邊時，要多留一點位置給標籤，標籤才不會超出圖。
 * 終點右邊還有 f（佔整個時間軸的比例）的空間時，要滿足 f × (W0 − right) + right ≥ 標籤寬。
 */
function rightPadding(graph: VtGraph): number {
  const w0 = VIEW_W - PAD_LEFT;
  let right = PAD_RIGHT;
  for (const line of graph.lines) {
    const last = line.points[line.points.length - 1] as [number, number] | undefined;
    if (line.label === undefined || last === undefined || !(graph.tMax > 0)) continue;
    const f = Math.min(1, Math.max(0, (graph.tMax - last[0]) / graph.tMax));
    const need = LABEL_GAP + textWidth(line.label) + 2;
    if (f < 1) right = Math.max(right, (need - f * w0) / (1 - f));
  }
  return Math.min(right, MAX_RIGHT);
}

/**
 * 速度–時間圖（觀念卡、選擇題、數字題、表格題的 graph）：橫的是時間（每 1 秒一格），直的是速度（每 vStep 一格），每一格都標數字，
 * 底下有淺色的格線。每條線是一條折線，每個點畫一個圓點，有標籤時寫在最後一個點的右上方；
 * shadeBelow 把線底下到時間軸的面積塗色；box 畫一個從 (0, 0) 到 (t, v) 的虛線長方形。
 * 寬度跟著卡片（最寬 400px，styles.css），不會出現水平捲軸；顏色都在 styles.css 用 CSS 變數設定，淺色、深色模式都看得清楚。沒有動畫。
 * 整張圖是 role="img"，螢幕閱讀器念 caption；caption 不顯示在畫面上。
 */
export function VtGraphView(props: { graph: VtGraph }): React.JSX.Element {
  const { graph } = props;
  const { tMax, vMax, vStep } = graph;
  const seconds = range(Math.floor(tMax + 1e-9));
  const speeds = vStep > 0 ? range(Math.floor(vMax / vStep + 1e-9)).map((k) => tidy(k * vStep)) : [0];
  const plotRight = VIEW_W - rightPadding(graph);
  const plotW = plotRight - PAD_LEFT;
  const plotH = Math.min(MAX_PLOT_H, Math.max(PLOT_H, (speeds.length - 1) * MIN_V_GAP));
  const plotBottom = PAD_TOP + plotH;
  const viewH = plotBottom + PAD_BOTTOM;
  const x = (t: number): number => round2(PAD_LEFT + (t / tMax) * plotW);
  const y = (v: number): number => round2(plotBottom - (v / vMax) * plotH);
  const left = x(0);
  const bottom = y(0);
  const at = ([t, v]: [number, number]): string => `${x(t)},${y(v)}`;


  return (
    <svg className="lp-vt" viewBox={`0 0 ${VIEW_W} ${viewH}`} width="100%" role="img" aria-label={graph.caption}>
      {/* 淺色的格線：每 1 秒、每 vStep 一條（0 的那條是座標軸） */}
      <g className="lp-vt-grid">
        {seconds.slice(1).map((t) => (
          <line key={`t${t}`} x1={x(t)} y1={PAD_TOP} x2={x(t)} y2={bottom} />
        ))}
        {speeds.slice(1).map((v) => (
          <line key={`v${v}`} x1={left} y1={y(v)} x2={plotRight} y2={y(v)} />
        ))}
      </g>

      {/* 線底下到時間軸的面積：先畫，才不會蓋住線和點 */}
      {graph.lines.map((line, i) => {
        if (line.shadeBelow !== true || line.points.length < 2) return null;
        const first = line.points[0];
        const last = line.points[line.points.length - 1];
        const points = [...line.points.map(at), `${x(last[0])},${bottom}`, `${x(first[0])},${bottom}`].join(' ');
        return <polygon key={i} className={`lp-vt-shade lp-vt-c${i % COLORS}`} data-line={i} points={points} />;
      })}

      {graph.box !== undefined && (
        <rect
          className="lp-vt-box"
          x={left}
          y={y(graph.box.v)}
          width={round2(x(graph.box.t) - left)}
          height={round2(bottom - y(graph.box.v))}
          strokeDasharray="6 5"
        />
      )}

      {/* 座標軸、刻度和數字 */}
      <path className="lp-vt-axis" d={`M${left} ${PAD_TOP} V${bottom} H${plotRight}`} />
      <g className="lp-vt-ticks">
        {seconds.map((t) => (
          <line key={`t${t}`} x1={x(t)} y1={bottom} x2={x(t)} y2={bottom + TICK} />
        ))}
        {speeds.map((v) => (
          <line key={`v${v}`} x1={left - TICK} y1={y(v)} x2={left} y2={y(v)} />
        ))}
      </g>
      {seconds.map((t) => (
        <text key={`t${t}`} className="lp-vt-tick lp-vt-tick--t" x={x(t)} y={bottom + 20} textAnchor="middle">
          {formatNumber(t)}
        </text>
      ))}
      {speeds.map((v) => (
        <text key={`v${v}`} className="lp-vt-tick lp-vt-tick--v" x={left - TICK - 3} y={y(v) + 5} textAnchor="end">
          {formatNumber(v)}
        </text>
      ))}
      <text className="lp-vt-axis-label" x={4} y={16}>
        速度（公尺/秒）
      </text>
      <text className="lp-vt-axis-label" x={round2(left + plotW / 2)} y={bottom + 40} textAnchor="middle">
        時間（秒）
      </text>

      {/* 每條線：折線、每個點一個圓點、最後一個點右上方的短標籤 */}
      {graph.lines.map((line, i) => {
        const last = line.points[line.points.length - 1] as [number, number] | undefined;
        return (
          <g key={i} className={`lp-vt-line lp-vt-c${i % COLORS}`}>
            <polyline points={line.points.map(at).join(' ')} />
            {line.points.map(([t, v], j) => (
              <circle key={j} cx={x(t)} cy={y(v)} r="4.5" />
            ))}
            {line.label !== undefined && last !== undefined && (
              <text className="lp-vt-label" x={round2(x(last[0]) + LABEL_GAP)} y={round2(y(last[1]) - LABEL_GAP)}>
                {line.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
