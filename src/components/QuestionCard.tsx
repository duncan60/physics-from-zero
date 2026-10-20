import { useEffect, useId, useRef, useState } from 'react';
import { blankCells, checkChoice, checkNumber, checkTable, hasUnitAfterNumber } from '../lib/answer';
import type { CheckResult } from '../lib/answer';
import type { ChoiceStep, NumberStep, TableStep } from '../lib/types';
import { ChoiceInput } from './steps/ChoiceInput';
import { NumberInput, formatNumber } from './steps/NumberInput';
import { TableInput } from './steps/TableInput';
import { useActionGuard } from './useActionGuard';

// TODO(Task 4)：拼算式（formula）和滑桿（slider）的畫面還沒做，QuestionCard 暫時只收舊的三種題型；Task 4 改回 QuestionStep。
type QuestionStep = ChoiceStep | NumberStep | TableStep;

// answering：作答中；correct：答對了；wrong：還不對；revealed：看了解答。
type Phase = 'answering' | 'correct' | 'wrong' | 'revealed';

const NEED_NUMBER = '請先輸入數字';
const NUMBER_ONLY = '只要填數字，不用寫單位';
const NEED_CHOICE = '請先選一個答案';

/** 看解答時，「正確答案」下面那一行。表格題的答案直接填進格子裡，所以沒有這一行。 */
function solutionText(step: QuestionStep): string | null {
  switch (step.kind) {
    case 'choice':
      return step.options.find((option) => option.id === step.answer)?.label ?? null;
    case 'number':
      return step.unit === undefined ? formatNumber(step.answer) : `${formatNumber(step.answer)} ${step.unit}`;
    case 'table':
      return null;
  }
}

/**
 * 一道題目：作答 →「檢查」→ 答對、答錯或看解答。
 * `onFinish(cleanFirstTry)`：第一次檢查就答對、也沒有看解答時是 true。輸入無效不算一次作答。
 * 只有同時傳入 `onRequestGuide`、題目也有 `guide` 時，答錯才會出現「一步一步來」；否則是「再試一次」。
 * `onCheck()`：每次按「檢查」、答案有效（不論對錯）時呼叫。
 */
export function QuestionCard(props: {
  step: QuestionStep;
  onFinish: (cleanFirstTry: boolean) => void;
  onRequestGuide?: () => void;
  onCheck?: () => void;
}): React.JSX.Element {
  const { step, onFinish, onRequestGuide, onCheck } = props;
  const promptId = useId();
  const hintId = useId();
  const [phase, setPhase] = useState<Phase>('answering');
  const [hadWrong, setHadWrong] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [numberRaw, setNumberRaw] = useState('');
  const [tableRaws, setTableRaws] = useState<string[]>(() => (step.kind === 'table' ? blankCells(step).map(() => '') : []));
  const [cellMarks, setCellMarks] = useState<(boolean | null)[]>([]);
  const [retries, setRetries] = useState(0);
  const answerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  // 每換一個階段（剛出現、檢查後、再試一次），按鈕都先等一下才有反應，連點不會跳過回饋。
  const guard = useActionGuard(phase);

  const answering = phase === 'answering';
  const requestGuide = step.guide !== undefined && step.guide.length > 0 ? onRequestGuide : undefined;

  // 檢查之後，焦點移到主要按鈕（從輸入框按 Enter 檢查時，輸入框會被停用）。
  useEffect(() => {
    if (phase !== 'answering') primaryRef.current?.focus();
  }, [phase]);

  // 「再試一次」之後，焦點回到答案：答錯的第一格、選過的選項，或是輸入框。
  useEffect(() => {
    if (retries === 0) return;
    const root = answerRef.current;
    const target =
      root?.querySelector<HTMLInputElement>('input[aria-invalid="true"], input:checked') ?? root?.querySelector<HTMLInputElement>('input');
    target?.focus();
  }, [retries]);

  function check(): void {
    if (!answering) return;
    let result: CheckResult | 'invalid';
    if (step.kind === 'choice') {
      result = choice === null ? 'invalid' : checkChoice(step, choice);
    } else if (step.kind === 'number') {
      result = checkNumber(step, numberRaw);
    } else {
      const checked = checkTable(step, tableRaws);
      if (checked === 'invalid') {
        result = 'invalid';
      } else {
        result = checked.result;
        setCellMarks(checked.cellCorrect);
      }
    }
    if (result === 'invalid') {
      // 「10公尺」這種輸入：學習者打了數字，只是多打了單位，提示要說清楚是哪裡不對。
      const typedUnit =
        step.kind === 'number' ? hasUnitAfterNumber(numberRaw) : step.kind === 'table' && tableRaws.some((raw) => hasUnitAfterNumber(raw));
      setHint(step.kind === 'choice' ? NEED_CHOICE : typedUnit ? NUMBER_ONLY : NEED_NUMBER);
      return;
    }
    setHint(null);
    onCheck?.();
    if (result.correct) {
      setPhase('correct');
      return;
    }
    setHadWrong(true);
    setFeedback(result.feedback ?? null);
    setPhase('wrong');
  }

  function retry(): void {
    setPhase('answering');
    setFeedback(null);
    setRetries((n) => n + 1);
  }

  function editTable(index: number, raw: string): void {
    setTableRaws((raws) => raws.map((value, i) => (i === index ? raw : value)));
    setCellMarks((marks) => marks.map((mark, i) => (i === index ? null : mark))); // 改過的格子不再標示對錯
    setHint(null);
  }

  const describedBy = hint === null ? undefined : hintId;

  function renderAnswer(): React.JSX.Element {
    switch (step.kind) {
      case 'choice': {
        const revealed = phase === 'revealed';
        const correctId = revealed ? step.answer : phase === 'correct' ? choice : null;
        const wrongId = phase === 'wrong' || (revealed && choice !== step.answer) ? choice : null;
        return (
          <ChoiceInput
            options={step.options}
            selected={choice}
            onSelect={(id) => {
              setChoice(id);
              setHint(null);
            }}
            disabled={!answering}
            correctId={correctId}
            wrongId={wrongId}
            labelledBy={promptId}
            describedBy={describedBy}
          />
        );
      }
      case 'number':
        return (
          <NumberInput
            value={numberRaw}
            onChange={(raw) => {
              setNumberRaw(raw);
              setHint(null);
            }}
            onEnter={check}
            disabled={!answering}
            unit={step.unit}
            mark={phase === 'correct' ? 'correct' : phase === 'wrong' || phase === 'revealed' ? 'wrong' : null}
            invalid={hint !== null}
            labelledBy={promptId}
            describedBy={describedBy}
          />
        );
      case 'table':
        return (
          <TableInput
            step={step}
            values={tableRaws}
            onChange={editTable}
            onEnter={check}
            disabled={!answering}
            marks={cellMarks}
            revealed={phase === 'revealed'}
            labelledBy={promptId}
            describedBy={describedBy}
          />
        );
    }
  }

  let primary: { label: string; action: () => void };
  if (phase === 'answering') primary = { label: '檢查', action: check };
  else if (phase === 'correct') primary = { label: '繼續', action: () => onFinish(!hadWrong) };
  else if (phase === 'revealed') primary = { label: '繼續', action: () => onFinish(false) };
  else if (requestGuide) primary = { label: '一步一步來', action: requestGuide };
  else primary = { label: '再試一次', action: retry };

  const solution = solutionText(step);

  return (
    <section className={`lp-card lp-card--${step.kind} lp-card--${phase}`}>
      <p id={promptId} className="lp-prompt">
        {step.prompt}
      </p>
      <div ref={answerRef} className="lp-answer">
        {renderAnswer()}
      </div>
      <p id={hintId} className="lp-hint" role="status">
        {hint}
      </p>
      <div className={answering ? 'lp-feedback' : `lp-feedback lp-feedback--${phase}`} role="status">
        {phase === 'correct' && (
          <>
            <p className="lp-feedback-title">答對了</p>
            <p className="lp-explanation">{step.explanation}</p>
          </>
        )}
        {phase === 'wrong' && (
          <>
            <p className="lp-feedback-title">還不對</p>
            {feedback !== null && <p className="lp-feedback-text">{feedback}</p>}
          </>
        )}
        {phase === 'revealed' && (
          <>
            <p className="lp-feedback-title">正確答案</p>
            {solution !== null && <p className="lp-solution">{solution}</p>}
            <p className="lp-explanation">{step.explanation}</p>
          </>
        )}
      </div>
      <div className="lp-actions">
        {/* 同一顆按鈕依階段換文字，焦點留在原處，按 Enter 或空白鍵就能一路往下（每換一次階段先等 ACTION_GUARD_MS）。 */}
        <button ref={primaryRef} type="button" className="lp-button lp-button--primary" onClick={guard(() => primary.action())}>
          {primary.label}
        </button>
        {phase === 'wrong' && (
          <button type="button" className="lp-button lp-button--secondary" onClick={guard(() => setPhase('revealed'))}>
            看解答
          </button>
        )}
      </div>
    </section>
  );
}
