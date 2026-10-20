# 作答方式的變化與遊戲感 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加入「拼算式 + 算答案」、「配對」、「拉滑桿」三種題型，以及連續答對、音效與動畫、完成成績、金色課程四項遊戲感，並把指定的題目改成新題型。

**Architecture:** 判斷邏輯全部寫成 `src/lib/` 的純函式（算式正規化、配對、滑桿、遊戲計分、音效），React 元件只負責畫面。新題型接進既有的 `QuestionCard` / `LessonPlayer` 流程（答錯 → 一步一步來 / 看解答 / 再試一次），配對另用一個小元件。進度存檔升到版本 2，並把版本 1 轉換過來。

**Tech Stack:** 沿用現有：Vite、React 19、TypeScript strict、Vitest（globals 關閉）、Testing Library、user-event。不加任何新的執行期依賴。

**Spec:** `docs/superpowers/specs/2026-10-20-variety-and-game-design.md`（上一版 `2026-10-19-physics-from-zero-design.md` 的目標、非目標、反目標仍然有效）

## Global Constraints

- 介面文字全部使用繁體中文（台灣用語），不使用 emoji。
- 不得有愛心、扣命、倒數計時、排行榜、答錯扣分、限時加倍。
- 手機 360px 不得出現水平捲軸；可點的東西至少 44px；淺色、深色都要好看；所有動畫尊重 `prefers-reduced-motion`。
- 不加執行期依賴；音效用 Web Audio 即時合成，不放音檔。
- 每一課 5 到 8 個步驟；觀念卡 ≤ 150 字元；表格空格答案 ≥ 0；永遠不寫「負號就代表減速」。
- 減號磚塊一律用 `−`（U+2212），乘號 `×`，除號 `÷`。
- Commit：repo 本機身分已設定（duncan60）；訊息結尾加 `Co-Authored-By: Claude <model> <noreply@anthropic.com>`；不要 push；不要碰 `.claude/worktrees/`。
- Vitest 不開 globals，從 `vitest` 匯入 `describe/it/expect/vi`；回傳型別用 `React.JSX.Element`。

## Review Focus

1. **舊存檔**：已經在學的人（版本 1 存檔）升級後，完成的課、XP、連續天數一個都不能少 → Task 1 測試。
2. **算式「數字一樣但方法錯」**：`(10 − 0) ÷ 2 × 5` 必須判錯，`(0 + 10) ÷ 2 × 5` 判對；亂拼的磚塊（括號不成對、運算符號連在一起、空的）只算「還不對」，不能當掉 → Task 2 測試。
3. **相同數值的磚塊**：2-1 的 `20 ÷ 20` 有兩塊「20」；點掉其中一塊只會拿回那一塊 → Task 4 測試。
4. **沒有音效能力的瀏覽器**：沒有 `AudioContext` 或建立時拋出例外，網站照常運作、不報錯 → Task 3 測試。
5. **滑桿用鍵盤**：方向鍵可以調整、到最小／最大值不會超出範圍；開了減少動態效果時不播放購物車動畫 → Task 4 測試。

---

## 檔案結構

```
src/lib/types.ts            # 新增 FormulaStep、SliderStep、MatchStep
src/lib/formula.ts          # 算式解析、正規化、判斷、求值
src/lib/match.ts            # 打亂順序、判斷配對
src/lib/slider.ts           # 滑桿判斷
src/lib/game.ts             # Combo、完美、正確率、時間格式、本課 XP
src/lib/sound.ts            # Web Audio 音效
src/lib/progress.ts         # 版本 2：perfect、soundOn、轉換、合併
src/components/steps/FormulaInput.tsx
src/components/steps/SliderInput.tsx
src/components/sims/CartAnim.tsx
src/components/MatchCard.tsx
src/components/SoundContext.tsx
src/components/Confetti.tsx
src/components/QuestionCard.tsx / LessonPlayer.tsx / Header.tsx / PathMap.tsx / App.tsx（修改）
src/content/lessons/1-3-*.ts、1-5-*.ts、2-1-*.ts（修改）
src/content/content.test.ts、src/App.lessons.test.tsx（修改）
```

---

### Task 1：進度存檔升到版本 2

**Files:** Modify `src/lib/progress.ts`、`src/lib/progress.test.ts`（以及型別有變動而需要跟著改的呼叫端）

**Interfaces:**
- Produces：

```ts
export interface Progress { version: 2; completed: string[]; perfect: string[]; xp: number; streak: number; lastActiveDay: string | null; soundOn: boolean }
export function emptyProgress(): Progress; // perfect: [], soundOn: true
export function completeLesson(p: Progress, lessonId: string, xpGained: number, today: string, perfect?: boolean): Progress; // perfect=true 時把 lessonId 加進 perfect（不重複）；perfect 永遠不移除
export function setSoundOn(p: Progress, on: boolean): Progress;
export function mergeProgress(a: Progress, b: Progress): Progress; // perfect 取聯集；soundOn 取 a 的
export const PERFECT_BONUS_XP = 5;
```

- [ ] **Step 1：寫失敗的測試**

```ts
it('版本 1 的存檔會轉成版本 2，資料都保留', () => {
  const v1 = { version: 1, completed: ['1-1', '1-2'], xp: 45, streak: 3, lastActiveDay: '2026-10-19' };
  expect(loadProgress(fake(JSON.stringify(v1)))).toEqual({ version: 2, completed: ['1-1', '1-2'], perfect: [], xp: 45, streak: 3, lastActiveDay: '2026-10-19', soundOn: true });
});
it('版本 2 來回存取', ...);
it('版本 3 或不認得的版本 → 空進度', ...);
it('perfect 或 soundOn 型別不對 → 空進度', ...);
it('completeLesson 拿到完美才加進 perfect，而且不重複、不會移除', ...);
it('setSoundOn 回傳新物件', ...);
it('mergeProgress：perfect 取聯集，soundOn 取第一份', ...);
```

- [ ] **Step 2：執行確認失敗** — `npx vitest run src/lib/progress.test.ts`
- [ ] **Step 3：實作**（`parseProgress` 先辨認版本 1 並轉換，再驗證版本 2；其餘函式照上面的介面）
- [ ] **Step 4：全部測試、型別檢查** — `npm test && npx tsc --noEmit`（呼叫端若因型別變動壞掉，在這個 task 一起修好）
- [ ] **Step 5：Commit** — `feat: 進度存檔升到版本 2（完美課程、音效設定），舊存檔自動轉換`

---

### Task 2：新題型的型別與判斷邏輯

**Files:** Modify `src/lib/types.ts`；Create `src/lib/formula.ts`、`src/lib/match.ts`、`src/lib/slider.ts` 與各自的 `.test.ts`

**Interfaces:**
- Produces（`types.ts`）：

```ts
export interface FormulaWrongForm { tokens: string[]; feedback: string }
export interface FormulaStep { kind: 'formula'; id: string; prompt: string; tiles: string[]; accepted: string[][]; wrongForms?: FormulaWrongForm[]; answer: number; tolerance?: number; unit?: string; wrongAnswers?: WrongAnswer[]; explanation: string; guide?: GuideStep[] }
export interface SliderStep { kind: 'slider'; id: string; prompt: string; quantity: string; unit: string; min: number; max: number; step: number; initial: number; answer: number; tolerance?: number; tooLow: string; tooHigh: string; explanation: string; anim: 'cart'; guide?: GuideStep[] }
export interface MatchPair { left: string; right: string }
export interface MatchStep { kind: 'match'; id: string; prompt: string; pairs: MatchPair[]; explanation: string }
export type QuestionStep = ChoiceStep | NumberStep | TableStep | FormulaStep | SliderStep;
export type GuideStep = ConceptStep | ChoiceStep | NumberStep | TableStep; // 不變
export type Step = ConceptStep | QuestionStep | SimStep | MatchStep;
```

- Produces（邏輯）：

```ts
// formula.ts — 磚塊：數字字串、'+', '−', '×', '÷', '(', ')'
export function parseFormula(tokens: string[]): FormulaNode | null; // 不合法回傳 null，不拋出
export function evaluateFormula(tokens: string[]): number | null;
export function sameFormula(a: string[], b: string[]): boolean;     // 正規化後相同；+ 與 × 可交換、可結合，− 與 ÷ 不可
export function checkFormula(step: FormulaStep, tokens: string[]): CheckResult; // 對 accepted 任一 sameFormula → 對；否則找 wrongForms 的 feedback
// match.ts
export function shuffle<T>(items: readonly T[], random: () => number): T[];
export function isPair(step: MatchStep, left: string, right: string): boolean;
// slider.ts
export function checkSlider(step: SliderStep, value: number): CheckResult; // 太小 → tooLow、太大 → tooHigh；用 tolerance + 1e-9 判斷
```

- [ ] **Step 1：寫失敗的測試**

```ts
const M = '−';
it('交換律：(6 + 18) ÷ 2 等於 (18 + 6) ÷ 2', () => expect(sameFormula(['(', '6', '+', '18', ')', '÷', '2'], ['(', '18', '+', '6', ')', '÷', '2'])).toBe(true));
it('數字一樣、方法錯：(10 − 0) ÷ 2 × 5 不等於 (10 + 0) ÷ 2 × 5', () => expect(sameFormula(['(', '10', M, '0', ')', '÷', '2', '×', '5'], ['(', '10', '+', '0', ')', '÷', '2', '×', '5'])).toBe(false));
it('減法不能交換：(18 − 6) ÷ 4 不等於 (6 − 18) ÷ 4', ...);
it('先乘除後加減：6 + 18 ÷ 2 不等於 (6 + 18) ÷ 2', ...);
it.each([[[]], [['+', '÷', '2']], [['(', '6', '+', '18']], [['6', '18']], [['÷']]])('不合法的拼法回傳 null、不拋出：%j', (t) => { expect(parseFormula(t)).toBeNull(); expect(evaluateFormula(t)).toBeNull(); });
it('evaluateFormula：(10 + 0) ÷ 2 × 5 = 25；20 ÷ 20 = 1', ...);
it('checkFormula：認得的錯誤算式給對應回饋；不認得的沒有回饋；不合法的拼法是答錯', ...);
it('shuffle 用注入的亂數、不改動原陣列', ...);
it('isPair', ...);
it('checkSlider：剛好、太小、太大、容許誤差邊界', ...);
```

- [ ] **Step 2：確認失敗** — `npx vitest run src/lib`
- [ ] **Step 3：實作**。`parseFormula` 用遞迴下降（`*` `÷` 優先於 `+` `−`，左結合，支援括號）；正規化時把連續的 `+` 與 `×` 攤平、子節點排序後轉成字串比較。
- [ ] **Step 4：通過** — `npm test && npx tsc --noEmit`（`QuestionCard` 裡依 `kind` 的 `switch` 若因新型別而無法編譯，先讓新 kind 回傳 `null` 佔位並留 TODO 給 Task 4，不要實作畫面）
- [ ] **Step 5：Commit** — `feat: 拼算式、配對、滑桿的型別與判斷邏輯`

---

### Task 3：遊戲計分與音效邏輯

**Files:** Create `src/lib/game.ts`、`src/lib/sound.ts` 與測試

**Interfaces:**
- Consumes：`XP_PER_LESSON`、`XP_PER_FIRST_TRY`、`PERFECT_BONUS_XP`（Task 1）
- Produces：

```ts
export const COMBO_START = 3;
export const COMBO_XP_CAP = 5;
export interface RunStats { questions: number; clean: number; combo: number; bestCombo: number; comboXp: number }
export function emptyStats(): RunStats;
export function recordQuestion(s: RunStats, clean: boolean): RunStats; // clean → combo+1，新的 combo ≥ 3 時 comboXp+1（上限 5）；否則 combo 歸零
export function isPerfect(s: RunStats): boolean;   // questions > 0 且 clean === questions
export function accuracy(s: RunStats): number;     // 四捨五入的百分比；沒有題目時 100
export function lessonXp(s: RunStats): number;     // XP_PER_LESSON + clean × XP_PER_FIRST_TRY + comboXp + (完美 ? PERFECT_BONUS_XP : 0)
export function formatDuration(ms: number): string; // 「X 分 Y 秒」；不到 1 分鐘是「Y 秒」
export type SoundKind = 'correct' | 'wrong' | 'complete';
export function createSoundPlayer(factory?: () => AudioContext | null): { play(kind: SoundKind): void }; // 延遲到第一次 play 才建立；任何例外都吞掉
```

- [ ] **Step 1：寫失敗的測試**

```ts
it('連續 3 題一次答對：comboXp 1；5 題：3；8 題：5（上限）', ...);
it('答錯讓 combo 歸零，但不扣 comboXp', ...);
it('完美：全部一次答對才算；沒有題目不算完美', ...);
it('lessonXp：4 題全對、combo 2 → 10 + 20 + 2 + 5 = 37', ...);
it('accuracy：3/4 → 75；2/3 → 67', ...);
it('formatDuration：65000 → 1 分 5 秒；9000 → 9 秒', ...);
it('沒有 AudioContext 或建立時拋出例外，play 不會拋出', ...);
it('有 AudioContext 時，play 會建立振盪器並排程停止', ...); // 用假的 AudioContext 物件
```

- [ ] **Step 2–4：** 確認失敗 → 實作 → `npm test && npx tsc --noEmit`
- [ ] **Step 5：Commit** — `feat: 連續答對、完美、正確率的計分與音效播放器`

---

### Task 4：新題型的畫面

**Files:** Create `src/components/steps/FormulaInput.tsx`、`src/components/steps/SliderInput.tsx`、`src/components/sims/CartAnim.tsx`、`src/components/MatchCard.tsx`；Modify `src/components/QuestionCard.tsx`、`src/components/LessonPlayer.tsx`、`src/styles.css`；Test `src/components/NewSteps.test.tsx`

**Interfaces:**
- Consumes：Task 2 的型別與判斷函式。
- Produces：`MatchCard(props: { step: MatchStep; onFinish: (cleanFirstTry: boolean) => void; random?: () => number })`；`QuestionCard` 支援 `formula` 與 `slider`（`onFinish` 語意不變）；`LessonPlayer` 會把 `match` 步驟交給 `MatchCard`。

行為（固定文字）：
- **拼算式**：第 1 步標題「第 1 步：拼算式」，第 2 步「第 2 步：算出答案」。磚塊用 `<button>`，用索引（不是數值）辨認每一塊；點下方磚塊放到答案列末端，點答案列的磚塊拿回原位；答案列空的時候按「檢查」顯示「請先拼出算式」。算式對了才顯示第 2 步（數字輸入沿用 `NumberInput`，含 ± 與單位提示）。算式錯 → 「還不對」＋回饋（同現有按鈕）。第 2 步錯 → 同現有數字題。看解答顯示正確算式（`accepted[0]` 用空白連接）與答案。兩步都第一次就對才 `onFinish(true)`。
- **滑桿**：`<input type="range">`，有可見的標籤「{quantity}」與即時數值「{值} {unit}」；按「檢查」才判斷。對 → 播放 `CartAnim`（減少動態效果時只顯示停在終點的購物車）＋「答對了」。錯 → `tooLow`／`tooHigh` 回饋。
- **配對**：左右兩欄按鈕，右欄用 `shuffle`。先點一邊再點另一邊；對 → 兩塊鎖定（`aria-disabled`、勾勾圖示）；錯 → 兩塊標示錯誤約 600ms 後恢復，記為答錯。全部配完 →「答對了」＋說明＋「繼續」。只要有任何一次配錯，`onFinish(false)`。

- [ ] **Step 1：寫失敗的測試**（用測試專用的課程資料）

```tsx
it('拼算式：點磚塊放上去、點答案列拿回來；兩塊「20」各自獨立', ...);
it('拼算式：沒拼就檢查 → 「請先拼出算式」，不算答錯', ...);
it('拼算式：拼成已知錯誤算式 → 「還不對」與那則回饋；拼對後才出現「第 2 步：算出答案」', ...);
it('拼算式：兩步都第一次就對 → onFinish(true)；任何一步錯過 → onFinish(false)', ...);
it('拼算式：看解答顯示正確算式與答案', ...);
it('滑桿：方向鍵調整，到 min/max 不超出；太小/太大給對應回饋；對了顯示「答對了」', ...);
it('滑桿：減少動態效果時不播放動畫', ...); // mock matchMedia
it('配對：右欄依注入的亂數排序；配錯會恢復並使 onFinish(false)；全對 onFinish(true)', ...);
it('LessonPlayer：一課裡混合 formula、slider、match 能一路走到完成', ...);
```

- [ ] **Step 2–4：** 確認失敗 → 實作 → `npm test && npx tsc --noEmit && npm run build`
- [ ] **Step 5：瀏覽器檢查**：`npm run dev`，375px 與桌機寬度、淺色深色，三種題型各操作一次；無水平捲軸。結束後關掉伺服器。
- [ ] **Step 6：Commit** — `feat: 拼算式、拉滑桿、配對三種題型的畫面`

---

### Task 5：遊戲感的畫面

**Files:** Create `src/components/SoundContext.tsx`、`src/components/Confetti.tsx`；Modify `src/components/LessonPlayer.tsx`、`src/components/Header.tsx`、`src/components/PathMap.tsx`、`src/App.tsx`、`src/styles.css` 與相關測試

**Interfaces:**
- Consumes：Task 1（`perfect`、`soundOn`、`setSoundOn`、`completeLesson(..., perfect)`）、Task 3（`RunStats` 系列、`createSoundPlayer`）。
- Produces：

```ts
export interface LessonResult { xp: number; perfect: boolean; accuracy: number; durationMs: number }
// LessonPlayer 的 onComplete 改成 (result: LessonResult) => void，完成畫面出現時呼叫一次（沿用現有的 reported 機制）
export function SoundProvider(props: { enabled: boolean; children: React.ReactNode; player?: { play(kind: SoundKind): void } }): React.JSX.Element;
export function useSound(): (kind: SoundKind) => void;
// Header 增加 props：soundOn: boolean; onToggleSound: () => void
```

行為（固定文字）：
- 每題結束用 `recordQuestion` 更新統計（觀念卡、動畫不算）。combo ≥ 3 時在進度條旁顯示「連續答對 N 題！」並讓進度條加上 `lp-progress--combo`。
- 答對播 `correct`、答錯播 `wrong`、完成畫面出現播 `complete`；答對時題目區加 `lp-bounce`。
- 完成畫面：「完成這一課」、「本課獲得 N XP」、「正確率 N%」、「花了 {formatDuration}」；完美時多一個「完美！」標記與 `Confetti`。減少動態效果時不顯示彩紙動畫。
- 頁首音效開關：`<button aria-pressed>`，文字或 `aria-label` 為「音效：開」／「音效：關」。
- `App`：讀寫 `soundOn`；完成時 `completeLesson(p, id, result.xp, today, result.perfect)`。
- `PathMap`：在 `perfect` 裡的課顯示金色狀態，圖示用星星、文字「完美」，與「已完成」不只顏色不同。

- [ ] **Step 1：寫失敗的測試**

```tsx
it('連續答對 3 題出現「連續答對 3 題！」，答錯後消失', ...);
it('完成畫面顯示 XP、正確率、時間；全對時顯示「完美！」與額外 XP', ...); // 用假時鐘控制時間
it('onComplete 收到 { xp, perfect, accuracy, durationMs } 而且只呼叫一次', ...);
it('音效開關：按了切換 aria-pressed，並寫進進度；重新載入仍是關閉', ...);
it('音效關閉時不呼叫 player.play；開啟時答對呼叫 correct', ...);
it('地圖：perfect 裡的課顯示「完美」；舊的「已完成」照常顯示', ...);
it('App：拿到完美後，地圖上那一課變成「完美」，XP 包含完美加分', ...);
```

- [ ] **Step 2–4：** 確認失敗 → 實作 → `npm test && npx tsc --noEmit && npm run build`
- [ ] **Step 5：瀏覽器檢查**：完整上一課拿到完美（看 combo、彩紙、成績、金色），再上一課故意答錯；切換音效；深色模式；減少動態效果。
- [ ] **Step 6：Commit** — `feat: 連續答對、音效與動畫、完成成績、金色課程`

---

### Task 6：把課程改成新題型

**Files:** Modify `src/content/lessons/1-3-acceleration.ts`、`1-5-how-high.ts`、`2-1-force-and-acceleration.ts`、`src/content/content.test.ts`、`src/App.lessons.test.tsx`

**Interfaces:** Consumes Task 2 的型別、Task 4 的畫面。

內容（照 spec 3.1～3.3 的表格與說明）：
- `formula`：1-3 `scooter-from-rest`、`scooter-6-to-18`；1-5 `scooter-average`、`bus-slide`；2-1 `full-cart-accel`。磚塊與已知錯誤算式照 spec 的表。保留並調整原本的 `wrongAnswers`、`explanation`、`guide`。
- `match`：1-5 最後新增 `formula-match`（3 對，照 spec）。1-5 變成 8 步。
- `slider`：2-1 `empty-cart-force`：quantity「推力」、unit「N」、min 0、max 40、step 1、initial 0、answer 20；`tooLow`／`tooHigh` 由原本的錯誤回饋改寫，不直接給答案；`anim: 'cart'`。

- [ ] **Step 1：擴充 `content.test.ts` 的檢查並確認失敗**：`formula` 的每個 accepted 只用到 `tiles` 提供的磚塊（多重集合）、`evaluateFormula(accepted) === answer`、陷阱磚塊 2～4 個、`wrongForms` 不與任何 accepted `sameFormula`；`match` 左右都不重複、至少 3 對；`slider` 的 answer 在 [min,max] 且落在 step 上、initial 不等於 answer；以及上面 7 個步驟 id 的 kind 正確。
- [ ] **Step 2：改內容**
- [ ] **Step 3：更新 `App.lessons.test.tsx`**，讓「每一課實際玩一遍」能完成新題型。
- [ ] **Step 4：** `npm test && npx tsc --noEmit && npm run build`
- [ ] **Step 5：Commit** — `content: 5 題改成拼算式、1-5 加公式配對、2-1 改成拉滑桿`
