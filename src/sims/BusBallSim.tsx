import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import {
  FLIGHT_TIME,
  ballPosition,
  busPosition,
  busSpeed,
  landingOffset,
  landingText,
} from './busBall';

// 以「乘客的視角」呈現：公車固定在畫面中，地面的標線往後捲動，
// 球的位置是相對於公車的 x（球的地面 x 減去公車的地面 x）。

// ---- 畫面幾何（SVG 的 viewBox 座標，1 公尺 = PX_PER_M） ----
const VIEW_W = 360;
const VIEW_H = 192;
const PX_PER_M = 38;
const FLOOR_Y = 140; // 公車地板
const PERSON_X = 60;
const HAND_X = 78;
const HAND_Y = FLOOR_Y - PX_PER_M; // 手離地板 1 公尺；球的高度 y 從這裡往上算
const BALL_R = 7;
const DASH_PERIOD = 60; // 地面標線：28 實線 + 32 空白
const TRAIL_STEP = 0.05; // 球的軌跡每 0.05 秒取一點

// ---- 時間 ----
const MAX_FRAME = 0.1; // 分頁在背景時 rAF 會暫停，回來後一格最多前進 0.1 秒，才不會跳過丟球的過程
const SLOW_SCALE = 0.25; // 「慢動作」開啟時，模擬時鐘走真實時間的 0.25 倍；只動時鐘，物理數字和結果都不變

// ---- 顏色：用 currentColor 或 CSS 變數（附預設值），淺色、深色模式都看得清楚 ----
const BALL_COLOR = 'var(--sim-ball, #ea580c)';
const PRIMARY_COLOR = 'var(--sim-primary, #2563eb)';
const DANGER_COLOR = 'var(--sim-danger, #dc2626)';

interface Run {
  t: number; // 模擬時鐘（秒）
  throwAt: number | null;
  brakeAt: number | null;
}

const START: Run = { t: 0, throwAt: null, brakeAt: null };

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// 「急煞車」不能按的時候（還沒丟球、球已經落地）顯示在按鈕下方的提示。
const BRAKE_HINT = '先按『丟球』，球在空中時再按『急煞車』';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  if (typeof query.addEventListener !== 'function') return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// 球在 time 這個時刻、相對於公車的位置（公尺）。
function ballRelative(time: number, throwAt: number, brakeAt: number | null): { x: number; y: number } {
  const ball = ballPosition(time, throwAt, brakeAt);
  return { x: ball.x - busPosition(time, brakeAt), y: ball.y };
}

function toSvg(point: { x: number; y: number }): { px: number; py: number } {
  return { px: HAND_X + point.x * PX_PER_M, py: HAND_Y - point.y * PX_PER_M };
}

function trailPoints(throwAt: number, brakeAt: number | null, t: number): string {
  const end = Math.min(t, throwAt + FLIGHT_TIME);
  const steps = Math.max(1, Math.ceil((end - throwAt) / TRAIL_STEP));
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const { px, py } = toSvg(ballRelative(throwAt + ((end - throwAt) * i) / steps, throwAt, brakeAt));
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return points.join(' ');
}

function buttonStyle(kind: 'primary' | 'danger' | 'plain', disabled: boolean): CSSProperties {
  const fill = kind === 'primary' ? PRIMARY_COLOR : kind === 'danger' ? DANGER_COLOR : null;
  return {
    flex: '1 1 96px',
    minHeight: 44,
    padding: '10px 16px',
    fontFamily: 'inherit',
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.25,
    borderRadius: 12,
    border: `2px solid ${fill ?? 'currentColor'}`,
    background: fill ?? 'transparent',
    color: fill ? '#ffffff' : 'inherit',
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    touchAction: 'manipulation',
  };
}

export function BusBallSim(): React.JSX.Element {
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const brakeHintId = useId();
  const reducedNoteId = useId();
  const [run, setRun] = useState<Run>(START);
  const [slow, setSlow] = useState(false);
  const { t, throwAt, brakeAt } = run;

  const resultText = throwAt !== null && t >= throwAt + FLIGHT_TIME ? landingText(landingOffset(throwAt, brakeAt)) : '';
  const landed = resultText !== '';

  // 動畫：時鐘從 0 開始，預設以真實時間（秒）前進，「慢動作」時走 0.25 倍；球落地就停。
  // 時鐘 t 存在 state 裡，所以飛行途中切換慢動作只是換一個走時速度，不會動到其他狀態。
  useEffect(() => {
    if (reduced || landed) return;
    const scale = slow ? SLOW_SCALE : 1;
    let frame = 0;
    let last: number | null = null;
    const step = (now: number): void => {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME) * scale;
      last = now;
      setRun((r) => {
        const limit = r.throwAt === null ? Infinity : r.throwAt + FLIGHT_TIME;
        return { ...r, t: Math.min(r.t + dt, limit) };
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced, landed, slow]);

  // 動畫進行到一半時，使用者開啟「減少動態效果」：直接跳到結果。
  useEffect(() => {
    if (!reduced) return;
    setRun((r) => (r.throwAt !== null && r.t < r.throwAt + FLIGHT_TIME ? { ...r, t: r.throwAt + FLIGHT_TIME } : r));
  }, [reduced]);

  const throwBall = (): void =>
    setRun((r) => {
      if (r.throwAt !== null) return r;
      // 減少動態效果：不播放飛行過程，直接跳到球落地。
      return reduced ? { ...r, throwAt: r.t, t: r.t + FLIGHT_TIME } : { ...r, throwAt: r.t };
    });

  // 「急煞車」只在球丟出、還在空中時有用：還沒丟球、已經煞過車都不理。
  const brake = (): void =>
    setRun((r) => {
      if (r.brakeAt !== null || r.throwAt === null) return r;
      if (r.t >= r.throwAt + FLIGHT_TIME) {
        // 球已經落地。有動畫時煞車已經沒有意義；減少動態效果時沒有「空中」可以按，
        // 就當作球飛到一半時才煞車，讓學習者仍然能做「球在空中煞車」的實驗。
        return reduced ? { ...r, brakeAt: r.throwAt + FLIGHT_TIME / 2 } : r;
      }
      return { ...r, brakeAt: r.t };
    });

  const reset = (): void => setRun(START);

  // ---- 這一格要畫的東西 ----
  const busX = busPosition(t, brakeAt);
  const speed = busSpeed(t, brakeAt);
  const ball = toSvg(throwAt === null ? { x: 0, y: 0 } : ballRelative(t, throwAt, brakeAt));
  const showLandingMark = landed && ball.px - HAND_X > 1;
  const braking = brakeAt !== null && t > brakeAt;
  const throwDisabled = throwAt !== null;
  // 有動畫：球在空中才能煞車。減少動態效果：沒有「空中」，丟球之後就能按（當作球飛到一半時煞車）。
  const brakeDisabled = brakeAt !== null || throwAt === null || (landed && !reduced);
  // 還沒煞過車、又不能按的時候，告訴學習者什麼時候按。減少動態效果時，上面那段說明已經講了「丟球之後再按」。
  const showBrakeHint = !reduced && brakeDisabled && brakeAt === null;
  const speedText = `公車速度：${speed.toFixed(1)} 公尺/秒${braking ? (speed > 0 ? '（煞車中）' : '（已停住）') : ''}${slow ? '，慢動作中' : ''}`;

  return (
    <div role="group" aria-label="公車與球的模擬" style={{ width: '100%', maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        role="img"
        aria-label="公車內部的側面圖。你站在公車上，手裡拿著一顆球，公車往右前進。"
        style={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto' }}
      >
        <text x={VIEW_W - 12} y={16} textAnchor="end" fontSize="12" fill="currentColor">
          前進方向 →
        </text>

        {/* 地面：標線隨公車位置往後捲動 */}
        <line x1="0" y1="172" x2={VIEW_W} y2="172" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
        <line
          x1="0"
          y1="184"
          x2={VIEW_W}
          y2="184"
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="4"
          strokeDasharray="28 32"
          strokeDashoffset={(busX * PX_PER_M) % DASH_PERIOD}
        />

        {/* 公車：車廂、地板、車輪 */}
        <circle cx="70" cy="156" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="290" cy="156" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <rect x="8" y="24" width="344" height="124" rx="14" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="2.5" />
        <line x1="8" y1={FLOOR_Y} x2="352" y2={FLOOR_Y} stroke="currentColor" strokeWidth="2" />

        {/* 手的正上方：用虛線標出來，方便和球的位置比較 */}
        <line x1={HAND_X} y1="40" x2={HAND_X} y2={FLOOR_Y} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" />

        {/* 你 */}
        <text x={PERSON_X} y={FLOOR_Y - 70} textAnchor="middle" fontSize="12" fill="currentColor">
          你
        </text>
        <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx={PERSON_X} cy={FLOOR_Y - 58} r="7" />
          <line x1={PERSON_X} y1={FLOOR_Y - 51} x2={PERSON_X} y2={FLOOR_Y - 28} />
          <line x1={PERSON_X} y1={FLOOR_Y - 28} x2={PERSON_X - 8} y2={FLOOR_Y} />
          <line x1={PERSON_X} y1={FLOOR_Y - 28} x2={PERSON_X + 8} y2={FLOOR_Y} />
          <line x1={PERSON_X} y1={FLOOR_Y - 46} x2={HAND_X} y2={HAND_Y} />
        </g>

        {/* 球的軌跡（以公車為準） */}
        {throwAt !== null && (
          <polyline
            points={trailPoints(throwAt, brakeAt, t)}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.6"
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* 落點：地板上標出手和球之間的距離 */}
        {showLandingMark && (
          <g>
            <line x1={ball.px} y1={ball.py} x2={ball.px} y2={FLOOR_Y} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" />
            <line x1={HAND_X} y1={FLOOR_Y - 3} x2={ball.px} y2={FLOOR_Y - 3} strokeWidth="4" strokeLinecap="round" style={{ stroke: BALL_COLOR }} />
          </g>
        )}

        <circle cx={ball.px} cy={ball.py} r={BALL_R} style={{ fill: BALL_COLOR }} />
      </svg>

      {reduced ? (
        <p id={reducedNoteId} style={{ margin: '8px 0 0', fontSize: 14 }}>
          你開啟了「減少動態效果」，所以不播放動畫，直接顯示結果。丟球之後再按「急煞車」，會當作球飛到一半時煞車。
        </p>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: 14 }}>{speedText}</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={throwBall} disabled={throwDisabled} style={buttonStyle('primary', throwDisabled)}>
          丟球
        </button>
        {/* 不能按時用 aria-disabled 而不是 disabled：按鈕還拿得到焦點（在空中用鍵盤按下去，焦點不會掉），
            螢幕閱讀器也念得到為什麼不能按。按了沒反應由 brake() 擋。 */}
        <button
          type="button"
          onClick={brake}
          aria-disabled={brakeDisabled ? true : undefined}
          aria-describedby={brakeDisabled ? (reduced ? reducedNoteId : showBrakeHint ? brakeHintId : undefined) : undefined}
          style={buttonStyle('danger', brakeDisabled)}
        >
          急煞車
        </button>
        <button type="button" onClick={reset} style={buttonStyle('plain', false)}>
          重來
        </button>
      </div>

      {/* 一直佔著位置、只切換看不看得到：球在空中時提示收起來，下面的「慢動作」開關不會跟著跳動。 */}
      {!reduced && (
        <p id={brakeHintId} style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 600, visibility: showBrakeHint ? 'visible' : 'hidden' }}>
          {BRAKE_HINT}
        </p>
      )}

      {!reduced && (
        <>
          <p style={{ margin: '12px 0 0', fontSize: 14 }}>
            球只在空中停留 1 秒，要在球飛的時候按「<span style={{ whiteSpace: 'nowrap' }}>急煞車</span>」；越早按，球落得越前面。
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 16, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={slow}
              onChange={(event) => setSlow(event.target.checked)}
              style={{ width: 22, height: 22, margin: 0, accentColor: PRIMARY_COLOR }}
            />
            慢動作
          </label>
        </>
      )}

      <p role="status" aria-live="polite" style={{ margin: '12px 0 0', minHeight: '1.5em', fontSize: 18, fontWeight: 700, textAlign: 'center' }}>
        {resultText}
      </p>
    </div>
  );
}
