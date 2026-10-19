import { useId } from 'react';
import type { ChoiceOption } from '../../lib/types';

/**
 * 單選題的選項。用原生的 radio，鍵盤（方向鍵）和螢幕閱讀器都能直接使用。
 * `correctId`／`wrongId` 是檢查之後要標示成答對、答錯的選項。
 */
export function ChoiceInput(props: {
  options: ChoiceOption[];
  selected: string | null;
  onSelect: (optionId: string) => void;
  disabled: boolean;
  correctId: string | null;
  wrongId: string | null;
  labelledBy: string;
  describedBy?: string;
}): React.JSX.Element {
  const { options, selected, onSelect, disabled, correctId, wrongId, labelledBy, describedBy } = props;
  const name = useId();
  return (
    <div className="lp-options" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {options.map((option) => {
        const classes = ['lp-option'];
        if (option.id === selected) classes.push('lp-option--selected');
        if (option.id === correctId) classes.push('lp-option--correct');
        if (option.id === wrongId) classes.push('lp-option--wrong');
        return (
          <label key={option.id} className={classes.join(' ')}>
            <input
              type="radio"
              className="lp-option-input"
              name={name}
              value={option.id}
              checked={option.id === selected}
              disabled={disabled}
              onChange={() => onSelect(option.id)}
            />
            <span className="lp-option-label">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
