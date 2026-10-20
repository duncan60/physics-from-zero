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
// 拼算式 + 算答案：先用 tiles 拼出算式（accepted 任一寫法才算對），再填算出來的數字（answer 等欄位和 NumberStep 一樣）。
export interface FormulaStep { kind: 'formula'; id: string; prompt: string; tiles: string[]; accepted: string[][]; wrongForms?: FormulaWrongForm[]; answer: number; tolerance?: number; unit?: string; wrongAnswers?: WrongAnswer[]; explanation: string; guide?: GuideStep[] }
export interface SliderStep { kind: 'slider'; id: string; prompt: string; quantity: string; unit: string; min: number; max: number; step: number; initial: number; answer: number; tolerance?: number; tooLow: string; tooHigh: string; explanation: string; anim: 'cart'; guide?: GuideStep[] }
export interface MatchPair { left: string; right: string }
export interface MatchStep { kind: 'match'; id: string; prompt: string; pairs: MatchPair[]; explanation: string } // 沒有 guide、沒有看解答
export type QuestionStep = ChoiceStep | NumberStep | TableStep | FormulaStep | SliderStep;
export type GuideStep = ConceptStep | ChoiceStep | NumberStep | TableStep; // 引導裡的題目不會再有 guide
export type Step = ConceptStep | QuestionStep | SimStep | MatchStep;
export interface Lesson { id: string; title: string; steps: Step[] }
export interface Station { id: number; title: string; lessons: Lesson[] } // lessons 為空代表「即將推出」
