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
