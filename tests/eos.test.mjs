import test from 'node:test';
import assert from 'node:assert/strict';
import { exportEosPixelMapCsv } from '../dist/modules/eos.js';
const project = { strips: [
  { count: 3, points: [{x:0,y:0}, null, {x:1,y:0}] },
  { count: 2, points: [{x:0,y:1}, {x:1,y:1}] }
] };
test('exports a valid Eos Pixel Map CSV block with physical channel gaps retained', () => {
  assert.equal(exportEosPixelMapCsv(project), ['START_PIXELMAP','PIXELMAP,LOCATION_X,LOCATION_Y,CHANNEL','1,1,1,1','1,1000,1,3','1,1,1000,4','1,1000,1000,5','END_PIXELMAP',''].join('\n'));
});
test('supports a target Pixel Map and channel offset', () => {
  const csv = exportEosPixelMapCsv(project, {pixelMap: 4, startChannel: 101});
  assert.match(csv, /4,1,1,101/); assert.match(csv, /4,1000,1,103/);
});
test('rejects invalid options and projects with no mapped pixels', () => {
  assert.throws(() => exportEosPixelMapCsv(project, {pixelMap: 0}), /Pixel Map number/);
  assert.throws(() => exportEosPixelMapCsv({strips:[{count:1,points:[null]}]}), /no mapped pixels/i);
});
