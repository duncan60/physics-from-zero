# 試玩回饋修正 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正試玩者回報的 10 個新手卡關點，分三批：介面修正、課內存檔、內容與模擬器。

**Architecture:** 沿用現有元件與純函式分層。新的狀態（課內存檔）放在 `src/lib/` 的純函式模組，用獨立 localStorage key；畫面改動集中在 `QuestionCard`、`FormulaInput`、`NumberInput`、`LessonPlayer`、`BusBallSim`、`SliderInput`/`CartAnim`。

**Tech Stack:** 沿用現有（Vite、React 19、TypeScript strict、Vitest、Testing Library）。

**Spec:** `docs/superpowers/specs/2026-10-21-playtest-fixes-design.md`

## Global Constraints

- 繁體中文（台灣）、不用 emoji；360px 不得水平捲軸；可點的東西 ≥ 44px；淺色深色；尊重減少動態效果。
- 不加執行期依賴；一般進度（`physics-from-zero:progress`）的格式與版本不變。
- 既有測試繼續通過；可以更新期望，但不能拿掉保護（例如連點不能跳過回饋）。
- Vitest 不開 globals；commit 結尾加 `Co-Authored-By: Claude <model> <noreply@anthropic.com>`；不 push；不碰 `.claude/worktrees/`、`.superpowers/`。

## Review Focus

1. 刻意的點擊在回饋出現約 250 毫秒後一定有反應；同一次連點的第二下仍然被擋 → Task 1。
2. 課內存檔壞掉、版本不符、課程內容改變（存的步驟超出範圍）時，不能當掉，從頭開始 → Task 3。
3. 從存檔繼續後完成，XP 與「完美」的計算和一次做完時一樣 → Task 3。
4. 重新排列選項後，所有答案、回饋、引導仍對得上（只改順序）→ Task 4。
5. 減少動態效果時，公車與購物車都只顯示結果，不會卡住按鈕 → Task 5。

---

### Task 1：按鈕保護、通用答錯提示、數字格式提示（spec 第 1 批 1–3）

**Files:** `src/components/useActionGuard.ts`、`src/components/QuestionCard.tsx`、`src/components/steps/NumberInput.tsx`、`src/components/steps/TableInput.tsx`（如需要）、`src/styles.css` 與測試

- 保護時間縮短到約 250 毫秒，並且保護期間在受保護的按鈕加上淡色樣式與 `aria-disabled="true"`（時間到自動恢復，不能讓按鈕永久淡色）。連點測試（雙擊「檢查」不會跳過「還不對」）必須繼續通過。
- 沒有特定回饋時的通用提示文字照 spec；數字題有引導時加「也可以按『一步一步來』」。
- 數字輸入框下方的格式提示照 spec，拼算式第 2 步也顯示；用 `aria-describedby` 連到輸入框。
- 測試：保護期間按鈕有 `aria-disabled` 且點了沒反應、時間到後點了有反應；數字題輸入未列出的錯誤數字會看到通用提示；表格題答錯有通用提示；格式提示存在且被輸入框描述。

### Task 2：拼算式清空與說明、方塊標示、引導不重來（spec 第 1 批 4–6）

**Files:** `src/lib/types.ts`、`src/components/steps/FormulaInput.tsx`、`src/components/QuestionCard.tsx`、`src/components/LessonPlayer.tsx`、`src/components/GuideRunner.tsx`（如需要）、`src/content/lessons/*.ts`、`src/content/reviews/*.ts`、`src/content/content.test.ts` 與測試

- `FormulaStep.tileLabels?: (string | undefined)[]`；方塊下方小字顯示、無障礙名稱「放入 20（力）」「拿回 20（力）」；內容檢查：`tileLabels` 長度等於 `tiles`；同一題數值相同的方塊一定都有標示，且標示不同。
- 「再試一次」把答案列清空；方塊上方的固定說明照 spec。
- 引導：每一題記住「引導已經走完過」；之後再答錯，主要按鈕「再試一次」、次要按鈕「再看一次引導」「看解答」。這一題仍然不算一次答對。
- 內容：為 2-1 `full-cart-accel`、2-4 `moon-weight` 以及其他有重複數值或容易混淆的拼算式題加上標示。
- 測試：兩個「20」各有不同標示並出現在名稱裡；再試一次後答案列是空的；引導走完一次後再答錯，主要按鈕是「再試一次」，按「再看一次引導」會重新進入引導。

### Task 3：課內存檔（spec 第 2 批）

**Files:** Create `src/lib/runs.ts` 與測試；Modify `src/components/LessonPlayer.tsx`、`src/App.tsx`、相關測試

```ts
export const RUNS_KEY = 'physics-from-zero:runs';
export interface SavedRun { lessonId: string; nextStep: number; stats: unknown /* LessonPlayer 需要的計分狀態，自己定義型別 */; startedAt: number }
export function loadRun(storage: Storage | null, lessonId: string, stepCount: number): SavedRun | null; // 壞掉、版本不符、nextStep 超出範圍 → null
export function saveRun(storage: Storage | null, run: SavedRun): void;   // 吞掉例外
export function clearRun(storage: Storage | null, lessonId: string): void;
```
- `LessonPlayer` 在進入下一步時存檔；開啟時若有存檔就從那一步繼續，顯示「從上次的第 N 步繼續」與「從頭開始」；完成時清除。預覽模式不存檔。
- 拿掉「離開」的確認對話框（直接回地圖），並更新相關測試。
- 測試：做到第 3 步後重新掛載（模擬重新整理）會從第 3 步繼續；從存檔繼續做完的 XP 和完美與一次做完相同；「從頭開始」清掉存檔；存檔壞掉／步數超出範圍時從頭開始；複習也能續做；預覽不寫入 storage。

### Task 4：選項位置重新排列（spec 第 3 批 1）

**Files:** `src/content/lessons/*.ts`、`src/content/reviews/*.ts`、`src/content/content.test.ts`

- 先在 `content.test.ts` 加入 spec 的三條位置／長度規則（RED），再只調整選項順序讓它們通過；id、內容、答案、回饋都不變。
- 報告要附上每個檔案調整前後正確答案的位置分布。

### Task 5：公車模擬煞車時機、2-1 滑桿畫面（spec 第 3 批 2–3）

**Files:** `src/sims/BusBallSim.tsx`、`src/components/steps/SliderInput.tsx`、`src/components/sims/CartAnim.tsx`、`src/content/lessons/2-1-force-and-acceleration.ts`（如果需要提供質量給動畫）、`src/lib/types.ts`（如需要）、`src/styles.css` 與測試

- 公車：「急煞車」只在球丟出且還在空中時可以按，其他時候不能按並顯示提示；減少動態效果維持現有規則。
- 滑桿：一開始就顯示購物車（含質量標示）與力的箭頭（長度隨數值變化）；按「檢查」後用 a = F ÷ m 播放並顯示算出來的加速度，答對答錯都播；減少動態效果只顯示結果。需要的質量資料加在 `SliderStep`（例如 `cartMass?: number`）並在 2-1 內容中填 10。
- 測試：丟球前「急煞車」不能按；丟球後可以；滑桿畫面一開始就有購物車與箭頭，箭頭長度隨數值改變；檢查後顯示的加速度 = F ÷ m。
