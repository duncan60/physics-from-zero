import { useLayoutEffect, useRef } from 'react';

// 磚塊的大小寫在這裡（不放在 CSS），保證至少 44px 好按；空位用同樣的大小。
const TILE_STYLE = { minHeight: 48, minWidth: 48 };

// 符號磚塊念出來的名稱。VoiceOver 預設的標點設定會跳過「(」「)」，其他符號各家念法也不一，
// 所以按鈕的名稱用中文說出來；畫面上的磚塊還是符號。數字照原樣。
const SPOKEN: Record<string, string> = {
  '(': '左括號',
  ')': '右括號',
  '+': '加',
  '−': '減',
  '×': '乘',
  '÷': '除以',
};

/** 一塊磚念出來的名稱，例如「(」→「左括號」、「÷」→「除以」，數字不變。 */
export function spokenTile(value: string): string {
  return SPOKEN[value] ?? value;
}

/** 一串磚塊念出來的樣子，用空白隔開，例如「左括號 6 加 18 右括號 除以 2」。 */
export function spokenFormula(tokens: string[]): string {
  return tokens.map(spokenTile).join(' ');
}

/** 放上去或拿回來之後，焦點要移去的地方（按下去的那顆按鈕已經不在原處了）。 */
type FocusTarget = { area: 'bank'; tile: number } | { area: 'row'; position: number } | { area: 'row-group' };

/**
 * 拼算式的磚塊。`placed` 是答案列上依序放的磚塊，記的是 `tiles` 的索引（不是數值），
 * 所以兩塊一樣的「20」各自獨立：每一塊最多放一次，拿回來時回到它自己在下方的位置。
 *
 * 點下方的磚塊 → 放到答案列最後面；點答案列的磚塊 → 拿回去。放上去的磚塊在下方留一個空位，
 * 其他磚塊不會跟著移動。`mark` 是 'correct' 時算式已經鎖定，下方的磚塊收起來。
 */
export function FormulaInput(props: {
  tiles: string[];
  placed: number[];
  onChange: (placed: number[]) => void;
  disabled: boolean;
  mark: 'correct' | 'wrong' | null;
  describedBy?: string;
}): React.JSX.Element {
  const { tiles, placed, onChange, disabled, mark, describedBy } = props;
  const rowRef = useRef<HTMLDivElement>(null);
  const bankRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  // 鍵盤使用者按完一塊，焦點不會掉到頁面最上面：放上去 → 下方最近的一塊；拿回來 → 答案列同一個位置。
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === null) return;
    if (target.area === 'row-group') rowRef.current?.focus();
    else if (target.area === 'row') rowRef.current?.querySelectorAll<HTMLButtonElement>('button')[target.position]?.focus();
    else bankRef.current?.querySelector<HTMLButtonElement>(`button[data-tile="${target.tile}"]`)?.focus();
  }, [placed]);

  const used = new Set(placed);

  function place(tile: number): void {
    if (disabled || used.has(tile)) return;
    const next = [...placed, tile];
    const free = tiles.map((_, i) => i).filter((i) => !next.includes(i));
    const after = free.find((i) => i > tile);
    const before = free.filter((i) => i < tile).pop();
    const nearest = after ?? before;
    pendingFocus.current = nearest === undefined ? { area: 'row-group' } : { area: 'bank', tile: nearest };
    onChange(next);
  }

  function remove(position: number): void {
    if (disabled) return;
    const next = placed.filter((_, p) => p !== position);
    pendingFocus.current =
      next.length > 0 ? { area: 'row', position: Math.min(position, next.length - 1) } : { area: 'bank', tile: placed[position] };
    onChange(next);
  }

  const classes = ['lp-formula'];
  if (mark) classes.push(`lp-formula--${mark}`);
  return (
    <div className={classes.join(' ')}>
      {/* tabIndex=-1：「再試一次」和磚塊放完時，焦點移到這裡，螢幕閱讀器會念出「你的算式」和目前拼的內容。 */}
      <div ref={rowRef} tabIndex={-1} className="lp-formula-row" role="group" aria-label="你的算式" aria-describedby={describedBy}>
        {placed.map((tile, position) => (
          <button
            key={tile}
            type="button"
            className="lp-tile"
            disabled={disabled}
            aria-label={disabled ? spokenTile(tiles[tile]) : `拿回 ${spokenTile(tiles[tile])}`}
            onClick={() => remove(position)}
            style={TILE_STYLE}
          >
            {tiles[tile]}
          </button>
        ))}
      </div>
      {mark !== 'correct' && (
        <div ref={bankRef} className="lp-tile-bank" role="group" aria-label="磚塊">
          {tiles.map((value, tile) =>
            used.has(tile) ? (
              // 空位：和磚塊一樣大，其他磚塊不會移動；螢幕閱讀器略過
              <span key={tile} className="lp-tile lp-tile--ghost" aria-hidden="true" style={TILE_STYLE}>
                {value}
              </span>
            ) : (
              <button
                key={tile}
                type="button"
                className="lp-tile"
                data-tile={tile}
                disabled={disabled}
                aria-label={disabled ? spokenTile(value) : `放入 ${spokenTile(value)}`}
                onClick={() => place(tile)}
                style={TILE_STYLE}
              >
                {value}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
