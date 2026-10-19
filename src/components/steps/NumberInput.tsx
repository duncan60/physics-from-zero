import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

/** 顯示用的數字：負數用數學負號「−」，和課程內文的寫法一致。 */
export function formatNumber(value: number): string {
  return value < 0 ? `−${-value}` : String(value);
}

/**
 * 在輸入框按 Enter 就等於按「檢查」。
 * 用注音等輸入法選字時按的 Enter 只是在確認文字，不算（Safari 這時 isComposing 是 false，但 keyCode 是 229）。
 */
export function onEnterKey(action: () => void): (event: KeyboardEvent<HTMLInputElement>) => void {
  return (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    action();
  };
}

/** 切換正負號：「」→「-」、「5」→「-5」、「-5」→「5」（也認得 −、－），「+5」→「-5」。 */
function toggleSign(raw: string): string {
  const text = raw.trimStart();
  const first = text.charAt(0);
  if (first === '-' || first === '−' || first === '－') return text.slice(1);
  if (first === '+' || first === '＋') return `-${text.slice(1)}`;
  return `-${text}`;
}

/**
 * 數字題的輸入框。用 type="text" 加 inputMode="decimal"：手機會跳出數字鍵盤，
 * 但仍然接受全形數字和「−」（type="number" 會把它們擋掉）。
 * iPhone 的小數鍵盤沒有負號鍵，所以旁邊有「±」按鈕。每一題都有，不只答案是負數的題目，才不會洩漏答案。
 */
export function NumberInput(props: {
  value: string;
  onChange: (raw: string) => void;
  onEnter: () => void;
  disabled: boolean;
  unit?: string;
  mark: 'correct' | 'wrong' | null;
  invalid: boolean;
  labelledBy: string;
  describedBy?: string;
}): React.JSX.Element {
  const { value, onChange, onEnter, disabled, unit, mark, invalid, labelledBy, describedBy } = props;
  const unitId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [signToggles, setSignToggles] = useState(0);

  // 按「±」、新的值畫上去之後，焦點留在輸入框、游標放在最後，接著打的數字會接在負號後面。
  useLayoutEffect(() => {
    if (signToggles === 0) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [signToggles]);

  const description = [unit !== undefined ? unitId : null, describedBy].filter(Boolean).join(' ') || undefined;
  const classes = ['lp-number'];
  if (mark) classes.push(`lp-number--${mark}`);
  return (
    <div className={classes.join(' ')}>
      <button
        type="button"
        className="lp-sign"
        aria-label="切換正負號"
        disabled={disabled}
        onClick={() => {
          inputRef.current?.focus(); // 在點擊當下就聚焦，iPhone 才會叫出鍵盤
          onChange(toggleSign(value));
          setSignToggles((n) => n + 1);
        }}
        style={{ minHeight: 44, minWidth: 44 }}
      >
        ±
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="lp-number-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onEnterKey(onEnter)}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-describedby={description}
        aria-invalid={invalid || undefined}
      />
      {unit !== undefined && (
        <span id={unitId} className="lp-unit">
          {unit}
        </span>
      )}
    </div>
  );
}
