/**
 * 速度–時間圖（components/steps/VtGraphView）：時間軸 0～tMax 秒（每 1 秒一格）、速度軸 0～vMax 公尺/秒（每 vStep 一格）。
 * lines：一條或多條折線，每條是依時間嚴格遞增的 [秒, 公尺/秒] 點（至少 2 個），label 是寫在線旁邊的短標籤，
 * shadeBelow 把線底下到時間軸的面積塗色。box：從 (0, 0) 到 (t, v) 的虛線長方形（說明三角形是長方形的一半時用）。
 * caption：給螢幕閱讀器念的文字說明（畫面上不顯示），描述圖上有什麼（例如每個點的數值），不能洩漏題目的答案。
 * 範圍與排序由 content.test.ts 檢查。
 */
export interface VtLine { points: [number, number][]; label?: string; shadeBelow?: boolean }
export interface VtGraph { tMax: number; vMax: number; vStep: number; lines: VtLine[]; box?: { t: number; v: number }; caption: string }
// 觀念卡、選擇題、數字題、表格題可以帶一張速度–時間圖（graph），畫在內文或題目文字下面、繼續按鈕或作答區上面；引導裡的步驟也一樣。
export interface ConceptStep { kind: 'concept'; id: string; title?: string; body: string[]; graph?: VtGraph }
export interface ChoiceOption { id: string; label: string; feedback?: string }
export interface ChoiceStep { kind: 'choice'; id: string; prompt: string; options: ChoiceOption[]; answer: string; explanation: string; guide?: GuideStep[]; graph?: VtGraph }
export interface WrongAnswer { value: number; feedback: string }
export interface NumberStep { kind: 'number'; id: string; prompt: string; answer: number; tolerance?: number; unit?: string; wrongAnswers?: WrongAnswer[]; explanation: string; guide?: GuideStep[]; graph?: VtGraph }
export type TableCell = string | { answer: number; tolerance?: number };
export interface TableRow { label: string; cells: TableCell[] }
// retryHint（可選）：答錯時「還不對」下面的提示，取代通用的表格提示（那一句是寫給「每一格依序變化」的表格的）。只指方向，不說出答案。
export interface TableStep { kind: 'table'; id: string; prompt: string; columns: string[]; rows: TableRow[]; explanation: string; guide?: GuideStep[]; graph?: VtGraph; retryHint?: string }
export interface SimStep { kind: 'sim'; id: string; sim: 'bus-ball'; prompt: string }
export interface FormulaWrongForm { tokens: string[]; feedback: string }
// 算對、但寫法比正式寫法省略了什麼（例如省略 + 0）：tokens 要是 accepted 裡的某一種寫法（不是第一個），note 是算式下面一則中性的「提醒」（算式拼對、進到第 2 步時就出現），輕輕說明正式寫法。
export interface FormulaAcceptedNote { tokens: string[]; note: string }
// 拼算式 + 算答案：先用 tiles 拼出算式（accepted 任一寫法才算對），再填算出來的數字（answer 等欄位和 NumberStep 一樣）。
// tileLabels（可選）和 tiles 一一對應：每一塊磚塊的小字標示（例如「力」「質量」「月球 g」），沒有標示的是 undefined。
// 畫面上寫在數字下方，也加進按鈕的名稱（「放入 20（力）」）。只有數字磚塊可以有標示；同一題裡數值相同的數字磚塊一定要有標示、而且標示不同（內容測試檢查）；標示不能洩漏答案。
// 有標示的磚塊在 accepted、wrongForms、acceptedNotes 裡寫成「數值|標示」（例如 '20|力'，見 lib/formula 的 tileToken），照用途判斷、不只看數值：
// 20|滿車質量 ÷ 20|力 算出來碰巧和 20|力 ÷ 20|滿車質量 一樣，但不是同一個算式。沒有標示的題目照舊只寫數值。
export interface FormulaStep { kind: 'formula'; id: string; prompt: string; tiles: string[]; tileLabels?: (string | undefined)[]; accepted: string[][]; wrongForms?: FormulaWrongForm[]; acceptedNotes?: FormulaAcceptedNote[]; answer: number; tolerance?: number; unit?: string; wrongAnswers?: WrongAnswer[]; explanation: string; guide?: GuideStep[] }
// anim 'cart'：滑桿上方畫一台購物車和推它的力的箭頭（長度跟著滑桿的值）；按「檢查」後購物車用 a = F ÷ m 往前加速。
// cartMass 是購物車的質量（公斤），畫面上標示出來、用來算加速度；要和題目裡說的質量一樣（content.test.ts 會檢查）。
export interface SliderStep { kind: 'slider'; id: string; prompt: string; quantity: string; unit: string; min: number; max: number; step: number; initial: number; answer: number; tolerance?: number; tooLow: string; tooHigh: string; explanation: string; anim: 'cart'; cartMass?: number; guide?: GuideStep[] }
export interface MatchPair { left: string; right: string }
export interface MatchStep { kind: 'match'; id: string; prompt: string; pairs: MatchPair[]; explanation: string } // 沒有 guide、沒有看解答
export type QuestionStep = ChoiceStep | NumberStep | TableStep | FormulaStep | SliderStep;
export type GuideStep = ConceptStep | ChoiceStep | NumberStep | TableStep; // 引導裡的題目不會再有 guide
export type Step = ConceptStep | QuestionStep | SimStep | MatchStep;
export interface Lesson { id: string; title: string; steps: Step[] }
export interface Station { id: number; title: string; lessons: Lesson[] } // lessons 為空代表「即將推出」

/**
 * 一站的重點總結與複習（`src/content/reviews/站號-英文名稱.ts`，export default）。
 * 總結頁顯示 points（重點）、formulas（公式表）、traps（常見陷阱：錯的想法 → 正確的想法）；
 * 按「開始複習」後，steps 包裝成一課（id `review-站號`）照一般上課流程進行。
 */
export interface StationReview {
  stationId: number;
  points: string[];
  formulas: { name: string; formula: string }[];
  traps: { wrong: string; right: string }[];
  steps: Step[];
}

/**
 * 按一次「檢查」（或配一對）的結果：
 * correct：這一題答對了；partial：對了一部分，題目還沒結束（拼算式拼對了算式、配對配對了一對但還沒配完）；wrong：答錯了。
 */
export type CheckOutcome = 'correct' | 'partial' | 'wrong';
