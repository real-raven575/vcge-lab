/**
 * vCGE lab: logo bench, the shape maker (🦎 Flipside, MOD06). Lab only.
 *
 * Turns the confirmed logo into a small flat-colour SVG: the logo's colours are boiled down to `colours` inks plus
 * the card colour (which is left out, so the SVG is see-through around the logo), and each ink is traced into closed
 * outlines with the build's own MOD06 tracer (`outlines` and `soften` from card3dView.js, passed in so this file stays
 * pure and testable). One colour is what the app's own trace does; two to four keep a coloured logo's colours.
 * Specks smaller than `minCells` grid cells are dropped, which keeps the file small and the shapes clean.
 */

const hex = (c) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''));

/**
 * Fewer points on a closed loop: consecutive repeats go, then any point closer than `tolerance` cells to the line
 * between its kept neighbours (Ramer-Douglas-Peucker). Smooth curves keep enough points; stair noise goes.
 */
export function simplifyLoop(loop, tolerance = 0.6) {
    const pts = loop.filter((p, i) => { const q = loop[(i + loop.length - 1) % loop.length]; return p[0] !== q[0] || p[1] !== q[1]; });
    if (pts.length < 4 || tolerance <= 0) return pts;
    const off = (p, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        return len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(p[0] - a[0], p[1] - a[1]);
    };
    // Split the loop at its first point and the point farthest from it, and simplify each half as an open line.
    let far = 0, farD = -1;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > farD) { farD = d; far = i; } });
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[far] = 1;
    const line = (i0, i1) => {   // i1 may pass the end of the list; indexes wrap
        let best = -1, bestD = tolerance;
        for (let i = i0 + 1; i < i1; i++) { const d = off(pts[i % pts.length], pts[i0 % pts.length], pts[i1 % pts.length]); if (d > bestD) { bestD = d; best = i; } }
        if (best < 0) return;
        keep[best % pts.length] = 1;
        line(i0, best); line(best, i1);
    };
    line(0, far); line(far, pts.length);
    const out = pts.filter((p, i) => keep[i]);
    return out.length >= 3 ? out : pts;
}

/** Signed area of a closed loop of [x, y] points (the shoelace sum). */
export function loopArea(loop) {
    let a = 0;
    for (let i = 0; i < loop.length; i++) {
        const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
}

/**
 * The box's pixels as a grid of at most `max` cells a side, each cell the mean colour of its pixels.
 * @returns {{ cells: number[][], gw: number, gh: number }}
 */
export function gridOf(px, w, box, max) {
    const scale = Math.max(1, Math.ceil(Math.max(box.w, box.h) / max));
    const gw = Math.ceil(box.w / scale), gh = Math.ceil(box.h / scale);
    const cells = new Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
            let r = 0, g = 0, b = 0, n = 0;
            for (let y = box.y + gy * scale; y < Math.min(box.y + box.h, box.y + (gy + 1) * scale); y++) {
                for (let x = box.x + gx * scale; x < Math.min(box.x + box.w, box.x + (gx + 1) * scale); x++) {
                    const k = (y * w + x) * 4;
                    r += px[k]; g += px[k + 1]; b += px[k + 2]; n++;
                }
            }
            cells[gy * gw + gx] = n ? [r / n, g / n, b / n] : [255, 255, 255];
        }
    }
    return { cells, gw, gh };
}

/** The median colour of the grid's outer ring: the card behind the logo. */
export function ringColour(cells, gw, gh) {
    const ring = [];
    for (let x = 0; x < gw; x++) { ring.push(cells[x], cells[(gh - 1) * gw + x]); }
    for (let y = 1; y < gh - 1; y++) { ring.push(cells[y * gw], cells[y * gw + gw - 1]); }
    return [0, 1, 2].map(c => { const v = ring.map(p => p[c]).sort((a, b) => a - b); return v[v.length >> 1]; });
}

/**
 * K-means on the cell colours, started the same way every time: the first centre is the card colour, each next one
 * the cell farthest from every centre so far. Returns the centres and each cell's centre index.
 */
export function clusterColours(cells, k, back, rounds = 10) {
    const centres = [back.slice()];
    while (centres.length < k) {
        let far = -1, farD = -1;
        for (let i = 0; i < cells.length; i++) {
            const d = Math.min(...centres.map(c => dist2(c, cells[i])));
            if (d > farD) { farD = d; far = i; }
        }
        if (farD <= 0) break;
        centres.push(cells[far].slice());
    }
    const assign = new Uint8Array(cells.length);
    for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < cells.length; i++) {
            let best = 0, bestD = Infinity;
            for (let c = 0; c < centres.length; c++) { const d = dist2(centres[c], cells[i]); if (d < bestD) { bestD = d; best = c; } }
            assign[i] = best;
        }
        const sums = centres.map(() => [0, 0, 0, 0]);
        for (let i = 0; i < cells.length; i++) { const s = sums[assign[i]]; s[0] += cells[i][0]; s[1] += cells[i][1]; s[2] += cells[i][2]; s[3]++; }
        sums.forEach((s, c) => { if (s[3]) centres[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    return { centres, assign };
}

/**
 * The flat-colour SVG of the logo inside `box` of the RGBA pixels `px` (row width `w`).
 * @param {{ colours?: number, max?: number, minCells?: number, outlines: Function, soften: Function }} options
 *   colours: inks besides the card colour (1-4); max: grid cells on the long side; minCells: smallest shape kept;
 *   tolerance: how far (in cells) a simplified outline may stray; outlines/soften: MOD06's tracer.
 * @returns {{ svg: string|null, inks: { colour: string, cells: number }[], bytes: number, reason: string|null }}
 */
export function posterize(px, w, box, { colours = 2, max = 160, minCells = 3, tolerance = 0.6, outlines, soften }) {
    if (typeof outlines !== 'function' || typeof soften !== 'function') throw new Error('posterize needs the build\'s outlines and soften');
    const { cells, gw, gh } = gridOf(px, w, box, max);
    const back = ringColour(cells, gw, gh);
    const { centres, assign } = clusterColours(cells, Math.max(2, Math.min(5, colours + 1)), back);
    // The centre nearest the card colour is the background and is left out.
    let backIndex = 0, backD = Infinity;
    centres.forEach((c, i) => { const d = dist2(c, back); if (d < backD) { backD = d; backIndex = i; } });
    const inks = [], paths = [];
    centres.forEach((centre, c) => {
        if (c === backIndex) return;
        const mask = new Uint8Array(gw * gh);
        let count = 0;
        for (let i = 0; i < mask.length; i++) if (assign[i] === c) { mask[i] = 1; count++; }
        if (count < minCells) return;
        const loops = outlines(mask, gw, gh).filter(l => Math.abs(loopArea(l)) >= minCells);
        if (!loops.length) return;
        const d = loops.map(loop => 'M' + simplifyLoop(soften(loop), tolerance).map(([x, y]) => `${num(x)} ${num(y)}`).join('L') + 'Z').join('');
        inks.push({ colour: hex(centre), cells: count });
        paths.push({ count, el: `<path fill="${hex(centre)}" fill-rule="evenodd" d="${d}"/>` });
    });
    if (!paths.length) return { svg: null, inks: [], bytes: 0, reason: 'nothing stands out from the card in this box' };
    // Biggest ink first, so smaller details sit on top of it.
    paths.sort((a, b) => b.count - a.count);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${gw}" height="${gh}" viewBox="0 0 ${gw} ${gh}">${paths.map(p => p.el).join('')}</svg>`;
    return { svg, inks, bytes: new TextEncoder().encode(svg).length, reason: null };
}
