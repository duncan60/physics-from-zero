import { useId } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { SliderStep } from '../../lib/types';
import { formatNumber, onEnterKey } from './NumberInput';

/** 對齊到 step 的格子上，並限制在 [min, max] 之內；toFixed 去掉 0.1 + 0.2 這類浮點誤差。 */
function snapSlider(value: number, { min, max, step }: Pick<SliderStep, 'min' | 'max' | 'step'>): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(10));
}

/** 方向鍵、Page Up/Down（一次 10 格）、Home/End 之後的值；其他按鍵回傳 null。 */
function keyTarget(key: string, value: number, { min, max, step }: Pick<SliderStep, 'min' | 'max' | 'step'>): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return value + step;
    case 'ArrowLeft':
    case 'ArrowDown':
      return value - step;
    case 'PageUp':
      return value + step * 10;
    case 'PageDown':
      return value - step * 10;
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return null;
  }
}

/**
 * 拉滑桿。用原生的 <input type="range">，觸控拖拉和螢幕閱讀器都直接可用；上方有看得到的標籤和即時數值。
 * 方向鍵等按鍵自己處理（不靠瀏覽器），每個瀏覽器的行為一致，也一定停在 [min, max] 和 step 的格子上。
 * 在滑桿上按 Enter 等於按「檢查」，和數字題的輸入框一樣。
 */
export function SliderInput(props: {
  step: SliderStep;
  value: number;
  onChange: (value: number) => void;
  onEnter: () => void;
  disabled: boolean;
  mark: 'correct' | 'wrong' | null;
}): React.JSX.Element {
  const { step, value, onChange, onEnter, disabled, mark } = props;
  const id = useId();
  const text = `${formatNumber(value)} ${step.unit}`;
  const enter = onEnterKey(onEnter);

  function handleKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return; // 不吃掉瀏覽器的快捷鍵
    const target = keyTarget(event.key, value, step);
    if (target === null) {
      enter(event);
      return;
    }
    event.preventDefault();
    onChange(snapSlider(target, step));
  }

  // 拉過的那一段塗上主色（Firefox 用 ::-moz-range-progress，其他瀏覽器用這個百分比畫漸層）。
  const fill = step.max > step.min ? ((value - step.min) / (step.max - step.min)) * 100 : 0;
  const style = { minHeight: 44, '--lp-slider-fill': `${fill}%` } as CSSProperties;
  const classes = ['lp-slider'];
  if (mark) classes.push(`lp-slider--${mark}`);
  return (
    <div className={classes.join(' ')}>
      <div className="lp-slider-head">
        <label htmlFor={id} className="lp-slider-label">
          {step.quantity}
        </label>
        {/* 螢幕閱讀器從 aria-valuetext 念數值，這裡不用再念一次 */}
        <span className="lp-slider-value" aria-hidden="true">
          {text}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="lp-slider-input"
        min={step.min}
        max={step.max}
        step={step.step}
        value={value}
        onChange={(event) => onChange(snapSlider(Number(event.target.value), step))}
        onKeyDown={handleKey}
        disabled={disabled}
        aria-valuetext={text}
        style={style}
      />
      <div className="lp-slider-scale" aria-hidden="true">
        <span>{formatNumber(step.min)}</span>
        <span>{formatNumber(step.max)}</span>
      </div>
    </div>
  );
}
