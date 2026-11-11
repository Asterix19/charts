import { vi } from 'vitest';

export interface MockContext2D {
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  bezierCurveTo: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
  measureText: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

export function createMockContext(): MockContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
}

/**
 * jsdom doesn't implement canvas 2D rendering — HTMLCanvasElement.getContext
 * returns null by default. This installs a recording mock so components that
 * draw on mount/update can be exercised and asserted against in tests.
 */
export function installCanvasMock(): MockContext2D[] {
  const contexts: MockContext2D[] = [];
  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    const ctx = createMockContext();
    contexts.push(ctx);
    return ctx as unknown as CanvasRenderingContext2D;
  }) as any;
  return contexts;
}
