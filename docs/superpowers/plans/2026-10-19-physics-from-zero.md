# 從零開始學物理 v1 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 Duolingo 風格、繁體中文的物理入門網站，v1 包含第 1 站的 4 課，公開在 `duncan60/physics-from-zero`，並透過 GitHub Pages 上線。

**Architecture:** 純前端 SPA，使用 hash 路由（`#/`、`#/lesson/1-1`），才能在 GitHub Pages 子路徑底下重新整理頁面。課程內容是有型別的 TypeScript 資料檔，邏輯（答案判斷、進度、模擬物理）全部寫成可以單獨測試的純函式，React 元件只負責畫面和狀態流程。

**Tech Stack:** Vite、React 18 以上、TypeScript（strict）、Vitest、jsdom、@testing-library/react、@testing-library/user-event、@testing-library/jest-dom、GitHub Actions、GitHub Pages。不使用 UI 套件、不使用 CSS 框架、不使用圖示套件。

**Spec:** `docs/superpowers/specs/2026-10-19-physics-from-zero-design.md`（實作者請兩份一起讀，第 5 節的課程內容以 spec 為準）

## Global Constraints

- 介面文字全部使用繁體中文。
- Vite `base` 為 `/physics-from-zero/`，正式網址是 `https://duncan60.github.io/physics-from-zero/`。
- 不做：帳號、登入、排行榜、後端、英文版。
- 不得出現愛心、生命、倒數計時，答錯也不扣分。
- 觀念卡內文總長度不超過 150 個字元，每一課 5 到 8 個步驟（引導步驟不算在內）。
- Git：分支 `main`；只在這個 repo 設定 `user.name=duncan60`、`user.email=tmduncan60@gmail.com`，不可使用全域設定；remote 為 `git@duncan60-GitHub:duncan60/physics-from-zero.git`。
- gh 指令一律加上 `GH_TOKEN=$(gh auth token --user duncan60)`，不要切換 gh 目前作用中的帳號。
- 授權：根目錄 `LICENSE` 用 MIT（`Copyright (c) 2026 duncan60`）；`src/content/LICENSE.md` 用 CC BY-SA 4.0。
- 署名文字：「由 duncan60 與 Claude 一起製作，課程來自真實的學習過程」，只出現在 README 和頁尾。
- 手機優先：寬度 360px 時不可以出現水平捲軸。
- 支援淺色和深色模式（`prefers-color-scheme`）。
- 本計畫中寫成 `JSX.Element` 的回傳型別，如果安裝的 `@types/react` 已經沒有全域的 `JSX` 命名空間，就改用 `React.JSX.Element`。

## Review Focus

1. **瀏覽器儲存空間無法使用或資料毀損**（無痕模式、`localStorage` 拋出例外、JSON 壞掉、版本不符）時，網站要照常運作，進度從零開始 → Task 3 的 `loadProgress` 測試。
2. **數字輸入的各種寫法**：全形數字「１８」、全形負號「－」、數學負號「−」（U+2212）、前後空白、`+3` 都要接受；空白或非數字時顯示「請先輸入數字」，而且不算答錯 → Task 2 的 `parseNumberInput` 和 `checkNumber` 測試，Task 6 的元件測試。
3. **直接開啟或重新整理課程網址**：不存在的課程 id、尚未解鎖的課程，都要顯示友善訊息，並附上回到地圖的按鈕，不能出現空白頁 → Task 7 的 App 測試。
4. **跨日的連續天數**：同一天完成兩課不重複加一；連續兩天會加一；中斷超過一天就重設為 1；前天以前最後一次學習，顯示 0 → Task 3 的測試。
5. **重複上同一課、上到一半離開**：重上不會在 `completed` 裡重複記錄；中途按「離開」不算完成 → Task 3 和 Task 6 的測試。

---

## 檔案結構

```
index.html
package.json
vite.config.ts            # base、vitest 設定（jsdom、setupFiles）
tsconfig.json
.gitignore
LICENSE                   # MIT
README.md
.github/workflows/deploy.yml
src/
  main.tsx
  App.tsx                 # 路由：地圖 / 課程 / 找不到 / 未解鎖
  styles.css              # 全站樣式、色彩變數、深色模式
  test/setup.ts           # jest-dom
  lib/
    types.ts              # 課程內容型別
    answer.ts             # 答案判斷
    progress.ts           # 進度、XP、連續天數、解鎖
    router.ts             # useHashRoute
  content/
    LICENSE.md            # CC BY-SA 4.0
    stations.ts           # 7 站；第 1 站引用 4 課
    lessons/1-1-inertia.ts
    lessons/1-2-speed-position.ts
    lessons/1-3-acceleration.ts
    lessons/1-4-ball-thrown-up.ts
    content.test.ts       # 驗證所有課程資料
  sims/
    busBall.ts            # 公車與球的物理（純函式）
    busBall.test.ts
    BusBallSim.tsx        # SVG 動畫元件
  components/
    Header.tsx            # XP、連續天數
    Footer.tsx            # 署名、授權
    PathMap.tsx           # 路線地圖
    LessonPlayer.tsx      # 一課的流程：一步一步、進度條、完成畫面
    QuestionCard.tsx      # 單一題目：作答 → 對 / 錯 → 引導 / 看解答
    GuideRunner.tsx       # 分步引導
    steps/ConceptView.tsx
    steps/ChoiceInput.tsx
    steps/NumberInput.tsx
    steps/TableInput.tsx
```

---

### Task 1：專案骨架與 repo 初始化

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `LICENSE`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test/setup.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces：npm scripts `dev`（`vite`）、`build`（`tsc --noEmit && vite build`）、`test`（`vitest run`）、`preview`（`vite preview`）。

- [ ] **Step 1：初始化 git，設定這個 repo 的身分**

```bash
cd ~/Desktop/物理學習
git init -b main
git config user.name duncan60
git config user.email tmduncan60@gmail.com
```

驗證：`git config user.email` 輸出 `tmduncan60@gmail.com`。

- [ ] **Step 2：建立 `package.json`，安裝依賴**

`name` 為 `physics-from-zero`，`private: true`，`type: module`。

```bash
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/react @types/react-dom
```

- [ ] **Step 3：設定檔**

- `vite.config.ts`：從 `vitest/config` import `defineConfig`；`base: '/physics-from-zero/'`；`plugins: [react()]`；`test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }`。
- `tsconfig.json`：`strict: true`、`jsx: react-jsx`、`moduleResolution: bundler`、`noEmit: true`、`include: ["src", "vite.config.ts"]`。
- `index.html`：`<html lang="zh-Hant">`、viewport meta、`<title>從零開始學物理</title>`。
- `.gitignore`：`node_modules`、`dist`、`.DS_Store`。
- `LICENSE`：MIT，`Copyright (c) 2026 duncan60`。
- `src/test/setup.ts`：`import '@testing-library/jest-dom/vitest'`。

- [ ] **Step 4：寫 smoke test**

```tsx
// src/App.test.tsx
it('顯示網站名稱', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '從零開始學物理' })).toBeInTheDocument();
});
```

- [ ] **Step 5：執行測試，確認失敗**

Run: `npm test`
Expected: FAIL（`App` 不存在）

- [ ] **Step 6：最小的 `App` 和 `main.tsx`**

`App` 先只顯示 `<h1>從零開始學物理</h1>`；`main.tsx` 用 `createRoot` 掛載，並 import `styles.css`。

- [ ] **Step 7：測試與建置**

Run: `npm test && npm run build`
Expected: 測試通過，`dist/index.html` 裡的資源路徑以 `/physics-from-zero/` 開頭。

- [ ] **Step 8：Commit**（包含 `docs/`）

```bash
git add -A
git commit -m "chore: 建立 Vite + React + TypeScript 專案骨架"
```

---

### Task 2：課程型別與答案判斷

**Files:**
- Create: `src/lib/types.ts`, `src/lib/answer.ts`
- Test: `src/lib/answer.test.ts`

**Interfaces:**
- Produces（`types.ts`）：

```ts
export interface ConceptStep { kind: 'concept'; id: string; title?: string; body: string[] }
export interface ChoiceOption { id: string; label: string; feedback?: string }
export interface ChoiceStep { kind: 'choice'; id: string; prompt: string; options: ChoiceOption[]; answer: string; explanation: string; guide?: GuideStep[] }
export interface WrongAnswer { value: number; feedback: string }
export interface NumberStep { kind: 'number'; id: string; prompt: string; answer: number; tolerance?: number; unit?: string; wrongAnswers?: WrongAnswer[]; explanation: string; guide?: GuideStep[] }
export type TableCell = string | { answer: number; tolerance?: number };
export interface TableRow { label: string; cells: TableCell[] }
export interface TableStep { kind: 'table'; id: string; prompt: string; columns: string[]; rows: TableRow[]; explanation: string; guide?: GuideStep[] }
export interface SimStep { kind: 'sim'; id: string; sim: 'bus-ball'; prompt: string }
export type QuestionStep = ChoiceStep | NumberStep | TableStep;
export type GuideStep = ConceptStep | ChoiceStep | NumberStep | TableStep; // 引導裡的題目不會再有 guide
export type Step = ConceptStep | QuestionStep | SimStep;
export interface Lesson { id: string; title: string; steps: Step[] }
export interface Station { id: number; title: string; lessons: Lesson[] } // lessons 為空代表「即將推出」
```

`TableRow.cells` 的長度等於 `columns.length`。`columns` 是時間這類的欄位標題，`label` 是每一列最左邊的標題。

- Produces（`answer.ts`）：

```ts
export type CheckResult = { correct: true } | { correct: false; feedback?: string };
export function parseNumberInput(raw: string): number | null;
export function checkChoice(step: ChoiceStep, optionId: string): CheckResult;
export function checkNumber(step: NumberStep, raw: string): CheckResult | 'invalid';
export function blankCells(step: TableStep): { row: number; col: number; answer: number; tolerance: number }[]; // 以列為主的順序
export function checkTable(step: TableStep, raws: string[]): { result: CheckResult; cellCorrect: boolean[] } | 'invalid';
```

- [ ] **Step 1：寫失敗的測試**

```ts
describe('parseNumberInput', () => {
  it.each([
    ['18', 18], [' 18 ', 18], ['１８', 18], ['-2', -2], ['－2', -2], ['−2', -2], ['+3', 3], ['2.5', 2.5], ['０．５', 0.5],
  ])('%s → %s', (raw, n) => expect(parseNumberInput(raw)).toBe(n));
  it.each(['', '  ', 'abc', '1,000', '--2', '2-'])('無法解析：%s', (raw) => expect(parseNumberInput(raw)).toBeNull());
});

describe('checkNumber', () => {
  const step: NumberStep = { kind: 'number', id: 'q', prompt: '', answer: 3, explanation: '', wrongAnswers: [{ value: 6, feedback: '用了相加' }] };
  it('答對', () => expect(checkNumber(step, '３')).toEqual({ correct: true }));
  it('已知錯誤給對應回饋', () => expect(checkNumber(step, '6')).toEqual({ correct: false, feedback: '用了相加' }));
  it('其他錯誤沒有回饋', () => expect(checkNumber(step, '5')).toEqual({ correct: false }));
  it('空白或無法解析的輸入回傳 invalid', () => expect(checkNumber(step, '')).toBe('invalid'));
  it('容許誤差', () => expect(checkNumber({ ...step, answer: 9.8, tolerance: 0.2 }, '10')).toEqual({ correct: true }));
});

describe('checkChoice', () => {
  const step: ChoiceStep = { kind: 'choice', id: 'q', prompt: '', answer: 'c', explanation: '', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', feedback: '推理對了，最後一步再看一次' }, { id: 'c', label: 'C' }] };
  it('答對', () => expect(checkChoice(step, 'c')).toEqual({ correct: true }));
  it('錯誤選項的回饋', () => expect(checkChoice(step, 'b')).toEqual({ correct: false, feedback: '推理對了，最後一步再看一次' }));
});

describe('checkTable', () => {
  const step: TableStep = { kind: 'table', id: 't', prompt: '', explanation: '', columns: ['0 秒', '1 秒', '2 秒'], rows: [{ label: '速度', cells: ['10', { answer: 8 }, { answer: 6 }] }] };
  it('列出空格', () => expect(blankCells(step).map((c) => c.col)).toEqual([1, 2]));
  it('全對', () => expect(checkTable(step, ['8', '6'])).toEqual({ result: { correct: true }, cellCorrect: [true, true] }));
  it('部分錯', () => expect(checkTable(step, ['6', '6'])).toEqual({ result: { correct: false }, cellCorrect: [false, true] }));
  it('有空格沒填就是 invalid', () => expect(checkTable(step, ['8', ''])).toBe('invalid'));
});
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx vitest run src/lib/answer.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3：實作 `types.ts` 和 `answer.ts`**

`parseNumberInput`：先把全形數字、全形句點「．」、全形加號、全形負號「－」、U+2212「−」轉成半形，去掉前後空白，再用 `/^[+-]?\d+(\.\d+)?$/` 檢查，最後用 `Number()` 轉換。比較數字時使用 `Math.abs(value - answer) <= tolerance + 1e-9`（多留 1e-9 吸收浮點誤差，讓容許範圍的兩端都算對），`tolerance` 預設是 0。

- [ ] **Step 4：執行，確認通過**

Run: `npx vitest run src/lib/answer.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/lib
git commit -m "feat: 課程型別與答案判斷"
```

---

### Task 3：進度、XP、連續天數、解鎖

**Files:**
- Create: `src/lib/progress.ts`
- Test: `src/lib/progress.test.ts`

**Interfaces:**
- Produces：

```ts
export interface Progress { version: 1; completed: string[]; xp: number; streak: number; lastActiveDay: string | null }
export const STORAGE_KEY = 'physics-from-zero:progress';
export function emptyProgress(): Progress;
export function getStorage(): Storage | null;                 // 存取 window.localStorage 時如果拋出例外，回傳 null
export function loadProgress(storage: Storage | null): Progress; // 有任何問題都回傳 emptyProgress()
export function saveProgress(storage: Storage | null, p: Progress): void; // 吞掉例外
export function localDayKey(d: Date): string;                // 本機時間的 'YYYY-MM-DD'
export function previousDay(day: string): string;
export function completeLesson(p: Progress, lessonId: string, xpGained: number, today: string): Progress; // 不改動原本的物件，回傳新物件
export function displayedStreak(p: Progress, today: string): number;
export function isLessonUnlocked(orderedLessonIds: string[], completed: string[], lessonId: string): boolean;
export const XP_PER_LESSON = 10;
export const XP_PER_FIRST_TRY = 5;
```

- [ ] **Step 1：寫失敗的測試**

```ts
it('localDayKey 補零', () => expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05'));
it('previousDay 跨月、跨年', () => { expect(previousDay('2026-03-01')).toBe('2026-02-28'); expect(previousDay('2026-01-01')).toBe('2025-12-31'); });

describe('completeLesson', () => {
  it('第一次完成', () => expect(completeLesson(emptyProgress(), '1-1', 20, '2026-10-19')).toEqual({ version: 1, completed: ['1-1'], xp: 20, streak: 1, lastActiveDay: '2026-10-19' }));
  it('同一天再完成不會重複加連續天數', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-19').streak).toBe(1); });
  it('隔天完成，連續天數 +1', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-20').streak).toBe(2); });
  it('中斷超過一天就重設為 1', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); expect(completeLesson(p, '1-2', 10, '2026-10-22').streak).toBe(1); });
  it('重上同一課不會重複記錄，但 XP 照加', () => { const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); const q = completeLesson(p, '1-1', 10, '2026-10-19'); expect(q.completed).toEqual(['1-1']); expect(q.xp).toBe(20); });
});

describe('displayedStreak', () => {
  const p = { ...emptyProgress(), streak: 3, lastActiveDay: '2026-10-19' };
  it('今天', () => expect(displayedStreak(p, '2026-10-19')).toBe(3));
  it('昨天（今天還來得及）', () => expect(displayedStreak(p, '2026-10-20')).toBe(3));
  it('前天以前就是 0', () => expect(displayedStreak(p, '2026-10-21')).toBe(0));
});

describe('loadProgress', () => {
  const fake = (value: string | null): Storage => ({ getItem: () => value } as unknown as Storage);
  it('沒有 storage', () => expect(loadProgress(null)).toEqual(emptyProgress()));
  it('沒有資料', () => expect(loadProgress(fake(null))).toEqual(emptyProgress()));
  it('JSON 壞掉', () => expect(loadProgress(fake('{oops'))).toEqual(emptyProgress()));
  it('版本不符', () => expect(loadProgress(fake('{"version":2}'))).toEqual(emptyProgress()));
  it('欄位型別不對', () => expect(loadProgress(fake('{"version":1,"completed":"x","xp":1,"streak":1,"lastActiveDay":null}'))).toEqual(emptyProgress()));
  it('getItem 拋出例外', () => expect(loadProgress({ getItem: () => { throw new Error('denied'); } } as unknown as Storage)).toEqual(emptyProgress()));
  it('正常資料可以來回存取', () => { const store = new Map<string, string>(); const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage; const p = completeLesson(emptyProgress(), '1-1', 10, '2026-10-19'); saveProgress(s, p); expect(loadProgress(s)).toEqual(p); });
  it('saveProgress 吞掉例外', () => expect(() => saveProgress({ setItem: () => { throw new Error('full'); } } as unknown as Storage, emptyProgress())).not.toThrow());
});

describe('isLessonUnlocked', () => {
  const order = ['1-1', '1-2', '1-3'];
  it('第一課永遠解鎖', () => expect(isLessonUnlocked(order, [], '1-1')).toBe(true));
  it('前一課完成才解鎖', () => { expect(isLessonUnlocked(order, [], '1-2')).toBe(false); expect(isLessonUnlocked(order, ['1-1'], '1-2')).toBe(true); });
  it('不存在的課程', () => expect(isLessonUnlocked(order, ['1-1'], '9-9')).toBe(false));
});
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx vitest run src/lib/progress.test.ts`
Expected: FAIL

- [ ] **Step 3：實作 `progress.ts`**

`previousDay` 以本機時間的 `new Date(y, m - 1, d - 1)` 計算，避免時區造成的誤差。

- [ ] **Step 4：執行，確認通過**

Run: `npx vitest run src/lib/progress.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/lib/progress.ts src/lib/progress.test.ts
git commit -m "feat: 進度、XP、連續天數與解鎖規則"
```

---

### Task 4：第 1 站課程內容

**Files:**
- Create: `src/content/stations.ts`, `src/content/lessons/1-1-inertia.ts`, `src/content/lessons/1-2-speed-position.ts`, `src/content/lessons/1-3-acceleration.ts`, `src/content/lessons/1-4-ball-thrown-up.ts`, `src/content/LICENSE.md`
- Test: `src/content/content.test.ts`

**Interfaces:**
- Consumes：Task 2 的型別。
- Produces：

```ts
export const stations: Station[];          // 7 站，依照 spec 的順序；只有第 1 站有課程
export const orderedLessonIds: string[];   // 所有課程依序排列：['1-1', '1-2', '1-3', '1-4']
export function findLesson(id: string): Lesson | undefined;
```

各站標題：`運動`、`力與牛頓定律`、`能量與動量`、`波動、聲音與熱`、`電與磁`、`光`、`近代物理`。
各課 id 與標題：`1-1 慣性`、`1-2 速度與位置`、`1-3 加速度`、`1-4 往上丟的球`。

- [ ] **Step 1：寫失敗的內容驗證測試**

```ts
const lessons = stations.flatMap((s) => s.lessons);
it('有 7 站，第 1 站有 4 課', () => { expect(stations).toHaveLength(7); expect(stations[0].lessons.map((l) => l.id)).toEqual(['1-1', '1-2', '1-3', '1-4']); });
it('orderedLessonIds 與各站課程一致', () => expect(orderedLessonIds).toEqual(lessons.map((l) => l.id)));
it('課程 id 不重複', () => expect(new Set(orderedLessonIds).size).toBe(orderedLessonIds.length));
describe.each(lessons.map((l) => [l.id, l] as const))('課程 %s', (_id, lesson) => {
  it('5 到 8 個步驟', () => { expect(lesson.steps.length).toBeGreaterThanOrEqual(5); expect(lesson.steps.length).toBeLessThanOrEqual(8); });
  it('步驟 id 不重複（包含引導裡的步驟）', () => { const ids = lesson.steps.flatMap((s) => [s.id, ...(('guide' in s && s.guide) ? s.guide.map((g) => g.id) : [])]); expect(new Set(ids).size).toBe(ids.length); });
  it('每一題都可以答', () => { for (const s of allQuestions(lesson)) assertAnswerable(s); });
  it('觀念卡不超過 150 字元', () => { for (const s of allConcepts(lesson)) expect(s.body.join('').length).toBeLessThanOrEqual(150); });
});
```

`allQuestions`、`allConcepts` 寫在測試檔裡：收集主步驟和 guide 裡的步驟。`assertAnswerable` 檢查：選擇題的 `answer` 對應到某個選項 id，而且選項 id 不重複；數字題的 `answer` 是有限數；表格題每一列的 `cells.length === columns.length`，而且至少有一個空格；`wrongAnswers` 裡沒有任何值等於正確答案。

- [ ] **Step 2：執行，確認失敗**

Run: `npx vitest run src/content`
Expected: FAIL

- [ ] **Step 3：撰寫 4 課的內容**

內容依照 spec 第 5 節。必須照著寫的部分：

- 1-1：步驟依序是等速丟球選擇題（答案：手上）→ 急煞車選擇題（答案：前方；「身後」選項的 `feedback` 先肯定推理，再指出錯在最後一步；`guide` 依照 spec：兩個數字題，分別是 6 和 4，最後一張觀念卡）→ `sim`（`bus-ball`；放在兩題都答完之後，讓學習者先只按「丟球」驗證第一題，再「丟球」加「急煞車」驗證第二題）→ 慣性觀念卡 → 身體往哪裡傾的選擇題（答案：往前）→「和在地面丟球一樣」觀念卡。
- 1-2：距離 = 速度 × 時間（觀念卡）→ 數字題 10×1 = 10 → 數字題 6×3 = 18 → 陷阱選擇題「速度比較快就一定在前面嗎？」（答案：不一定，並舉起點不同的反例）→ 觀念卡「位置要算出來」。
- 1-3：數字題「另一台公車」10 → 0 花 5 秒，每秒減少多少（答案 2；`wrongAnswers` 有 4，回饋說明這是 1-1 的 10 − 6；`guide`：觀念卡說明用每秒減 4 驗算，速度會變成負的 → 觀念卡「每一秒要減掉一樣多」，並示範 10 → 8 → 表格題填 6、4、2）→ 表格題 0 到 5 秒（10、8、6、4、2、0，中間 4 格空白）→ 加速度觀念卡（不要寫「負號就代表減速」）→ 數字題 0 → 18 花 6 秒（答案 3）→ 數字題 6 → 18 花 4 秒（答案 3；`wrongAnswers` 有 6，回饋說明要用「最後 − 一開始」）。
- 1-4：重力觀念卡 → 數字題「最高點時的速度」（答案 0；`guide` 是 spec 裡的速度表格題）→ 數字題「幾秒到最高點」（答案 1）→ 選擇題「最高點時的加速度」（答案 −10；「0」選項的回饋和 `guide` 使用反證法）→ 速度與加速度的觀念卡 → 負加速度觀念卡 → 選擇題「往下掉時是變快還是變慢」（答案：變快）→ 選擇題「加速度是 0 代表什麼」（答案：速度保持不變；「推力或拉力」和「靜止」兩個選項各有 spec 裡的回饋）。

用字要讓基礎不好的人看得懂：先問直覺，再說出名詞。每一題的 `explanation` 用一到兩句話說明為什麼。

`LICENSE.md` 說明：本資料夾的課程內容採用 CC BY-SA 4.0，附上授權連結和署名方式。

- [ ] **Step 4：執行，確認通過**

Run: `npx vitest run src/content && npx tsc --noEmit`
Expected: PASS，型別檢查沒有錯誤。

- [ ] **Step 5：Commit**

```bash
git add src/content
git commit -m "content: 第 1 站「運動」前四課"
```

---

### Task 5：公車與球的模擬

**Files:**
- Create: `src/sims/busBall.ts`, `src/sims/BusBallSim.tsx`
- Test: `src/sims/busBall.test.ts`

**Interfaces:**
- Produces：

```ts
export const BUS_SPEED = 10;      // 公尺/秒
export const THROW_UP_SPEED = 5;  // 公尺/秒，在空中正好 1 秒
export const GRAVITY = 10;        // 公尺/秒²
export const BRAKE_DECEL = 8;     // 公尺/秒²，煞車後第 1 秒公車走 6 公尺，和 1-1 的數字一致
export const FLIGHT_TIME = 1;
export function busSpeed(t: number, brakeAt: number | null): number;
export function busPosition(t: number, brakeAt: number | null): number;  // t=0 時位置是 0；煞車後減速到 0 就停住，不會倒退
export function ballPosition(t: number, throwAt: number, brakeAt: number | null): { x: number; y: number; landed: boolean };
export function landingOffset(throwAt: number, brakeAt: number | null): number; // 落地時球的 x 減去公車的 x；正數代表在手的前方
export function BusBallSim(): JSX.Element;
```

- [ ] **Step 1：寫失敗的測試**

```ts
it('沒有煞車，球落回手上', () => expect(landingOffset(0, null)).toBeCloseTo(0));
it('丟球的同時煞車，球落在前方 4 公尺', () => expect(landingOffset(0, 0)).toBeCloseTo(4));
it('球飛到一半才煞車，落在前方但不到 4 公尺', () => { const d = landingOffset(0, 0.5); expect(d).toBeGreaterThan(0); expect(d).toBeLessThan(4); });
it('公車已經停住才丟，落回手上', () => expect(landingOffset(5, 0)).toBeCloseTo(0));
it('煞車後不會倒退', () => expect(busPosition(100, 0)).toBeCloseTo(6.25));
it('球在 1 秒後落地', () => { expect(ballPosition(0.5, 0, null).landed).toBe(false); expect(ballPosition(1, 0, null).landed).toBe(true); expect(ballPosition(0.5, 0, null).y).toBeCloseTo(1.25); });
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx vitest run src/sims`
Expected: FAIL

- [ ] **Step 3：實作 `busBall.ts`**

球離手的瞬間，水平速度等於當下的公車速度，之後保持不變（慣性）。

- [ ] **Step 4：執行，確認通過**

Run: `npx vitest run src/sims`
Expected: PASS

- [ ] **Step 5：實作 `BusBallSim.tsx`**

使用 SVG 和 `requestAnimationFrame`，以**乘客的視角**呈現：公車固定在畫面中，地面的標線往後捲動，球的位置是相對於公車的 `x`。按鈕有「丟球」、「急煞車」、「重來」。球落地後，用文字顯示「落在手上」或「落在你前方 X 公尺」（四捨五入到小數點後一位）。動畫時間以秒為單位，速度與真實時間相同。尊重 `prefers-reduced-motion`：開啟時直接顯示結果，不播放動畫。

- [ ] **Step 6：Commit**

```bash
git add src/sims
git commit -m "feat: 公車與球的互動模擬"
```

---

### Task 6：上課流程（題目、引導、完成）

**Files:**
- Create: `src/components/LessonPlayer.tsx`, `src/components/QuestionCard.tsx`, `src/components/GuideRunner.tsx`, `src/components/steps/ConceptView.tsx`, `src/components/steps/ChoiceInput.tsx`, `src/components/steps/NumberInput.tsx`, `src/components/steps/TableInput.tsx`
- Test: `src/components/LessonPlayer.test.tsx`

**Interfaces:**
- Consumes：Task 2 的型別和檢查函式；Task 3 的 `XP_PER_LESSON`、`XP_PER_FIRST_TRY`；Task 5 的 `BusBallSim`。
- Produces：

```ts
export function LessonPlayer(props: { lesson: Lesson; onComplete: (xpGained: number) => void; onExit: () => void }): JSX.Element;
export function QuestionCard(props: { step: QuestionStep; onFinish: (cleanFirstTry: boolean) => void; onRequestGuide?: () => void }): JSX.Element;
export function GuideRunner(props: { steps: GuideStep[]; onDone: () => void }): JSX.Element;
```

**流程（固定的介面文字）：**
- 上方：「離開」按鈕和進度條（目前步驟 ÷ 總步驟數）。
- 觀念卡和模擬：按鈕「繼續」。
- 題目：按鈕「檢查」。輸入無效時，在欄位旁邊顯示「請先輸入數字」（表格題也一樣）或「請先選一個答案」，不算答錯。
- 答對：顯示「答對了」和 `explanation`，按鈕「繼續」。
- 答錯：顯示「還不對」，如果有 `feedback` 也一併顯示。主要按鈕：有 `guide` 時是「一步一步來」，沒有時是「再試一次」。次要按鈕：「看解答」。
- 「一步一步來」：進入 `GuideRunner`，依序跑完引導步驟。引導裡的題目答錯時，只會顯示「再試一次」和「看解答」。跑完後回到原題，題目重新出現，可以重答。
- 「看解答」：顯示正確答案和 `explanation`，按鈕「繼續」。
- 表格題答錯時，標示出哪幾格錯了。
- XP：每一題只要「第一次就答對、沒有用引導、沒有看解答」，就得到 `XP_PER_FIRST_TRY`；完成一課再加 `XP_PER_LESSON`。
- 完成畫面：「完成這一課」、本課獲得的 XP、按鈕「回到地圖」。按下按鈕時呼叫 `onComplete(xp)`。
- 「離開」：呼叫 `onExit()`，不呼叫 `onComplete`。

- [ ] **Step 1：寫失敗的測試**

用測試專用的課程資料（不要依賴真實內容）：一張觀念卡 → 一題有 `guide` 的選擇題（答案 `c`，`b` 的 feedback 是「最後一步再看一次」，`guide` 是一題答案為 4 的數字題）→ 一題數字題（答案 3）。

```tsx
it('完整流程：答錯 → 引導 → 重答 → 完成，並計算 XP', async () => {
  // 觀念卡按「繼續」
  // 選擇題選 b，按「檢查」→ 看到「還不對」和「最後一步再看一次」
  // 按「一步一步來」→ 數字題輸入 4，按「檢查」→「答對了」→「繼續」
  // 回到原題，選 c，按「檢查」→「答對了」→「繼續」
  // 數字題輸入「３」→「檢查」→「繼續」
  // 看到「完成這一課」，按「回到地圖」
  expect(onComplete).toHaveBeenCalledWith(15); // 10 + 只有數字題第一次就答對的 5
});
it('沒有輸入就按檢查，會出現提示，而且不算答錯', ...); // 之後答對，XP 仍然算第一次就答對
it('看解答後繼續，那一題沒有 XP', ...);
it('中途按離開，只呼叫 onExit', ...);
it('表格題標出答錯的格子', ...);
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx vitest run src/components`
Expected: FAIL

- [ ] **Step 3：實作元件**

`LessonPlayer` 記錄目前的步驟 index、是否在引導中、每一題是否「乾淨」答對。從引導回到原題時，用新的 `key` 重新掛載 `QuestionCard`，並把這一題標記為「不是第一次就答對」。

- [ ] **Step 4：執行，確認通過**

Run: `npx vitest run src/components`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/components
git commit -m "feat: 上課流程，含答錯引導與看解答"
```

---

### Task 7：路線地圖、頁首頁尾、路由與樣式

**Files:**
- Create: `src/lib/router.ts`, `src/components/PathMap.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`
- Modify: `src/App.tsx`, `src/styles.css`, `src/App.test.tsx`

**Interfaces:**
- Consumes：Task 3 的所有進度函式；Task 4 的 `stations`、`orderedLessonIds`、`findLesson`；Task 6 的 `LessonPlayer`。
- Produces：

```ts
export type Route = { name: 'map' } | { name: 'lesson'; id: string };
export function parseHash(hash: string): Route;           // '#/lesson/1-2' → lesson；其他情況一律回傳 map
export function useHashRoute(): [Route, (r: Route) => void];
export function PathMap(props: { progress: Progress; onOpen: (lessonId: string) => void }): JSX.Element;
export function Header(props: { xp: number; streak: number }): JSX.Element;
```

- `App` 啟動時用 `loadProgress(getStorage())` 載入進度；完成一課時呼叫 `completeLesson(..., localDayKey(new Date()))`，存檔後回到地圖。
- 課程頁面：找不到課程時顯示「找不到這一課」；尚未解鎖時顯示「這一課還沒解鎖，先完成前面的課」；兩種情況都有「回到地圖」按鈕。
- 地圖：每一站顯示標題；有課程的站，用一條蜿蜒的路線列出各課，並用三種狀態標示：已完成、可以上（目前這一課要醒目）、鎖住。沒有課程的站顯示「即將推出」。
- 頁首：網站名稱 `<h1>從零開始學物理</h1>`、連續天數（`displayedStreak`）、XP。
- 頁尾：署名文字，以及授權說明（程式 MIT、內容 CC BY-SA 4.0）和 GitHub repo 連結。
- 樣式：在 `:root` 定義色彩變數，主色使用綠色系，並用 `prefers-color-scheme: dark` 定義深色版本。內容最大寬度約 560px，手機左右留 16px。按鈕至少 44px 高。

- [ ] **Step 1：寫失敗的測試**

```tsx
it('parseHash', () => { expect(parseHash('#/lesson/1-2')).toEqual({ name: 'lesson', id: '1-2' }); expect(parseHash('')).toEqual({ name: 'map' }); expect(parseHash('#/whatever')).toEqual({ name: 'map' }); });
it('地圖：第一課可以上，第二課鎖住，第 2 站即將推出', ...);
it('網址是不存在的課程，顯示「找不到這一課」和「回到地圖」', ...);      // 設定 window.location.hash = '#/lesson/9-9' 後再 render
it('網址是尚未解鎖的課程，顯示「這一課還沒解鎖」', ...);              // '#/lesson/1-3'，沒有任何進度
it('localStorage 拋出例外時，地圖照常顯示', ...);                     // vi.spyOn(window, 'localStorage', 'get') 讓它拋出例外
```

- [ ] **Step 2：執行，確認失敗**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL

- [ ] **Step 3：實作 router、PathMap、Header、Footer、App 和樣式**

- [ ] **Step 4：全部測試與建置**

Run: `npm test && npm run build`
Expected: 全部 PASS，建置成功。

- [ ] **Step 5：在瀏覽器裡實際看過**

Run: `npm run dev`，在瀏覽器裡用 375px 和桌機寬度實際檢查：完整上一次 1-1（包含答錯 → 引導）、重新整理課程頁面、切換深色模式。不可以出現水平捲軸。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat: 路線地圖、頁首頁尾、路由與全站樣式"
```

---

### Task 8：README、部署與上線

**Files:**
- Create: `README.md`, `.github/workflows/deploy.yml`

- [ ] **Step 1：README（繁體中文）**

內容包含：網站是什麼、線上網址、署名文字、在本機執行的方式（`npm install`、`npm run dev`、`npm test`）、怎麼新增一課（在 `src/content/lessons/` 新增檔案，並在 `stations.ts` 註冊，最後執行 `npm test`）、授權說明。

- [ ] **Step 2：`deploy.yml`**

在 push 到 `main` 和手動觸發（`workflow_dispatch`）時執行。`permissions: { contents: read, pages: write, id-token: write }`。Job `build`：`actions/checkout@v4` → `actions/setup-node@v4`（`node-version: 22`、`cache: npm`）→ `npm ci` → `npm test` → `npm run build` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3`（`path: dist`）。Job `deploy`：`needs: build`、`environment: github-pages`、`actions/deploy-pages@v4`。

- [ ] **Step 3：Commit**

```bash
git add README.md .github
git commit -m "docs: README 與 GitHub Pages 部署流程"
```

- [ ] **Step 4：建立公開 repo、開啟 Pages、推送**

```bash
GH_TOKEN=$(gh auth token --user duncan60) gh repo create duncan60/physics-from-zero --public --description "Duolingo 風格的物理入門網站，從零開始，一題一題學"
git remote add origin git@duncan60-GitHub:duncan60/physics-from-zero.git
git push -u origin main
GH_TOKEN=$(gh auth token --user duncan60) gh api -X POST repos/duncan60/physics-from-zero/pages -f build_type=workflow
```

如果在開啟 Pages 之前，第一次的部署就已經失敗，開啟後執行 `GH_TOKEN=... gh workflow run deploy.yml -R duncan60/physics-from-zero`。

- [ ] **Step 5：確認上線**

Run: `GH_TOKEN=... gh run watch -R duncan60/physics-from-zero`，接著用瀏覽器開啟 `https://duncan60.github.io/physics-from-zero/`。
Expected: workflow 成功；網站可以打開，能上 1-1，重新整理 `#/lesson/1-1` 仍然正常；GitHub 上的 commit 作者顯示為 duncan60。
