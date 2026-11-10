import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-native-skia is a native module; replace it with recorders so the path
// construction logic can be tested in plain Node.
const calls: string[] = [];
const recorder = () => {
  const r = {
    moveTo: vi.fn((...a: number[]) => { calls.push(`moveTo ${a.join(',')}`); return r; }),
    lineTo: vi.fn((...a: number[]) => { calls.push(`lineTo ${a.join(',')}`); return r; }),
    cubicTo: vi.fn((...a: number[]) => { calls.push('cubicTo'); return r; }),
    close: vi.fn(() => { calls.push('close'); return r; }),
  };
  return r;
};
const skia = vi.hoisted(() => ({ PathBuilder: undefined as unknown, Path: undefined as unknown }));
vi.mock('@shopify/react-native-skia', () => ({ Skia: skia }));

import { buildPath, buildSmoothPath, buildTrianglePath } from './pathUtils';

beforeEach(() => { calls.length = 0; });

describe('buildPath', () => {
  it('uses Skia.PathBuilder (and build()) when available — the non-deprecated API', () => {
    const built = { kind: 'SkPath' };
    const legacyMake = vi.fn();
    skia.Path = { Make: legacyMake };
    skia.PathBuilder = { Make: () => ({ ...recorder(), build: () => built }) };

    const result = buildPath((p) => { p.moveTo(1, 2); p.lineTo(3, 4); p.close(); });

    expect(result).toBe(built);
    expect(calls).toEqual(['moveTo 1,2', 'lineTo 3,4', 'close']);
    expect(legacyMake).not.toHaveBeenCalled();
  });

  it('falls back to Skia.Path.Make() on react-native-skia versions without PathBuilder', () => {
    const legacy = recorder();
    skia.PathBuilder = undefined;
    skia.Path = { Make: () => legacy };

    expect(buildPath((p) => { p.moveTo(0, 0); p.close(); })).toBe(legacy);
    expect(calls).toEqual(['moveTo 0,0', 'close']);
  });
});

describe('path builders', () => {
  beforeEach(() => {
    skia.Path = undefined;
    skia.PathBuilder = { Make: () => ({ ...recorder(), build: () => ({ built: true }) }) };
  });

  it('buildSmoothPath returns null below 2 points and one cubic per segment otherwise', () => {
    expect(buildSmoothPath([{ x: 0, y: 0 }])).toBeNull();
    buildSmoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }, { x: 30, y: 8 }]);
    expect(calls[0]).toBe('moveTo 0,0');
    expect(calls.filter((c) => c === 'cubicTo')).toHaveLength(3);
  });

  it('buildTrianglePath closes a 3-vertex path pointing up or down', () => {
    buildTrianglePath(10, 10, 8, true);
    expect(calls).toEqual(['moveTo 10,6', 'lineTo 14,14', 'lineTo 6,14', 'close']);
    calls.length = 0;
    buildTrianglePath(10, 10, 8, false);
    expect(calls).toEqual(['moveTo 10,14', 'lineTo 14,6', 'lineTo 6,6', 'close']);
  });
});
