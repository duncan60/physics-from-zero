export interface ConceptStep { kind: 'concept'; id: string; title?: string; body: string[] }
export interface ChoiceOption { id: string; label: string; feedback?: string }
export interface ChoiceStep { kind: 'choice'; id: string; prompt: string; options: ChoiceOption[]; answer: string; explanation: string; guide?: GuideStep[] }
export interface WrongAnswer { value: number; feedback: string }
export interface NumberStep { kind: 'number'; id: string; prompt: string; answer: number; tolerance?: number; unit?: string; wrongAnswers?: WrongAnswer[]; explanation: string; guide?: GuideStep[] }
export type TableCell = string | { answer: number; tolerance?: number };
export interface TableRow { label: string; cells: TableCell[] }
export interface TableStep { kind: 'table'; id: string; prompt: string; columns: string[]; rows: TableRow[]; explanation: string; guide?: GuideStep[] }
export interface SimStep { kind: 'sim'; id: string; sim: 'bus-ball'; prompt: string }
export interface FormulaWrongForm { tokens: string[]; feedback: string }
// 算對、但寫法比正式寫法省略了什麼（例如省略 + 0）：tokens 要是 accepted 裡的某一種寫法（不是第一個），note 是算式下面一則中性的「提醒」（算式拼對、進到第 2 步時就出現），輕輕說明正式寫法。
export interface FormulaAcceptedNote { tokens: string[]; note: string }
// 拼算式 + 算答案：先用 tiles 拼出算式（accepted 任一寫法才算對），再填算出來的數字（answer 等欄位和 NumberStep 一樣）。
export interface FormulaStep { kind: 'formula'; id: string; prompt: string; tiles: string[]; accepted: string[][]; wrongForms?: FormulaWrongForm[]; acceptedNotes?: FormulaAcceptedNote[]; answer: number; tolerance?: number; unit?: string; wrongAnswers?: WrongAnswer[]; explanation: string; guide?: GuideStep[] }
export interface SliderStep { kind: 'slider'; id: string; prompt: string; quantity: string; unit: string; min: number; max: number; step: number; initial: number; answer: number; tolerance?: number; tooLow: string; tooHigh: string; explanation: string; anim: 'cart'; guide?: GuideStep[] }
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
