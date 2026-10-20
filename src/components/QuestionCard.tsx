import { useEffect, useId, useRef, useState } from 'react';
import { blankCells, checkChoice, checkNumber, checkTable, hasUnitAfterNumber } from '../lib/answer';
import type { CheckResult } from '../lib/answer';
import { checkFormula } from '../lib/formula';
import { checkSlider } from '../lib/slider';
import type { CheckOutcome, QuestionStep } from '../lib/types';
import { CartAnim } from './sims/CartAnim';
import { ChoiceInput } from './steps/ChoiceInput';
import { FormulaInput } from './steps/FormulaInput';
import { NumberInput, formatNumber } from './steps/NumberInput';
import { SliderInput } from './steps/SliderInput';
import { TableInput } from './steps/TableInput';
import { useActionGuard } from './useActionGuard';

// answering：作答中；correct：答對了；wrong：還不對；revealed：看了解答。
type Phase = 'answering' | 'correct' | 'wrong' | 'revealed';

const NEED_NUMBER = '請先輸入數字';
const NUMBER_ONLY = '只要填數字，不用寫單位';
const NEED_CHOICE = '請先選一個答案';
const NEED_FORMULA = '請先拼出算式';

function withUnit(value: number, unit: string | undefined): string {
  return unit === undefined ? formatNumber(value) : `${formatNumber(value)} ${unit}`;
}

/**
 * 看解答時，「正確答案」下面的幾行。表格題的答案直接填進格子裡，所以沒有；
 * 拼算式同時顯示正確算式（第一個可接受的寫法，磚塊用空白隔開）和答案。
 */
function solutionLines(step: QuestionStep): string[] {
  switch (step.kind) {
    case 'choice': {
      const label = step.options.find((option) => option.id === step.answer)?.label;
      return label === undefined ? [] : [label];
    }
    case 'number':
      return [withUnit(step.answer, step.unit)];
    case 'table':
      return [];
    case 'formula':
      return [...(step.accepted.length > 0 ? [step.accepted[0].join(' ')] : []), withUnit(step.answer, step.unit)];
    case 'slider':
      return [withUnit(step.answer, step.unit)];
  }
}

/**
 * 一道題目：作答 →「檢查」→ 答對、答錯或看解答。
 * 拼算式分兩步：先拼算式（拼對了才出現第 2 步），再填算出來的數字；兩步都在「作答中」這個階段裡。
 * `onFinish(cleanFirstTry)`：第一次檢查就答對、也沒有看解答時是 true（拼算式要兩步都第一次就對）。輸入無效不算一次作答。
 * 只有同時傳入 `onRequestGuide`、題目也有 `guide` 時，答錯才會出現「一步一步來」；否則是「再試一次」。
 * `onCheck(outcome)`：每次按「檢查」、答案有效（不論對錯）時呼叫，告訴外面這次的結果：
 * 答對是 'correct'、答錯是 'wrong'；拼算式第 1 步拼對了（還要算答案）是 'partial'。
 */
export function QuestionCard(props: {
  step: QuestionStep;
  onFinish: (cleanFirstTry: boolean) => void;
  onRequestGuide?: () => void;
  onCheck?: (outcome: CheckOutcome) => void;
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
  // 拼算式：答案列上的磚塊（tiles 的索引，依序），以及算式是不是已經拼對、進到第 2 步。
  const [placed, setPlaced] = useState<number[]>([]);
  const [formulaDone, setFormulaDone] = useState(false);
  const [sliderValue, setSliderValue] = useState(() => (step.kind === 'slider' ? step.initial : 0));
  const [retries, setRetries] = useState(0);
  const answerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const stepTwoId = useId();
  // 每換一個階段（剛出現、檢查後、再試一次、算式拼對進到第 2 步），按鈕都先等一下才有反應，連點不會跳過回饋。
  const guard = useActionGuard(`${phase}:${formulaDone}`);

  const answering = phase === 'answering';
  const requestGuide = step.guide !== undefined && step.guide.length > 0 ? onRequestGuide : undefined;

  // 檢查之後，焦點移到主要按鈕（從輸入框按 Enter 檢查時，輸入框會被停用）。
  useEffect(() => {
    if (phase !== 'answering') primaryRef.current?.focus();
  }, [phase]);

  // 「再試一次」之後，焦點回到答案：答錯的第一格、選過的選項、輸入框（含滑桿），或是拼算式的答案列。
  useEffect(() => {
    if (retries === 0) return;
    const root = answerRef.current;
    const target =
      root?.querySelector<HTMLElement>('input[aria-invalid="true"], input:checked') ??
      root?.querySelector<HTMLElement>('input') ??
      root?.querySelector<HTMLElement>('.lp-formula-row');
    target?.focus();
  }, [retries]);

  // 算式拼對、出現第 2 步時，焦點移到數字輸入框。
  useEffect(() => {
    if (formulaDone) answerRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [formulaDone]);

  /** 這次「檢查」的結果；拼算式在第 1 步時看算式，第 2 步看數字。 */
  function evaluate(): CheckResult | 'invalid' {
    switch (step.kind) {
      case 'choice':
        return choice === null ? 'invalid' : checkChoice(step, choice);
      case 'number':
        return checkNumber(step, numberRaw);
      case 'table': {
        const checked = checkTable(step, tableRaws);
        if (checked === 'invalid') return 'invalid';
        setCellMarks(checked.cellCorrect);
        return checked.result;
      }
      case 'formula':
        if (formulaDone) return checkNumber(step, numberRaw);
        // 拼錯、亂拼（括號不成對、符號連在一起）都只是答錯；只有什麼都沒放才是「請先拼出算式」。
        return placed.length === 0 ? 'invalid' : checkFormula(step, placed.map((tile) => step.tiles[tile]));
      case 'slider':
        return checkSlider(step, sliderValue);
    }
  }

  function invalidHint(): string {
    switch (step.kind) {
      case 'choice':
        return NEED_CHOICE;
      case 'formula':
        if (!formulaDone) return NEED_FORMULA;
        return hasUnitAfterNumber(numberRaw) ? NUMBER_ONLY : NEED_NUMBER; // 第 2 步和數字題一樣
      case 'number':
        return hasUnitAfterNumber(numberRaw) ? NUMBER_ONLY : NEED_NUMBER;
      case 'table':
        // 「10公尺」這種輸入：學習者打了數字，只是多打了單位，提示要說清楚是哪裡不對。
        return tableRaws.some((raw) => hasUnitAfterNumber(raw)) ? NUMBER_ONLY : NEED_NUMBER;
      case 'slider': // 滑桿永遠有值，不會走到這裡
        return NEED_NUMBER;
    }
  }

  function check(): void {
    if (!answering) return;
    const result = evaluate();
    if (result === 'invalid') {
      setHint(invalidHint());
      return;
    }
    setHint(null);
    if (result.correct && step.kind === 'formula' && !formulaDone) {
      onCheck?.('partial');
      setFormulaDone(true); // 算式對了，還在作答中：接著算答案
      return;
    }
    if (result.correct) {
      onCheck?.('correct');
      setPhase('correct');
      return;
    }
    onCheck?.('wrong');
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
  const resultMark = phase === 'correct' ? 'correct' : phase === 'wrong' || phase === 'revealed' ? 'wrong' : null;

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
            mark={resultMark}
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
      case 'formula':
        return (
          <>
            <h2 className="lp-substep">
              第 1 步：拼算式
            </h2>
            <FormulaInput
              tiles={step.tiles}
              placed={placed}
              onChange={(next) => {
                setPlaced(next);
                setHint(null);
              }}
              disabled={!answering || formulaDone}
              mark={formulaDone ? 'correct' : resultMark}
              describedBy={formulaDone ? undefined : describedBy}
            />
            {formulaDone && (
              <>
                <h2 id={stepTwoId} className="lp-substep">
                  第 2 步：算出答案
                </h2>
                <NumberInput
                  value={numberRaw}
                  onChange={(raw) => {
                    setNumberRaw(raw);
                    setHint(null);
                  }}
                  onEnter={check}
                  disabled={!answering}
                  unit={step.unit}
                  mark={resultMark}
                  invalid={hint !== null}
                  labelledBy={`${stepTwoId} ${promptId}`}
                  describedBy={describedBy}
                />
              </>
            )}
          </>
        );
      case 'slider':
        return (
          <>
            <SliderInput step={step} value={sliderValue} onChange={setSliderValue} onEnter={check} disabled={!answering} mark={resultMark} />
            {phase === 'correct' && <CartAnim />}
          </>
        );
    }
  }

  let primary: { label: string; action: () => void };
  if (phase === 'answering') primary = { label: '檢查', action: check };
  else if (phase === 'correct') primary = { label: '繼續', action: () => onFinish(!hadWrong) };
  else if (phase === 'revealed') primary = { label: '繼續', action: () => onFinish(false) };
  else if (requestGuide) primary = { label: '一步一步來', action: requestGuide };
  else primary = { label: '再試一次', action: retry };

  const solution = solutionLines(step);

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
            {solution.map((line, i) => (
              <p key={i} className="lp-solution">
                {line}
              </p>
            ))}
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
