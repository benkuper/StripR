// ETC Eos Pixel Map CSV export.
// Eos imports these blocks via Browser > File > Import > CSV (include Pixel Maps).
export function exportEosPixelMapCsv(project, { pixelMap = 1, startChannel = 1, gridSize = 1000 } = {}) {
  if (!project || !Array.isArray(project.strips) || !project.strips.length) throw new Error('No StripR project is available.');
  if (!Number.isInteger(pixelMap) || pixelMap < 1) throw new Error('Pixel Map number must be a positive whole number.');
  if (!Number.isInteger(startChannel) || startChannel < 1) throw new Error('Starting Eos channel must be a positive whole number.');
  if (!Number.isInteger(gridSize) || gridSize < 2 || gridSize > 10000) throw new Error('Grid size must be from 2 to 10000.');
  const points = []; let channel = startChannel;
  for (const strip of project.strips) {
    if (!Array.isArray(strip.points) || strip.points.length !== strip.count) throw new Error('Strip pixel coordinates do not match the configured LED count.');
    for (let index = 0; index < strip.count; index++, channel++) {
      const point = strip.points[index];
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) points.push({ mapX: point.y, mapY: point.x, channel });
    }
  }
  if (!points.length) throw new Error('There are no mapped pixels to export. Scan or place at least one LED first.');
  const minX = Math.min(...points.map(p => p.mapX)), maxX = Math.max(...points.map(p => p.mapX));
  const minY = Math.min(...points.map(p => p.mapY)), maxY = Math.max(...points.map(p => p.mapY));
  const spanX = maxX - minX, spanY = maxY - minY, longest = Math.max(spanX, spanY) || 1;
  const width = Math.max(1, Math.round(spanX / longest * (gridSize - 1)));
  const height = Math.max(1, Math.round(spanY / longest * (gridSize - 1)));
  const rows = ['START_PIXELMAP', 'PIXELMAP,LOCATION_X,LOCATION_Y,CHANNEL'];
  for (const point of points) {
    const x = spanX ? Math.round((point.mapX - minX) / spanX * width) + 1 : 1;
    const y = spanY ? Math.round((point.mapY - minY) / spanY * height) + 1 : 1;
    rows.push([pixelMap, x, y, point.channel].join(','));
  }
  rows.push('END_PIXELMAP');
  return rows.join('\n') + '\n';
}
