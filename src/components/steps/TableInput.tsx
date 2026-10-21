import { blankCells, formatNumber } from '../../lib/answer';
import type { TableStep } from '../../lib/types';
import { onEnterKey } from './NumberInput';

/**
 * 表格題。`values` 和 `marks` 都依 `blankCells(step)` 的順序，一個空格一個。
 * `marks[i]`：true 答對、false 答錯、null 還沒檢查或檢查後又改過。
 * `revealed` 時，空格直接顯示正確的數字。
 */
export function TableInput(props: {
  step: TableStep;
  values: string[];
  onChange: (blankIndex: number, raw: string) => void;
  onEnter: () => void;
  disabled: boolean;
  marks: (boolean | null)[];
  revealed: boolean;
  labelledBy: string;
  describedBy?: string;
}): React.JSX.Element {
  const { step, values, onChange, onEnter, disabled, marks, revealed, labelledBy, describedBy } = props;
  const blankIndex = new Map(blankCells(step).map((blank, i) => [`${blank.row}:${blank.col}`, i]));

  return (
    // 欄位多的時候，只讓表格本身左右捲動，整頁不會出現水平捲軸。
    <div className="lp-table-wrap" style={{ overflowX: 'auto' }}>
      <table className="lp-table" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <td className="lp-table-corner" />
            {step.columns.map((column, col) => (
              <th key={col} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {step.rows.map((row, r) => (
            <tr key={r}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, c) => {
                if (typeof cell === 'string') {
                  return (
                    <td key={c} className="lp-cell lp-cell--given">
                      {cell}
                    </td>
                  );
                }
                // blankCells 會列出每一個不是字串的格子，所以一定找得到。
                const i = blankIndex.get(`${r}:${c}`) as number;
                if (revealed) {
                  return (
                    <td key={c} className="lp-cell lp-cell--blank lp-cell--revealed">
                      {formatNumber(cell.answer)}
                    </td>
                  );
                }
                const mark = marks[i] ?? null;
                const classes = ['lp-cell', 'lp-cell--blank'];
                if (mark === true) classes.push('lp-cell--correct');
                if (mark === false) classes.push('lp-cell--wrong');
                return (
                  <td key={c} className={classes.join(' ')}>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      className="lp-cell-input"
                      value={values[i] ?? ''}
                      onChange={(event) => onChange(i, event.target.value)}
                      onKeyDown={onEnterKey(onEnter)}
                      disabled={disabled}
                      aria-label={`${row.label}，${step.columns[c]}`}
                      aria-describedby={describedBy}
                      aria-invalid={mark === false || undefined}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
