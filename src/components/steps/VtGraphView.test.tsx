import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ChoiceStep, ConceptStep, NumberStep, QuestionStep, TableStep, VtGraph } from '../../lib/types';
import { GuideRunner } from '../GuideRunner';
import { QuestionCard } from '../QuestionCard';
import { ConceptView } from './ConceptView';
import { VtGraphView } from './VtGraphView';

// 測試專用的圖，不依賴真實課程內容。

/** 兩條線：一條從 0 加速到 10（塗色、有虛線長方形），一條一直是 6（中間多一個點）。 */
const graph: VtGraph = {
  tMax: 3,
  vMax: 10,
  vStep: 2,
  lines: [
    { points: [[0, 0], [2, 10]], label: '加速', shadeBelow: true },
    { points: [[0, 6], [1, 6], [3, 6]], label: '等速' },
  ],
  box: { t: 2, v: 10 },
  caption: '速度–時間圖：一條線從 0 秒、0 公尺/秒直直升到 2 秒、10 公尺/秒；另一條線一直是 6 公尺/秒。',
};

/** 只有一條線，沒有塗色、沒有虛線長方形、沒有標籤。 */
const plain: VtGraph = {
  tMax: 2,
  vMax: 10,
  vStep: 5,
  lines: [{ points: [[0, 10], [2, 10]] }],
  caption: '速度–時間圖：一條平的線，一直是 10 公尺/秒。',
};

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('沒有畫出 SVG');
  return svg;
}

/** 「x,y x,y …」→ [[x, y], …] */
function pairs(points: string | null): [number, number][] {
  return (points ?? '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number) as [number, number]);
}

function dots(line: Element): [number, number][] {
  return [...line.querySelectorAll('circle')].map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
}

const texts = (nodes: NodeListOf<Element>): string[] => [...nodes].map((n) => n.textContent ?? '');

// ---- 圖本身 ----

it('是一張圖：role="img"，名稱是 caption；caption 不顯示成畫面上的文字', () => {
  render(<VtGraphView graph={graph} />);
  expect(screen.getByRole('img', { name: graph.caption })).toBeInTheDocument();
  expect(screen.queryByText(graph.caption)).not.toBeInTheDocument();
});

it('用 viewBox 畫、寬度跟著卡片（100%）', () => {
  const { container } = render(<VtGraphView graph={graph} />);
  const svg = svgOf(container);
  expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
  expect(svg.getAttribute('width')).toBe('100%');
});

it('座標軸寫「時間（秒）」「速度（公尺/秒）」；時間每 1 秒、速度每 vStep 一格都標數字', () => {
  const { container } = render(<VtGraphView graph={graph} />);
  expect(screen.getByText('時間（秒）')).toBeInTheDocument();
  expect(screen.getByText('速度（公尺/秒）')).toBeInTheDocument();
  expect(texts(container.querySelectorAll('.lp-vt-tick--t'))).toEqual(['0', '1', '2', '3']);
  expect(texts(container.querySelectorAll('.lp-vt-tick--v'))).toEqual(['0', '2', '4', '6', '8', '10']);
});

it('速度的格子不是整數時，數字也不會有浮點誤差', () => {
  const { container } = render(<VtGraphView graph={{ ...plain, vMax: 0.6, vStep: 0.2, lines: [{ points: [[0, 0.2], [2, 0.6]] }] }} />);
  expect(texts(container.querySelectorAll('.lp-vt-tick--v'))).toEqual(['0', '0.2', '0.4', '0.6']);
});

it('速度的格子很多時，圖變高，數字不會擠在一起（每一格至少 20）', () => {
  const { container } = render(<VtGraphView graph={{ ...plain, vStep: 1 }} />);
  const ys = [...container.querySelectorAll('.lp-vt-tick--v')].map((n) => Number(n.getAttribute('y')));
  expect(ys).toHaveLength(11);
  for (let i = 1; i < ys.length; i++) expect(ys[i - 1] - ys[i]).toBeGreaterThanOrEqual(20 - 1e-6);
});

it('每條線畫一條折線，每個點一個圓點，折線穿過每個圓點', () => {
  const { container } = render(<VtGraphView graph={graph} />);
  const lines = container.querySelectorAll('.lp-vt-line');
  expect(lines).toHaveLength(graph.lines.length);
  for (const [i, line] of [...lines].entries()) {
    const polylines = line.querySelectorAll('polyline');
    expect(polylines).toHaveLength(1);
    expect(line.querySelectorAll('circle')).toHaveLength(graph.lines[i].points.length);
    expect(pairs(polylines[0].getAttribute('points'))).toEqual(dots(line));
  }
});

it('刻度的數字和點用同一把尺：「2」和 2 秒的點左右對齊，「10」和 10 公尺/秒的點的高度差在每張圖都一樣', () => {
  // 三張圖的比例都不一樣：右邊的留白（標籤長短）不同、速度的格子數（圖的高度）不同，
  // 而且 10 不一定在最上面（在最上面時，比例尺錯了也看不出來）。每張圖第一條線的第 2 個點都是 (2, 10)。
  const graphs: VtGraph[] = [
    graph,
    { ...plain, tMax: 4, vMax: 20, vStep: 5, lines: [{ points: [[0, 0], [2, 10], [4, 20]], label: '很長的標籤' }] },
    { ...plain, tMax: 3, vMax: 11, vStep: 1, lines: [{ points: [[0, 0], [2, 10]] }] },
  ];
  const offsets = graphs.map((g) => {
    const { container, unmount } = render(<VtGraphView graph={g} />);
    const [cx, cy] = dots(container.querySelectorAll('.lp-vt-line')[0])[1];
    const tick = (selector: string, text: string) => [...container.querySelectorAll(selector)].find((n) => n.textContent === text);
    const two = tick('.lp-vt-tick--t', '2');
    const ten = tick('.lp-vt-tick--v', '10');
    expect(two).toBeDefined();
    expect(ten).toBeDefined();
    expect(Number(two?.getAttribute('x'))).toBe(cx);
    // 兩個座標都是比例尺算出來的小數，相減會有浮點誤差；取到小數第 2 位再比，看的是畫面上的位置。
    const offset = Math.round((Number(ten?.getAttribute('y')) - cy) * 100) / 100;
    unmount();
    return offset;
  });
  expect(new Set(offsets).size).toBe(1);
});

it('時間越大越右邊、速度越大越上面，全部畫在 viewBox 裡面', () => {
  const { container } = render(<VtGraphView graph={graph} />);
  const [, , width, height] = (svgOf(container).getAttribute('viewBox') ?? '').split(' ').map(Number);
  const lines = container.querySelectorAll('.lp-vt-line');
  // 第一條線：(0, 0) → (2, 10)
  const [[x0, y0], [x1, y1]] = dots(lines[0]);
  expect(x1).toBeGreaterThan(x0);
  expect(y1).toBeLessThan(y0);
  // 第二條線是平的：三個點一樣高
  const flat = dots(lines[1]);
  expect(new Set(flat.map(([, y]) => y)).size).toBe(1);
  // (0, 0) 在兩軸的交點：和第二條線 0 秒的點一樣左邊
  expect(flat[0][0]).toBe(x0);
  for (const [x, y] of [...dots(lines[0]), ...flat]) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(width);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(height);
  }
});

it('線的短標籤寫在圖上；沒有標籤就不寫', () => {
  const { container, unmount } = render(<VtGraphView graph={graph} />);
  expect(texts(container.querySelectorAll('.lp-vt-label'))).toEqual(['加速', '等速']);
  unmount();
  const second = render(<VtGraphView graph={plain} />);
  expect(second.container.querySelectorAll('.lp-vt-label')).toHaveLength(0);
});

it('shadeBelow：那條線底下到時間軸塗色；沒有 shadeBelow 的線不塗', () => {
  const { container, unmount } = render(<VtGraphView graph={graph} />);
  const shades = container.querySelectorAll('.lp-vt-shade');
  expect(shades).toHaveLength(1);
  expect(shades[0].getAttribute('data-line')).toBe('0');
  // 線上的點，加上最後和一開始在時間軸上的兩個點
  const shade = pairs(shades[0].getAttribute('points'));
  const line = dots(container.querySelectorAll('.lp-vt-line')[0]);
  expect(shade).toHaveLength(line.length + 2);
  expect(shade.slice(0, line.length)).toEqual(line);
  expect(shade[line.length]).toEqual([line[line.length - 1][0], line[0][1]]); // (2 秒, 0) 在時間軸上
  expect(shade[line.length + 1]).toEqual(line[0]); // (0 秒, 0)
  unmount();
  const second = render(<VtGraphView graph={plain} />);
  expect(second.container.querySelectorAll('.lp-vt-shade')).toHaveLength(0);
});

it('box：從 (0, 0) 到 (t, v) 的虛線長方形；沒有 box 就不畫', () => {
  const { container, unmount } = render(<VtGraphView graph={graph} />);
  const boxes = container.querySelectorAll('rect.lp-vt-box');
  expect(boxes).toHaveLength(1);
  const box = boxes[0];
  expect(box.getAttribute('stroke-dasharray')).toBeTruthy();
  // 左下角在原點 (0, 0)，右上角在 (2 秒, 10 公尺/秒)，也就是第一條線最後一個點
  const [[ox, oy], [tx, ty]] = dots(container.querySelectorAll('.lp-vt-line')[0]);
  const x = Number(box.getAttribute('x'));
  const y = Number(box.getAttribute('y'));
  expect(x).toBe(ox);
  expect(y).toBe(ty);
  expect(x + Number(box.getAttribute('width'))).toBeCloseTo(tx, 6);
  expect(y + Number(box.getAttribute('height'))).toBeCloseTo(oy, 6);
  unmount();
  const second = render(<VtGraphView graph={plain} />);
  expect(second.container.querySelectorAll('.lp-vt-box')).toHaveLength(0);
});

it('沒有動畫', () => {
  const { container } = render(<VtGraphView graph={graph} />);
  expect(container.querySelector('animate, animateTransform, animateMotion, set')).toBeNull();
});

// ---- 觀念卡、題目、引導帶 graph 時顯示圖 ----

const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
const isBefore = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & FOLLOWING) !== 0;

const concept: ConceptStep = { kind: 'concept', id: 'look', title: '看圖', body: ['橫的是時間，直的是速度。'] };
const choice: ChoiceStep = {
  kind: 'choice',
  id: 'which',
  prompt: '哪一條線的速度一直不變？',
  options: [
    { id: 'a', label: '加速的那條' },
    { id: 'b', label: '平的那條' },
  ],
  answer: 'b',
  explanation: '平的線，速度一直一樣。',
};
const number: NumberStep = { kind: 'number', id: 'height', prompt: '平的線有多高？', answer: 6, unit: '公尺/秒', explanation: '一直是 6 公尺/秒。' };
const table: TableStep = {
  kind: 'table',
  id: 'read',
  prompt: '從圖上讀出速度。',
  columns: ['時間（秒）', '速度（公尺/秒）'],
  rows: [
    { label: '第 1 個點', cells: ['0', '6'] },
    { label: '第 2 個點', cells: ['1', { answer: 6 }] },
  ],
  explanation: '平的線，每一秒都是 6。',
};

it('觀念卡帶 graph：圖在內文下面、「繼續」上面；不帶就沒有圖', () => {
  const { unmount } = render(<ConceptView step={{ ...concept, graph }} onContinue={vi.fn()} />);
  const img = screen.getByRole('img', { name: graph.caption });
  expect(isBefore(screen.getByText('橫的是時間，直的是速度。'), img)).toBe(true);
  expect(isBefore(img, screen.getByRole('button', { name: '繼續' }))).toBe(true);
  unmount();
  const { container } = render(<ConceptView step={concept} onContinue={vi.fn()} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(container.querySelector('svg')).toBeNull();
});

it.each([
  ['選擇題', choice],
  ['數字題', number],
  ['表格題', table],
] as [string, ChoiceStep | NumberStep | TableStep][])('%s帶 graph：圖在題目文字下面、作答區上面；不帶就沒有圖', (_name, step) => {
  const withGraph: QuestionStep = { ...step, graph };
  const { container, unmount } = render(<QuestionCard step={withGraph} onFinish={vi.fn()} />);
  const img = screen.getByRole('img', { name: graph.caption });
  const prompt = screen.getByText(step.prompt);
  const answer = container.querySelector('.lp-answer');
  expect(answer).not.toBeNull();
  expect(isBefore(prompt, img)).toBe(true);
  expect(isBefore(img, answer as Element)).toBe(true);
  expect(answer?.contains(img)).toBe(false);
  unmount();
  const second = render(<QuestionCard step={step} onFinish={vi.fn()} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(second.container.querySelector('svg')).toBeNull();
});

it('引導裡的觀念卡和題目帶 graph 時也會顯示圖', () => {
  const { unmount } = render(<GuideRunner steps={[{ ...concept, graph }]} onDone={vi.fn()} />);
  expect(screen.getByRole('img', { name: graph.caption })).toBeInTheDocument();
  unmount();
  render(<GuideRunner steps={[{ ...number, graph: plain }]} onDone={vi.fn()} />);
  expect(screen.getByRole('img', { name: plain.caption })).toBeInTheDocument();
});
