import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });

// jsdom doesn't implement the Pointer Events capture methods yet.
for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
  if (!(method in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, method, {
      value: method === 'hasPointerCapture' ? () => false : () => {},
      writable: true,
    });
  }
}
