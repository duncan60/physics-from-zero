import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import type { StationReview } from '../lib/types';
import { useReducedMotion } from './useReducedMotion';

interface Props {
  review: StationReview;
  /** 站名，例如「運動」；標題是「第 N 站重點：運動」。 */
  stationTitle: string;
  /** 「開始複習」：進入這一站的複習題。 */
  onStart: () => void;
  /** 「回到地圖」：不一定要做複習。 */
  onBack: () => void;
}

/** 往下的箭頭（「直接做複習題」用），純裝飾。 */
function ArrowDownIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M12 5v13M6 12.5l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 一個有標題的區塊；區塊用標題當名稱，螢幕閱讀器可以用「區域」一個一個跳。 */
function Part(props: { title: string; className: string; children: ReactNode }): React.JSX.Element {
  const titleId = useId();
  return (
    <section className={`summary-part ${props.className}`} aria-labelledby={titleId}>
      <h3 id={titleId} className="summary-part-title">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

/**
 * 一站的重點總結（#/review/站號）：重點、公式表、常見陷阱，最下面是「開始複習」和「回到地圖」。
 * 內容可能很長（第 1 站有 6 個重點、6 個公式、6 個陷阱），所以每一項都是緊湊的一列、文字可以換行，360px 寬也不會有水平捲軸。
 * 常見陷阱的「錯的想法」和「正確的想法」除了顏色，還用文字標籤和不同的圖示（叉、勾）區分。
 * 已經記得重點的人不用一路滑到底：最上面的「直接做複習題」把焦點移到「開始複習」並捲過去（減少動態效果時直接跳過去）。
 * 它不叫「開始複習」，按了也不會直接開始，所以頁面上不會有兩個同名、做的事卻不一樣的按鈕。
 */
export function StationSummary({ review, stationTitle, onStart, onBack }: Props): React.JSX.Element {
  const titleId = useId();
  const startRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();

  function jumpToStart(): void {
    const start = startRef.current;
    if (start === null) return;
    // 先移焦點（不讓瀏覽器自己跳），再捲：這樣才捲得平滑，按鈕也停在畫面中間，不會貼著最下緣。
    // 減少動態效果時用 'auto'：網站沒有設定平滑捲動（styles.css 在這時也強制 scroll-behavior: auto），所以是直接跳過去；
    // 不用 'instant'，比較舊的瀏覽器不認得這個值會拋錯。
    start.focus({ preventScroll: true });
    start.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  return (
    <section className="summary" aria-labelledby={titleId}>
      <h2 id={titleId} className="summary-title">{`第 ${review.stationId} 站重點：${stationTitle}`}</h2>
      <p className="summary-lead">{`看完這一站的重點、公式和常見陷阱，再做 ${review.steps.length} 題複習。`}</p>
      <button type="button" className="summary-skip" onClick={jumpToStart}>
        <ArrowDownIcon />
        直接做複習題
      </button>

      <Part title="重點" className="summary-points">
        {/* 內容固定不變，用位置當 key 就好 */}
        <ol className="summary-list">
          {review.points.map((point, index) => (
            <li key={index} className="summary-point">
              {point}
            </li>
          ))}
        </ol>
      </Part>

      <Part title="公式" className="summary-formulas">
        <dl className="summary-list">
          {review.formulas.map((row, index) => (
            <div key={index} className="summary-formula">
              <dt className="summary-formula-name">{row.name}</dt>
              <dd className="summary-formula-text">{row.formula}</dd>
            </div>
          ))}
        </dl>
      </Part>

      <Part title="常見陷阱" className="summary-traps">
        <ul className="summary-list">
          {review.traps.map((trap, index) => (
            <li key={index} className="summary-trap">
              <div className="summary-trap-wrong">
                <p className="summary-trap-label">錯的想法</p>
                <p className="summary-trap-text">{trap.wrong}</p>
              </div>
              <div className="summary-trap-right">
                <p className="summary-trap-label">正確的想法</p>
                <p className="summary-trap-text">{trap.right}</p>
              </div>
            </li>
          ))}
        </ul>
      </Part>

      <div className="lp-actions summary-actions">
        <button ref={startRef} type="button" className="lp-button lp-button--primary" onClick={onStart}>
          開始複習
        </button>
        <button type="button" className="lp-button" onClick={onBack}>
          回到地圖
        </button>
      </div>
    </section>
  );
}
