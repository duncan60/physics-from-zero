import type { CSSProperties } from 'react';

/** 彩紙的片數。 */
const PIECES = 36;

interface Piece {
  /** 從畫面左邊算起的位置（%） */
  x: number;
  /** 開始掉之前等多久（ms） */
  delay: number;
  /** 掉到底要多久（ms） */
  duration: number;
  /** 一路往左右飄多遠（px） */
  drift: number;
  /** 一路轉幾度 */
  spin: number;
}

// 位置、時間都由編號算出來（不用亂數）：每次畫面都一樣，測試和截圖也穩定，看起來仍然是散開的。
const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => ({
  x: (i * 61 + 7) % 100,
  delay: (i * 137) % 900,
  duration: 1900 + ((i * 89) % 1100),
  drift: ((i * 47) % 121) - 60,
  spin: 360 + ((i * 113) % 540),
}));

/**
 * 完成一課拿到完美時撒的彩紙：只用 CSS 動畫，整片蓋住畫面但點得穿（pointer-events: none），
 * 動畫跑一次就停在看不見的狀態。純裝飾（aria-hidden）。
 * 呼叫端在「減少動態效果」時不要顯示它（CSS 也只在 prefers-reduced-motion: no-preference 時才有動畫）。
 */
export function Confetti(): React.JSX.Element {
  return (
    <div className="lp-confetti" aria-hidden="true">
      {pieces.map((piece, i) => {
        const style = {
          left: `${piece.x}%`,
          '--confetti-delay': `${piece.delay}ms`,
          '--confetti-duration': `${piece.duration}ms`,
          '--confetti-drift': `${piece.drift}px`,
          '--confetti-spin': `${piece.spin}deg`,
        } as CSSProperties;
        return <span key={i} className="lp-confetti-piece" style={style} />;
      })}
    </div>
  );
}
