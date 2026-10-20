import { useEffect, useId, useRef, useState } from 'react';
import { XP_PER_FIRST_TRY, XP_PER_LESSON } from '../lib/progress';
import type { Lesson, SimStep, Step } from '../lib/types';
import { BusBallSim } from '../sims/BusBallSim';
import { GuideRunner } from './GuideRunner';
import { QuestionCard } from './QuestionCard';
import { ConceptView } from './steps/ConceptView';
import { useActionGuard } from './useActionGuard';

interface Props {
  lesson: Lesson;
  /**
   * 完成畫面一出現就呼叫，整個上課過程只呼叫一次。不等學習者按「回到地圖」：
   * 看到完成畫面後直接按上一頁、用返回手勢或關掉分頁，這一課也已經算完成。
   */
  onComplete: (xpGained: number) => void;
  /** 中途離開（答過題目的話，要在確認時按「確定離開」），或在完成畫面按「回到地圖」。 */
  onExit: () => void;
}

/** 換步驟時把焦點移到新的步驟上，鍵盤和螢幕閱讀器使用者不會停在已經消失的按鈕上。 */
function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

// 新增一種模擬時，這裡少了 case 就會編譯失敗。
function renderSim(sim: SimStep['sim']): React.JSX.Element {
  switch (sim) {
    case 'bus-ball':
      return <BusBallSim />;
  }
}

function SimView(props: { step: SimStep; onContinue: () => void }): React.JSX.Element {
  const { step, onContinue } = props;
  const guard = useActionGuard();
  return (
    <section className="lp-sim">
      <p className="lp-sim-prompt">{step.prompt}</p>
      {renderSim(step.sim)}
      <div className="lp-actions">
        <button type="button" className="lp-button lp-button--primary" onClick={guard(onContinue)}>
          繼續
        </button>
      </div>
    </section>
  );
}

/**
 * 答過題目後按「離開」時，先問一次，避免誤觸就丟掉這一課做到一半的進度。
 * 不用瀏覽器的 confirm()：樣式和網站一致，手機上也不會跳出系統對話框。按 Esc 等於「繼續上課」。
 */
function ExitConfirm(props: { onStay: () => void; onLeave: () => void }): React.JSX.Element {
  const { onStay, onLeave } = props;
  const titleId = useId();
  const textId = useId();
  // 剛出現的這段時間內按到的不算：連點「離開」的第二下不會變成「確定離開」。
  const guard = useActionGuard();
  return (
    <section
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      className="lp-leave"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onStay();
      }}
    >
      <h2 id={titleId} className="lp-leave-title">
        要離開這一課嗎？
      </h2>
      <p id={textId} className="lp-leave-text">
        離開後，這一課要從頭開始。
      </p>
      <div className="lp-actions">
        {/* 預設焦點在比較安全的「繼續上課」 */}
        <button ref={focusOnMount} type="button" className="lp-button lp-button--primary" onClick={guard(onStay)}>
          繼續上課
        </button>
        <button type="button" className="lp-button lp-button--secondary" onClick={guard(onLeave)}>
          確定離開
        </button>
      </div>
    </section>
  );
}

/**
 * 一課的流程：一次一個步驟，上方是「離開」、課程名稱和進度條，最後是完成畫面。
 * XP：每一題第一次就答對（沒有用引導、沒有看解答）得 XP_PER_FIRST_TRY，完成一課再加 XP_PER_LESSON。
 */
export function LessonPlayer(props: Props): React.JSX.Element {
  // 換了一課就整個重新開始，不會把上一課的進度帶過來。
  return <LessonRun key={props.lesson.id} {...props} />;
}

function LessonRun({ lesson, onComplete, onExit }: Props): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [inGuide, setInGuide] = useState(false);
  // 每從引導回到原題一次就加一，讓原題用新的 key 重新掛載，重新作答。
  const [attempt, setAttempt] = useState(0);
  // 這一題用過引導，就不是第一次就答對。
  const [guided, setGuided] = useState(false);
  const [firstTryCount, setFirstTryCount] = useState(0);
  // 檢查過任何一題（不論對錯）之後，按「離開」要先確認；還沒作答就離開，沒有什麼會丟掉。
  const [answered, setAnswered] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const exitRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reported = useRef(false);
  // 完成畫面的「回到地圖」：最後一題連點「繼續」時，不會一路按出這一課（進度在完成畫面出現時就回報了）。
  const guard = useActionGuard(index);

  const total = lesson.steps.length;
  const step = lesson.steps[index] as Step | undefined;
  const xp = XP_PER_LESSON + firstTryCount * XP_PER_FIRST_TRY;
  const finished = step === undefined;

  // 完成畫面一出現就回報。reported 保證只回報一次：完成畫面重新渲染（App 每次都傳新的 onComplete）、
  // StrictMode 在開發模式多跑一次 effect，都不會再算一次。
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    onComplete(xp);
  }, [finished, xp, onComplete]);

  function advance(): void {
    setIndex((i) => i + 1);
    setInGuide(false);
    setAttempt(0);
    setGuided(false);
  }

  function finishQuestion(cleanFirstTry: boolean): void {
    if (cleanFirstTry && !guided) setFirstTryCount((n) => n + 1);
    advance();
  }

  function startGuide(): void {
    setGuided(true);
    setInGuide(true);
  }

  function finishGuide(): void {
    setInGuide(false);
    setAttempt((n) => n + 1);
  }

  // 確認中再按一次「離開」不會怎樣，連點兩下不會直接離開。
  function requestExit(): void {
    if (answered) setConfirmingExit(true);
    else onExit();
  }

  function stay(): void {
    setConfirmingExit(false);
    exitRef.current?.focus();
  }

  if (step === undefined) {
    return (
      <section className="lp-player" aria-label={lesson.title}>
        <div ref={focusOnMount} tabIndex={-1} className="lp-stage lp-complete">
          <h2 className="lp-complete-title">完成這一課</h2>
          <p className="lp-complete-xp">{`本課獲得 ${xp} XP`}</p>
          <div className="lp-actions">
            <button type="button" className="lp-button lp-button--primary" onClick={guard(onExit)}>
              回到地圖
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderStep(current: Step): React.JSX.Element {
    switch (current.kind) {
      case 'concept':
        return <ConceptView step={current} onContinue={advance} />;
      case 'sim':
        return <SimView step={current} onContinue={advance} />;
      case 'choice':
      case 'number':
      case 'table':
        if (inGuide) return <GuideRunner steps={current.guide ?? []} onDone={finishGuide} />;
        return (
          <QuestionCard step={current} onFinish={finishQuestion} onRequestGuide={startGuide} onCheck={() => setAnswered(true)} />
        );
    }
  }

  return (
    <section className="lp-player" aria-labelledby={titleId}>
      <div className="lp-topbar">
        <button ref={exitRef} type="button" className="lp-button lp-exit" onClick={requestExit}>
          離開
        </button>
        <div className="lp-topbar-main">
          <p id={titleId} className="lp-title">
            {lesson.title}
          </p>
          <div
            className="lp-progress"
            role="progressbar"
            aria-label="課程進度"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index}
          >
            <div className="lp-progress-fill" style={{ width: `${(index / total) * 100}%` }} />
          </div>
        </div>
      </div>
      {confirmingExit && <ExitConfirm onStay={stay} onLeave={onExit} />}
      {/* 確認離開時只是先藏起來，不卸載：按「繼續上課」回來，作答到一半的狀態都還在。 */}
      <div
        key={`${index}-${inGuide ? 'guide' : attempt}`}
        ref={focusOnMount}
        tabIndex={-1}
        className="lp-stage"
        hidden={confirmingExit}
      >
        {renderStep(step)}
      </div>
    </section>
  );
}
