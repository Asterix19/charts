import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement the Pointer Events capture methods yet.
for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
  if (!(method in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, method, {
      value: method === 'hasPointerCapture' ? () => false : () => {},
      writable: true,
    });
  }
}
