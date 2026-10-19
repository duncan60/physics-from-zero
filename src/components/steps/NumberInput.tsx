import { useId } from 'react';
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

/**
 * 數字題的輸入框。用 type="text" 加 inputMode="decimal"：手機會跳出數字鍵盤，
 * 但仍然接受全形數字和「−」（type="number" 會把它們擋掉）。
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
  const description = [unit !== undefined ? unitId : null, describedBy].filter(Boolean).join(' ') || undefined;
  const classes = ['lp-number'];
  if (mark) classes.push(`lp-number--${mark}`);
  return (
    <div className={classes.join(' ')}>
      <input
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
