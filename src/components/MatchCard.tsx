import { useEffect, useId, useRef, useState } from 'react';
import { isPair, shuffle } from '../lib/match';
import type { CheckOutcome, MatchStep } from '../lib/types';
import { useActionGuard } from './useActionGuard';

/** 配錯時兩塊標示錯誤的時間，之後恢復成沒選的樣子。 */
export const WRONG_FLASH_MS = 600;

type Side = 'left' | 'right';
interface Selection {
  side: Side;
  index: number;
}

// 高度寫在這裡（不放在 CSS），保證至少 44px 好按。
const ITEM_STYLE = { minHeight: 56 };

/**
 * 配對題：左右兩欄按鈕，右欄打亂順序（`random` 可以注入，測試才能控制；預設 Math.random）。
 * 先點一邊、再點另一邊：是一對 → 兩塊鎖定（aria-disabled、打勾）；不是 → 兩塊標示錯誤約 WRONG_FLASH_MS 後恢復，
 * 這一題就不算一次答對。全部配完 →「答對了」＋說明＋「繼續」。沒有「檢查」、引導和看解答（配對本身就是逐一嘗試）。
 * `onFinish(cleanFirstTry)`：沒有配錯過才是 true。
 * `onCheck(outcome)`：每配一次就呼叫：不是一對是 'wrong'，配對了一對但還沒配完是 'partial'，配完最後一對是 'correct'。
 */
export function MatchCard(props: {
  step: MatchStep;
  onFinish: (cleanFirstTry: boolean) => void;
  onCheck?: (outcome: CheckOutcome) => void;
  random?: () => number;
}): React.JSX.Element {
  const { step, onFinish, onCheck, random = Math.random } = props;
  const promptId = useId();
  // 右欄的順序只在剛出現時決定一次；存的是右邊的文字，配對時用 isPair 判斷。
  const [rights] = useState(() => shuffle(step.pairs.map((pair) => pair.right), random));
  const [selected, setSelected] = useState<Selection | null>(null);
  const [matchedLeft, setMatchedLeft] = useState<boolean[]>(() => step.pairs.map(() => false));
  const [matchedRight, setMatchedRight] = useState<boolean[]>(() => step.pairs.map(() => false));
  const [wrong, setWrong] = useState<{ left: number; right: number } | null>(null);
  const [hadWrong, setHadWrong] = useState(false);
  // 只給螢幕閱讀器的即時訊息：配對的結果（畫面上用顏色和圖示表示）。
  const [announcement, setAnnouncement] = useState('');
  const wrongTimer = useRef<number | undefined>(undefined);
  const continueRef = useRef<HTMLButtonElement>(null);
  const done = matchedLeft.every(Boolean);
  // 最後一塊連點兩下，第二下不會直接按到「繼續」。
  const guard = useActionGuard(done);

  useEffect(() => () => window.clearTimeout(wrongTimer.current), []);

  useEffect(() => {
    if (done) continueRef.current?.focus();
  }, [done]);

  function choose(side: Side, index: number): void {
    if (done || (side === 'left' ? matchedLeft : matchedRight)[index]) return;
    // 正在閃錯誤標示的兩塊不理會：連點的第二下不會打斷「閃一下後恢復未選狀態」，也不會把它選起來。
    if (wrong !== null && wrong[side] === index) return;
    // 錯誤標示還在時點了別塊：立刻恢復，照常處理這一下。
    window.clearTimeout(wrongTimer.current);
    setWrong(null);

    if (selected === null || selected.side === side) {
      const same = selected !== null && selected.index === index;
      setSelected(same ? null : { side, index });
      return;
    }

    const left = side === 'left' ? index : selected.index;
    const right = side === 'right' ? index : selected.index;
    const leftText = step.pairs[left].left;
    const rightText = rights[right];
    setSelected(null);
    if (isPair(step, leftText, rightText)) {
      const remaining = matchedLeft.filter((matched) => !matched).length;
      onCheck?.(remaining === 1 ? 'correct' : 'partial');
      setMatchedLeft((m) => m.map((v, i) => v || i === left));
      setMatchedRight((m) => m.map((v, i) => v || i === right));
      setAnnouncement(`${leftText}、${rightText}：配對成功`);
      return;
    }
    onCheck?.('wrong');
    setHadWrong(true);
    setWrong({ left, right });
    setAnnouncement(`${leftText}、${rightText}：不是一對`);
    wrongTimer.current = window.setTimeout(() => setWrong(null), WRONG_FLASH_MS);
  }

  function item(side: Side, index: number, text: string): React.JSX.Element {
    const matched = (side === 'left' ? matchedLeft : matchedRight)[index];
    const isSelected = selected !== null && selected.side === side && selected.index === index;
    const isWrong = wrong !== null && wrong[side] === index;
    const classes = ['lp-match-item'];
    if (isSelected) classes.push('lp-match-item--selected');
    if (matched) classes.push('lp-match-item--matched');
    if (isWrong) classes.push('lp-match-item--wrong');
    return (
      <button
        key={`${side}-${index}`}
        type="button"
        className={classes.join(' ')}
        aria-pressed={isSelected}
        aria-disabled={matched || undefined}
        onClick={() => choose(side, index)}
        style={ITEM_STYLE}
      >
        {text}
        {/* 配好的那一塊，畫面上是綠框和打勾；螢幕閱讀器念「（已配對）」 */}
        {matched && <span className="lp-sr-only">（已配對）</span>}
      </button>
    );
  }

  return (
    <section className={`lp-card lp-card--match ${done ? 'lp-card--correct' : 'lp-card--answering'}`}>
      <p id={promptId} className="lp-prompt">
        {step.prompt}
      </p>
      {/* 左欄先、右欄後（螢幕閱讀器的順序）；同一列的左右兩塊一樣高。 */}
      <div className="lp-match" role="group" aria-labelledby={promptId} style={{ gridTemplateRows: `repeat(${step.pairs.length}, auto)` }}>
        {step.pairs.map((pair, i) => item('left', i, pair.left))}
        {rights.map((text, i) => item('right', i, text))}
      </div>
      <p className="lp-sr-only" role="status">
        {announcement}
      </p>
      <div className={done ? 'lp-feedback lp-feedback--correct' : 'lp-feedback'} role="status">
        {done && (
          <>
            <p className="lp-feedback-title">答對了</p>
            <p className="lp-explanation">{step.explanation}</p>
          </>
        )}
      </div>
      {done && (
        <div className="lp-actions">
          <button ref={continueRef} type="button" {...guard(() => onFinish(!hadWrong), 'lp-button lp-button--primary')}>
            繼續
          </button>
        </div>
      )}
    </section>
  );
}
