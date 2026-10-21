import { useEffect, useId, useRef, useState } from 'react';
import { COMBO_START, accuracy, emptyStats, formatDuration, isPerfect, lessonXp, recordQuestion } from '../lib/game';
import type { RunStats } from '../lib/game';
import { clearRun, loadRun, saveRun } from '../lib/runs';
import type { CheckOutcome, Lesson, SimStep, Step } from '../lib/types';
import { BusBallSim } from '../sims/BusBallSim';
import { Confetti } from './Confetti';
import { GuideRunner } from './GuideRunner';
import { MatchCard } from './MatchCard';
import { QuestionCard } from './QuestionCard';
import { ReportLink } from './ReportLink';
import { useSound } from './SoundContext';
import { ConceptView } from './steps/ConceptView';
import { useActionGuard } from './useActionGuard';
import { useReducedMotion } from './useReducedMotion';

/** 上完一課的成績：完成畫面出現時交給 `onComplete`。 */
export interface LessonResult {
  /** 這一課得到的 XP：基本 + 每題一次答對 + 連續答對加分 + 完美加分（lib/game 的 lessonXp） */
  xp: number;
  /** 所有題目都一次答對（觀念卡、動畫不算） */
  perfect: boolean;
  /** 正確率：一次答對的題數 ÷ 題目數，整數百分比 */
  accuracy: number;
  /** 從進入第一步到完成畫面出現，花了多久（毫秒） */
  durationMs: number;
}

interface Props {
  lesson: Lesson;
  /**
   * 完成畫面一出現就呼叫，整個上課過程只呼叫一次。不等學習者按「回到地圖」：
   * 看到完成畫面後直接按上一頁、用返回手勢或關掉分頁，這一課也已經算完成。
   */
  onComplete: (result: LessonResult) => void;
  /** 中途按「離開」（直接離開，不再確認：有 runStorage 時做到哪一步已經存起來了），或在完成畫面按「回到地圖」。 */
  onExit: () => void;
  /**
   * 有給的話，完成畫面多一個「看本站重點」（主要按鈕，排在「回到地圖」前面），按了呼叫這裡。
   * App 只在上完一站的最後一課、而且那一站有重點與複習時才給。
   */
  onShowStationSummary?: () => void;
  /**
   * 從第幾步開始（從 0 算起，預設 0）。本機預覽頁用來直接跳到某一步：前面的步驟不出現，進度條也從那裡算。
   * 超過最後一步就停在最後一步；負數、小數、NaN 當作 0。換了 startAt 就整個重新開始。
   */
  startAt?: number;
  /** 每一步下方要不要有「回報問題」連結，預設有。本機預覽頁不要（不該從 localhost 開 issue）。 */
  showReportLinks?: boolean;
  /** 上的是某一站的複習（review-站號），不是一課：完成畫面寫「完成複習」「本次複習獲得 N XP」。預設 false。 */
  isReview?: boolean;
  /** 量時間用的時鐘（毫秒），預設 performance.now()；測試換成假的時鐘來控制「花了多久」。 */
  now?: () => number;
  /**
   * 課內存檔放在哪裡（lib/runs；App 傳 getStorage()）。有給的話：每按「繼續」進到下一步就存一次
   * （一題第一次答錯時也存，回來重做這一題仍然不算一次答對）；打開時有這一課的存檔就從那一步接著做，
   * 上方顯示「從上次的第 N 步繼續」和「從頭開始」；上完時清掉。
   * 沒給（本機預覽）就完全不讀也不寫；null（儲存空間不能用）照常上課，只是不存。
   * 有存檔時從存檔那一步開始，不看 startAt（startAt 是預覽頁用的，預覽不給 runStorage）。
   */
  runStorage?: Storage | null;
}

/** LessonRun 另外需要的：要不要讀存檔（按過「從頭開始」之後不讀），和「從頭開始」時通知外層重新掛載。 */
interface RunProps extends Props {
  resume: boolean;
  onRestart: () => void;
}

function defaultNow(): number {
  return performance.now();
}

/** startAt 換成真正的第一步：整數、落在 0 到最後一步之間；看不懂的值從 0 開始。 */
function firstIndex(startAt: number | undefined, total: number): number {
  if (startAt === undefined || !Number.isInteger(startAt) || startAt < 0) return 0;
  return Math.min(startAt, Math.max(total - 1, 0));
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
        <button type="button" {...guard(onContinue, 'lp-button lp-button--primary')}>
          繼續
        </button>
      </div>
    </section>
  );
}

/**
 * 從存檔接著做時，上方的一行：「從上次的第 N 步繼續」和「從頭開始」（清掉存檔，從第 1 步、從 0 分重新開始）。
 * 從地圖點進來時「從頭開始」可能剛好在手指底下，剛出現的這段時間內按到的不算，連點不會把存檔清掉。
 */
function ResumeNotice(props: { step: number; onRestart: () => void }): React.JSX.Element {
  const guard = useActionGuard();
  return (
    <div className="lp-resume">
      <p className="lp-resume-text">{`從上次的第 ${props.step} 步繼續`}</p>
      <button type="button" {...guard(props.onRestart, 'lp-button lp-resume-restart')}>
        從頭開始
      </button>
    </div>
  );
}

/**
 * 完成畫面：成績，完美時加上「完美！」和彩紙（減少動態效果時不撒彩紙）。
 * 上完一站的最後一課（有 onShowStationSummary）時，「看本站重點」是主要按鈕：剛上完一站正是整理重點的時候；
 * 複習不是必要的，「回到地圖」一直都在。複習（isReview）的標題和 XP 那一行寫「複習」，不寫「這一課」「本課」。
 */
function CompleteView(props: {
  lesson: Lesson;
  result: LessonResult;
  isReview: boolean;
  onExit: () => void;
  onShowStationSummary?: () => void;
}): React.JSX.Element {
  const { lesson, result, isReview, onExit, onShowStationSummary } = props;
  const reducedMotion = useReducedMotion();
  // 最後一題連點「繼續」時，第二下不會直接按到「回到地圖」，一路按出這一課（進度在完成畫面出現時就回報了）。
  const guard = useActionGuard();
  return (
    <section className="lp-player" aria-label={lesson.title}>
      {result.perfect && !reducedMotion && <Confetti />}
      <div ref={focusOnMount} tabIndex={-1} className={result.perfect ? 'lp-stage lp-complete lp-complete--perfect' : 'lp-stage lp-complete'}>
        <h2 className="lp-complete-title">{isReview ? '完成複習' : '完成這一課'}</h2>
        {result.perfect && <p className="lp-perfect">完美！</p>}
        <p className="lp-complete-xp">{isReview ? `本次複習獲得 ${result.xp} XP` : `本課獲得 ${result.xp} XP`}</p>
        <ul className="lp-complete-stats">
          <li className="lp-complete-stat lp-complete-stat--accuracy">{`正確率 ${result.accuracy}%`}</li>
          <li className="lp-complete-stat lp-complete-stat--time">{`花了 ${formatDuration(result.durationMs)}`}</li>
        </ul>
        <div className="lp-actions">
          {onShowStationSummary !== undefined && (
            <button type="button" {...guard(onShowStationSummary, 'lp-button lp-button--primary')}>
              看本站重點
            </button>
          )}
          <button type="button" {...guard(onExit, onShowStationSummary === undefined ? 'lp-button lp-button--primary' : 'lp-button')}>
            回到地圖
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * 一課的流程：一次一個步驟，上方是「離開」、課程名稱和進度條（連續答對 COMBO_START 題起，旁邊顯示「連續答對 N 題！」），
 * 最後是完成畫面。每一題結束時用 lib/game 的 recordQuestion 記錄是不是一次答對（沒有答錯過、沒有用引導、沒有看解答）；
 * 觀念卡和動畫不算題目。XP、完美、正確率都由這份統計算出來。
 * 引導：第一次答錯時主要按鈕是「一步一步來」；同一題的引導走完一次之後再答錯，改成「再試一次」，旁邊有「再看一次引導」和「看解答」。
 * 課內存檔（有 runStorage 時）：見 Props 的 runStorage。「離開」不再確認，直接離開。
 * 音效（有 SoundProvider 而且開著時）：答對 correct、答錯 wrong、完成畫面出現 complete，都在使用者按下按鈕的當下播放。
 */
export function LessonPlayer(props: Props): React.JSX.Element {
  // 換了一課（或換了從哪一步開始）就整個重新開始，不會把上一課的進度帶過來。
  const runKey = `${props.lesson.id}:${props.startAt ?? 0}`;
  // 在這一課按「從頭開始」的次數：每按一次就用新的 key 重新掛載，所有狀態（步驟、統計、時間）都從頭來，也不再讀存檔
  // （就算清不掉存檔也一樣）。記著是哪一課按的：同一個上課畫面換了一課（例如用上一頁直接回到另一課），那一課照樣讀它的存檔。
  const [restarts, setRestarts] = useState({ runKey, count: 0 });
  const count = restarts.runKey === runKey ? restarts.count : 0;
  return (
    <LessonRun
      key={`${runKey}:${count}`}
      {...props}
      resume={count === 0}
      onRestart={() => setRestarts({ runKey, count: count + 1 })}
    />
  );
}

function LessonRun({
  lesson,
  onComplete,
  onExit,
  onShowStationSummary,
  startAt,
  showReportLinks = true,
  isReview = false,
  now = defaultNow,
  runStorage,
  resume,
  onRestart,
}: RunProps): React.JSX.Element {
  const total = lesson.steps.length;
  // 這一課的存檔（沒給 runStorage 就不讀）。壞掉、版本不符、課程改過都是 null，從頭開始。
  const [saved] = useState(() => (resume && runStorage !== undefined ? loadRun(runStorage, lesson.id, total) : null));
  const [index, setIndex] = useState(() => saved?.nextStep ?? firstIndex(startAt, total));
  const [inGuide, setInGuide] = useState(false);
  // 每從引導回到原題一次就加一，讓原題用新的 key 重新掛載，重新作答。
  const [attempt, setAttempt] = useState(0);
  // 拼算式在第 2 步答錯、按了「一步一步來」：已經拼對的算式（tiles 的索引）。回到原題時放回答案列，直接從第 2 步接著作答；
  // 算式本身拼錯時是 null，回來重拼。換下一步時清掉。
  const [builtFormula, setBuiltFormula] = useState<number[] | null>(null);
  // 這一題答錯過（之後才會有引導、看解答），就不是一次答對；連續答對在畫面上也馬上中斷，不等這一題結束。
  // 從存檔接著做時，存檔那一題離開前答錯過的話也算（stepMissed）。
  const [missed, setMissed] = useState(() => saved?.stepMissed ?? false);
  // 這一題的引導已經走完過一次：之後再答錯，主要按鈕是「再試一次」，不再整套重來（還是可以按「再看一次引導」）。換下一步時清掉。
  const [guideDone, setGuideDone] = useState(false);
  // 只算題目的作答統計，每一題結束時更新；從存檔接著做時從存檔的統計接著算。
  const [stats, setStats] = useState<RunStats>(() => saved?.stats ?? emptyStats());
  // 剛答對：題目區小彈跳（動畫在 CSS，減少動態效果時不動）。換步驟時清掉。
  const [bounce, setBounce] = useState(false);
  // 從存檔接著做時，上方「從上次的第 N 步繼續」的那一步（從 0 算起）；進到下一步就收起來。
  const [resumedAt, setResumedAt] = useState<number | null>(() => saved?.nextStep ?? null);
  // 進入第一步的時間；完成畫面出現的時間（按下最後一個「繼續」的當下）。
  // 從存檔接著做時，往前推存檔時已經花掉的時間：離開的那段時間不算，重新整理後時鐘從 0 開始也沒關係。
  const [startedAt] = useState(() => now() - (saved?.elapsedMs ?? 0));
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const titleId = useId();
  const reported = useRef(false);
  const play = useSound();

  const step = lesson.steps[index] as Step | undefined;
  const finished = step === undefined;
  const xp = lessonXp(stats);
  const perfect = isPerfect(stats);
  const percent = accuracy(stats);
  // 一打開就是完成畫面（沒有步驟）時是 0。
  const durationMs = endedAt === null ? 0 : Math.max(0, endedAt - startedAt);
  const combo = missed ? 0 : stats.combo;
  const showCombo = combo >= COMBO_START;

  // 完成畫面一出現就回報。reported 保證只回報一次：完成畫面重新渲染（App 每次都傳新的 onComplete）、
  // StrictMode 在開發模式多跑一次 effect，都不會再算一次。
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    onComplete({ xp, perfect, accuracy: percent, durationMs });
  }, [finished, xp, perfect, percent, durationMs, onComplete]);

  /** 存這一課目前的位置（沒給 runStorage 就不存）：回來時從 nextStep 開始，帶著到這裡為止的統計和花掉的時間。 */
  function save(nextStep: number, nextStats: RunStats, stepMissed: boolean): void {
    if (runStorage === undefined) return;
    const elapsedMs = Math.max(0, now() - startedAt);
    saveRun(runStorage, { lessonId: lesson.id, nextStep, stepCount: total, stepMissed, stats: nextStats, elapsedMs });
  }

  // nextStats：這一步結束後的統計（題目由 finishQuestion 算好傳進來；觀念卡、動畫不變）。
  function advance(nextStats: RunStats = stats): void {
    const next = index + 1;
    if (next >= total) {
      // 最後一步按「繼續」：記下時間，播完成的音效（在點擊的當下，瀏覽器才會讓網頁發出聲音）。上完了，存檔用不到了。
      setEndedAt(now());
      play('complete');
      if (runStorage !== undefined) clearRun(runStorage, lesson.id);
    } else {
      save(next, nextStats, false);
    }
    setIndex(next);
    setResumedAt(null);
    setInGuide(false);
    setAttempt(0);
    setBuiltFormula(null);
    setMissed(false);
    setGuideDone(false);
    setBounce(false);
  }

  function finishQuestion(cleanFirstTry: boolean): void {
    const clean = cleanFirstTry && !missed;
    // 用這次畫面的 stats 算好再存：存檔要和畫面上的統計一致（防連點保證兩次結束之間一定重新渲染過）。
    const nextStats = recordQuestion(stats, clean);
    setStats(nextStats);
    advance(nextStats);
  }

  // 每次「檢查」（配對是每配一次）的結果：播音效；答對了題目區彈一下；答錯了這一題就不是一次答對。
  // 這一題第一次答錯時存一次（位置還是這一題）：離開再回來，這一題重新作答也不算一次答對。
  function handleCheck(outcome: CheckOutcome): void {
    play(outcome === 'wrong' ? 'wrong' : 'correct');
    if (outcome === 'wrong') {
      if (!missed) save(index, stats, true);
      setMissed(true);
    }
    if (outcome === 'correct') setBounce(true);
  }

  // 引導裡的題目只播音效：不影響這一題的統計（已經答錯過了），也不讓題目區彈跳（回到原題時才不會一出現就彈）。
  function handleGuideCheck(outcome: CheckOutcome): void {
    play(outcome === 'wrong' ? 'wrong' : 'correct');
  }

  function startGuide(formula: number[] | null): void {
    setMissed(true); // 只有答錯才會有「一步一步來」，這裡再標一次比較保險
    setBuiltFormula(formula);
    setInGuide(true);
  }

  function finishGuide(): void {
    setInGuide(false);
    setGuideDone(true);
    setAttempt((n) => n + 1);
  }

  // 「從頭開始」：清掉存檔，外層用新的 key 重新掛載（回到第 1 步，統計和時間都從 0 開始，焦點移到第一步）。
  function restart(): void {
    if (runStorage !== undefined) clearRun(runStorage, lesson.id);
    onRestart();
  }

  if (step === undefined) {
    return (
      <CompleteView
        lesson={lesson}
        result={{ xp, perfect, accuracy: percent, durationMs }}
        isReview={isReview}
        onExit={onExit}
        onShowStationSummary={onShowStationSummary}
      />
    );
  }

  function renderStep(current: Step): React.JSX.Element {
    switch (current.kind) {
      case 'concept':
        return <ConceptView step={current} onContinue={advance} />;
      case 'sim':
        return <SimView step={current} onContinue={advance} />;
      case 'match':
        // 配對沒有引導、沒有看解答
        return <MatchCard step={current} onFinish={finishQuestion} onCheck={handleCheck} />;
      case 'choice':
      case 'number':
      case 'table':
      case 'formula':
      case 'slider':
        if (inGuide) {
          return (
            <GuideRunner
              steps={current.guide ?? []}
              onDone={finishGuide}
              onCheck={handleGuideCheck}
              report={showReportLinks ? { lessonId: lesson.id, lessonTitle: lesson.title } : undefined}
            />
          );
        }
        return (
          <QuestionCard
            step={current}
            onFinish={finishQuestion}
            onRequestGuide={startGuide}
            onCheck={handleCheck}
            builtFormula={builtFormula}
            guideCompleted={guideDone}
          />
        );
    }
  }

  return (
    <section className="lp-player" aria-labelledby={titleId}>
      <div className="lp-topbar">
        <button type="button" className="lp-button lp-exit" onClick={onExit}>
          離開
        </button>
        <div className="lp-topbar-main">
          <p id={titleId} className="lp-title">
            {lesson.title}
          </p>
          <div className="lp-progress-row">
            <div
              className={showCombo ? 'lp-progress lp-progress--combo' : 'lp-progress'}
              role="progressbar"
              aria-label="課程進度"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={index}
            >
              <div className="lp-progress-fill" style={{ width: `${(index / total) * 100}%` }} />
            </div>
            {/* 即時區域一直留在畫面上（空的時候不佔空間），連續答對的提示出現或改變時，螢幕閱讀器才念得出來。 */}
            <p className="lp-combo" role="status">
              {showCombo && (
                <span key={combo} className="lp-combo-text">
                  {`連續答對 ${combo} 題！`}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
      {resumedAt !== null && <ResumeNotice step={resumedAt + 1} onRestart={restart} />}
      <div key={`${index}-${inGuide ? 'guide' : attempt}`} ref={focusOnMount} tabIndex={-1} className={bounce ? 'lp-stage lp-bounce' : 'lp-stage'}>
        {renderStep(step)}
        {/* 每一步卡片的下方都有「回報問題」；引導裡的步驟由 GuideRunner 放它自己的（用引導步驟自己的 id）。 */}
        {!inGuide && showReportLinks && <ReportLink lessonId={lesson.id} lessonTitle={lesson.title} stepId={step.id} stepKind={step.kind} />}
      </div>
    </section>
  );
}
