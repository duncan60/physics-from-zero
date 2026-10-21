import { describe, expect, it } from 'vitest';
import type { Lesson } from '../lib/types';
import { collectLessons } from './discover';

const lesson = (id: string): Lesson => ({ id, title: `課 ${id}`, steps: [] });

/** 檔名 → 課程 id；路徑和 `import.meta.glob` 給的一樣，前面有 `./lessons/`。 */
function modules(files: Record<string, string>): Record<string, { default: Lesson }> {
  return Object.fromEntries(Object.entries(files).map(([file, id]) => [`./lessons/${file}`, { default: lesson(id) }]));
}

const ids = (lessons: Lesson[] | undefined) => lessons?.map((l) => l.id);

describe('collectLessons：正常的課程檔', () => {
  it('沒有任何課程：沒有問題，也沒有任何一站', () => {
    const { byStation, problems } = collectLessons({});
    expect(problems).toEqual([]);
    expect(byStation.size).toBe(0);
  });

  it('依站分組，每一站依課號排序（不管讀進來的順序）', () => {
    const { byStation, problems } = collectLessons(
      modules({
        '2-2-friction.ts': '2-2',
        '1-2-speed.ts': '1-2',
        '2-1-force.ts': '2-1',
        '1-1-inertia.ts': '1-1',
        '1-3-acceleration.ts': '1-3',
      }),
    );
    expect(problems).toEqual([]);
    expect([...byStation.keys()]).toEqual([1, 2]);
    expect(ids(byStation.get(1))).toEqual(['1-1', '1-2', '1-3']);
    expect(ids(byStation.get(2))).toEqual(['2-1', '2-2']);
  });

  it('課號依數字排序，不是依字串：1-10 排在 1-9 後面', () => {
    const files: Record<string, string> = {};
    for (const n of [10, 2, 9, 1, 3, 4, 5, 6, 7, 8]) files[`1-${n}-lesson-${n}.ts`] = `1-${n}`;
    const { byStation, problems } = collectLessons(modules(files));
    expect(problems).toEqual([]);
    expect(ids(byStation.get(1))).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10']);
  });

  it('回傳的就是檔案裡 default 匯出的那一個課程物件', () => {
    const mods = modules({ '1-1-inertia.ts': '1-1' });
    const { byStation } = collectLessons(mods);
    expect(byStation.get(1)?.[0]).toBe(mods['./lessons/1-1-inertia.ts'].default);
  });

  it('檔名裡的英文名稱可以有數字和連字號', () => {
    const { problems } = collectLessons(modules({ '1-1-a-b-2.ts': '1-1' }));
    expect(problems).toEqual([]);
  });
});

describe('collectLessons：檔名和課程 id 不符', () => {
  it('2-3-x.ts 裡的 id 是 2-4：問題訊息有檔名，也說出兩邊的值', () => {
    const { problems } = collectLessons(modules({ '2-1-a.ts': '2-1', '2-2-b.ts': '2-2', '2-3-x.ts': '2-4' }));
    const mismatch = problems.filter((p) => p.includes('2-3-x.ts'));
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]).toContain('2-3');
    expect(mismatch[0]).toContain('2-4');
  });

  it('檔名對、id 不一樣，不會同時被當成其他問題重複回報', () => {
    const { problems } = collectLessons(modules({ '1-1-a.ts': '1-1', '1-2-b.ts': '1-3' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('1-2-b.ts');
  });
});

describe('collectLessons：課號要從 1 開始、連續', () => {
  it('第 2 站有 1、3 沒有 2：跳號，訊息說缺 2-2', () => {
    const { problems } = collectLessons(modules({ '2-1-a.ts': '2-1', '2-3-c.ts': '2-3' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('第 2 站');
    expect(problems[0]).toContain('缺 2-2');
  });

  it('第 1 站從 2 開始（沒有 1-1）：缺 1-1', () => {
    const { problems } = collectLessons(modules({ '1-2-b.ts': '1-2', '1-3-c.ts': '1-3' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('缺 1-1');
  });

  it('只有第 3 站有課、跳過第 1、2 站是可以的：各站各自從 1 開始', () => {
    const { byStation, problems } = collectLessons(modules({ '3-1-a.ts': '3-1', '3-2-b.ts': '3-2' }));
    expect(problems).toEqual([]);
    expect([...byStation.keys()]).toEqual([3]);
  });

  it('跳號的站不影響其他站的檢查', () => {
    const { problems } = collectLessons(modules({ '1-1-a.ts': '1-1', '1-2-b.ts': '1-2', '2-1-a.ts': '2-1', '2-3-c.ts': '2-3' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('第 2 站');
  });
});

describe('collectLessons：重複', () => {
  it('兩個檔案的 id 相同：問題訊息有 id，也有兩個檔名', () => {
    const { problems } = collectLessons(modules({ '1-1-a.ts': '1-1', '1-2-b.ts': '1-2', '1-2-c.ts': '1-2' }));
    const duplicate = problems.find((p) => p.includes('重複'));
    expect(duplicate).toBeDefined();
    expect(duplicate).toContain('1-2');
    expect(duplicate).toContain('1-2-b.ts');
    expect(duplicate).toContain('1-2-c.ts');
  });

  it('同一個課號有兩個檔案（id 也都照檔名）：有問題', () => {
    const { problems } = collectLessons(modules({ '1-1-a.ts': '1-1', '1-1-b.ts': '1-1' }));
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe('collectLessons：檔名格式', () => {
  it.each(['lesson.ts', '1-1.ts', '1-a-inertia.ts', '1-1-Inertia.ts', '1-1-inertia.tsx', '1-1-inertia.test.ts', '1-1-慣性.ts', '1-1-.ts', '1-1-a_b.ts', 'index.ts'])(
    '%s 不符合「站-課-英文名稱.ts」：問題訊息有檔名',
    (file) => {
      const { problems, byStation } = collectLessons(modules({ [file]: '1-1' }));
      expect(problems.some((p) => p.includes(file)), `問題：${problems.join(' / ')}`).toBe(true);
      expect(byStation.size).toBe(0);
    },
  );

  it('檔名不合的檔案不會讓其他課程被誤判成跳號', () => {
    const { byStation, problems } = collectLessons(modules({ '1-1-a.ts': '1-1', '1-2-b.ts': '1-2', 'notes.ts': '1-3' }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('notes.ts');
    expect(ids(byStation.get(1))).toEqual(['1-1', '1-2']);
  });
});

describe('collectLessons：沒有 default 匯出', () => {
  it('還在用具名匯出的課程檔：問題訊息有檔名，提醒要 export default', () => {
    const mods = { './lessons/1-1-inertia.ts': { inertia: lesson('1-1') } } as unknown as Record<string, { default: Lesson }>;
    const { problems, byStation } = collectLessons(mods);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('1-1-inertia.ts');
    expect(problems[0]).toContain('export default');
    expect(byStation.size).toBe(0);
  });
});

describe('collectLessons：只接受已知的站', () => {
  it('第 8 站不存在：問題訊息有檔名', () => {
    const { problems } = collectLessons(modules({ '8-1-extra.ts': '8-1' }), [1, 2, 3, 4, 5, 6, 7]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('8-1-extra.ts');
    expect(problems[0]).toContain('第 8 站');
  });

  it('沒給站的清單時不檢查站號', () => {
    expect(collectLessons(modules({ '8-1-extra.ts': '8-1' })).problems).toEqual([]);
  });

  it('站在清單裡就沒問題', () => {
    expect(collectLessons(modules({ '7-1-x.ts': '7-1' }), [1, 2, 3, 4, 5, 6, 7]).problems).toEqual([]);
  });
});
