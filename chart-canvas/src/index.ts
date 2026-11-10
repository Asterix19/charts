// Re-export the engine like every other renderer package does, so one import covers types and helpers.
export * from '@stacklatte/chart-engine';

// Canvas 2D drawing primitives shared by every DOM renderer (React, Angular, …).
// Pure functions over a CanvasRenderingContext2D — no framework, no state.
export { getScaledContext } from './canvasDpr';
export { drawAxis, type AxisDrawOptions } from './draw/axis';
export { drawCrosshairLines } from './draw/crosshair';
export { drawCustomPanel } from './draw/customPanel';
export { drawMacdPanel } from './draw/macdPanel';
export { drawCandles, drawCrosshairDot, drawLineSeries, drawShadedArea } from './draw/mainPanel';
export { drawMarkers } from './draw/markers';
export { drawRsiPanel } from './draw/rsiPanel';
export { drawVolumePanel } from './draw/volumePanel';
export { fillPolygon, strokeDashedLine, strokeSmoothPath, type Point } from './draw/path';
export { ChartController } from './ChartController';
