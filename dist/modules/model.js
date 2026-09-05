export const COLORS = ['#f4a45b', '#7ca5ee', '#79c6b3', '#bf93df', '#dd8da5', '#d7cd77'];
export const DEFAULT_SETTINGS = { delay: 180, darkDelay: 120, threshold: 32, minArea: 3, maxArea: 2000, samples: 2, brightness: 160, color: '#ffffff', width: 1920, height: 1080, sampleSize: 8, gamma: 2.5, smartLines: true, lineTolerance: 0.004 };
export const MAX_PIXELS = 10000;
export function integer(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}
export function pixelAddress(strip, index) {
  // Whole RGB pixels: never split an RGB triplet across universes.
  const capacity = Math.floor((513 - strip.channel) / 3);
  if (index < capacity) return { universe: strip.universe, channel: strip.channel + index * 3 };
  const remaining = index - capacity;
  return { universe: strip.universe + 1 + Math.floor(remaining / 170), channel: (remaining % 170) * 3 + 1 };
}
export function newStrip(index, count = 60, universe = index) {
  return { id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''), name: `Strip ${String(index + 1).padStart(2, '0')}`, count, color: COLORS[index % COLORS.length], universe, channel: 1, order: 'rgb', points: Array(count).fill(null) };
}
export function newProject() {
  return { version: 1, name: 'Untitled setup', demo: false, strips: [newStrip(0)], settings: { ...DEFAULT_SETTINGS } };
}
export function validatePatch(strips) {
  if (!Array.isArray(strips) || strips.length < 1 || strips.length > 128) throw new Error('Use between 1 and 128 strips.');
  let count = 0; const occupied = new Set(); const ids = new Set();
  for (const strip of strips) {
    if (typeof strip.id !== 'string' || !/^[\w-]{1,80}$/.test(strip.id) || ids.has(strip.id)) throw new Error('Strip IDs must be unique.');
    ids.add(strip.id);
    if (['count','universe','channel'].some(key=>typeof strip[key] !== 'number')) throw new Error('Strip counts and patch values must be numbers.');
    integer(strip.count, 1, 4096, 'LED count'); integer(strip.universe, 0, 255, 'Universe'); integer(strip.channel, 1, 510, 'Start channel');
    if (!['rgb','rbg','grb','gbr','brg','bgr'].includes(strip.order)) throw new Error('Unsupported RGB order.');
    count += strip.count;
    if (count > MAX_PIXELS) throw new Error(`A setup can contain up to ${MAX_PIXELS.toLocaleString()} LEDs.`);
    for (let i = 0; i < strip.count; i++) {
      const a = pixelAddress(strip, i);
      if (a.universe > 255) throw new Error('This setup extends beyond Art-Net universe 255.');
      for (let c = a.channel; c < a.channel + 3; c++) {
        const key = `${a.universe}:${c}`;
        if (occupied.has(key)) throw new Error(`Patch overlap at universe ${a.universe}, channel ${c}. Change the strip patch.`);
        occupied.add(key);
      }
    }
  }
  return count;
}
export function validateProject(raw) {
  if (!raw || raw.version !== 1) throw new Error('Choose a StripR version 1 JSON project.');
  validatePatch(raw.strips);
  const settings = { ...DEFAULT_SETTINGS, ...raw.settings };
  for (const [key,min,max] of [['delay',30,5000],['darkDelay',30,5000],['threshold',1,255],['minArea',1,1000],['maxArea',1,50000],['samples',1,8],['brightness',1,255],['width',16,16384],['height',16,16384],['sampleSize',1,256]]) integer(settings[key],min,max,key);
  if (settings.maxArea < settings.minArea) throw new Error('Maximum blob size must be at least the minimum blob size.');
  if (!Number.isFinite(settings.gamma) || settings.gamma < 1 || settings.gamma > 3) throw new Error('Gamma must be between 1 and 3.');
  if (typeof settings.smartLines !== 'boolean' || !Number.isFinite(settings.lineTolerance) || settings.lineTolerance < .0005 || settings.lineTolerance > .03) throw new Error('Invalid straight-strip settings.');
  if (!/^#[0-9a-f]{6}$/i.test(settings.color)) throw new Error('Invalid scan color.');
  return { version: 1, name: String(raw.name || 'Untitled setup').slice(0,100), demo: raw.demo === true, settings,
    strips: raw.strips.map((s,i) => {
      const points = s.points || Array(s.count).fill(null);
      if (!Array.isArray(points) || points.length !== s.count) throw new Error('Pixel count and coordinates do not match.');
      return { id: s.id, name: String(s.name || `Strip ${i+1}`).slice(0,80), count: s.count, universe: s.universe, channel: s.channel, order: s.order,
        color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : COLORS[i % COLORS.length],
        points: Array.from(points, p => {
          if (p === null) return null;
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) throw new Error('Coordinates must be normalized from 0 to 1.');
          return { x:p.x, y:p.y, confidence: Number.isFinite(p.confidence) ? Math.max(0,Math.min(1,p.confidence)) : 1, source: ['scan','manual','demo','interpolated'].includes(p.source) ? p.source : 'manual' };
        }) };
    }) };
}
export const totals = project => ({ total: project.strips.reduce((n,s)=>n+s.count,0), mapped: project.strips.reduce((n,s)=>n+s.points.filter(Boolean).length,0) });
export function serializeProject(project) {
  return JSON.stringify({ ...validateProject(project), application: 'StripR', exportedAt: new Date().toISOString(), coordinates: { origin: 'top-left', units: 'normalized', x: 'right', y: 'down' } }, null, 2);
}
export function demoPosition(stripIndex, index, count) {
  const t = count === 1 ? 0.5 : index / (count - 1);
  if (stripIndex % 4 === 0) return { x: .16 + .68*t, y: .2 + .09*Math.sin(t*Math.PI*2) };
  if (stripIndex % 4 === 1) return { x: .2 + .6*t, y: .48 };
  if (stripIndex % 4 === 2) return { x: .19 + .62*t, y: .76 - .1*Math.sin(t*Math.PI*2) };
  return { x: .5 + .3*Math.cos(t*2*Math.PI), y: .49 + .32*Math.sin(t*2*Math.PI) };
}
