// @stacklatte/chart-engine/canvas — Canvas 2D drawing primitives and ChartController, shared by the React and Angular
// renderers. Kept out of the engine's main entry so `import … from '@stacklatte/chart-engine'` stays DOM-free.
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
