// easyrf-coordination.js — Algorithme de coordination de fréquences HF
// =============================================================================
// Extrait d'EASYRF. Aucune dépendance, aucun DOM. Calcule des plans de
// fréquences pour micros / IEM en évitant les produits d'intermodulation (IM)
// et en respectant l'occupation TNT, les bandes légales et l'espacement de
// chaque modèle.
//
//   import { generatePlan, computeIM, assignFrequency } from './easyrf-coordination.js';
//
// Conventions :
//   - fréquences en MHz, espacement (spacing) en kHz ;
//   - un « canal » : { ch, freq_start, freq_end, occupied, ... } (cf. easyrf-tnt) ;
//   - un « micro » : { fmin, fmax, spacing, freq? } ; les autres champs sont ignorés.
//
// Idée directrice : les IM 2 tons (2fA−fB, 3fA−2fB) sont les plus fortes et ne
// doivent JAMAIS tomber sur une porteuse → contrainte dure. Les IM 3 tons
// (fA+fB−fC), qui croissent en n³, sont minimisées mais tolérées au-delà de la
// capacité. On pousse les IM dans les canaux TV occupés, ou à défaut on
// « sacrifie » quelques canaux libres pour y concentrer les IM résiduelles.

// Bandes légalement exploitables pour les micros HF en France (MHz).
export const PLAN_BANDS = [[470, 694], [822, 838], [863, 865], [1785, 1805], [2400, 2483.5]];

// ── Masques de fréquences : 1 cellule = 25 kHz, marquage ± garde, test O(1) ──
const FGRID = 40; // cellules par MHz
const maskNew = () => new Uint8Array(Math.round(2500 * FGRID));
function maskMark(mask, f, half) {
  const c = Math.round(f * FGRID), h = Math.round(half * FGRID);
  for (let i = Math.max(0, c - h), e = Math.min(mask.length - 1, c + h); i <= e; i++) mask[i] = 1;
}
const maskHit = (mask, f) => mask[Math.round(f * FGRID)] === 1;

// ── Produits d'intermodulation ───────────────────────────────────────────────

const L = i => String.fromCharCode(65 + i);

/**
 * Liste tous les produits IM3 / IM5 d'un ensemble de porteuses.
 * @param {number[]} freqs
 * @returns {Array<{ord,type,f1,f2,f3,freq}>}  f3=null pour les produits 2 tons
 */
export function computeIM(freqs) {
  const im = [];
  const push = (ord, type, f1, f2, freq, f3 = null) => {
    const f = parseFloat(freq.toFixed(3));
    if (f > 200) im.push({ ord, type, f1, f2, f3, freq: f });
  };
  for (let i = 0; i < freqs.length; i++) {
    for (let j = i + 1; j < freqs.length; j++) {
      const a = freqs[i], b = freqs[j];
      push(3, `2f${L(i)}-f${L(j)}`, a, b, 2 * a - b);
      push(3, `2f${L(j)}-f${L(i)}`, a, b, 2 * b - a);
      push(5, `3f${L(i)}-2f${L(j)}`, a, b, 3 * a - 2 * b);
      push(5, `3f${L(j)}-2f${L(i)}`, a, b, 3 * b - 2 * a);
      for (let k = j + 1; k < freqs.length; k++) {
        const c = freqs[k];
        push(3, `f${L(i)}+f${L(j)}-f${L(k)}`, a, b, a + b - c, c);
        push(3, `f${L(i)}+f${L(k)}-f${L(j)}`, a, b, a + c - b, c);
        push(3, `f${L(j)}+f${L(k)}-f${L(i)}`, a, b, b + c - a, c);
      }
    }
  }
  return im;
}

/**
 * Pour chaque porteuse, compte les IM qui tombent dessus.
 * @returns {Array<{idx,freq,im2,im3}>}  im2 = produits 2 tons (critiques), im3 = 3 tons
 */
export function imHitsPerCarrier(freqs) {
  const im = computeIM(freqs);
  return freqs.map((f, idx) => ({
    idx, freq: f,
    im2: im.filter(p => p.f3 == null && Math.abs(p.freq - f) < 0.15),
    im3: im.filter(p => p.f3 != null && Math.abs(p.freq - f) < 0.1),
  }));
}

// ── Placement d'une fréquence supplémentaire (ajout « au fil de l'eau ») ─────

/**
 * Trouve une fréquence libre dans [fmin,fmax] compatible avec les porteuses
 * existantes : hors canaux occupés, espacement respecté, sans IM 2 tons sur une
 * porteuse, et en évitant les IM 3 tons quand le spectre le permet.
 * @param {number} fmin @param {number} fmax @param {number} spacingKHz
 * @param {object} ctx { channels, used:[{f,spacing}] }
 * @returns {number|null}
 */
export function assignFrequency(fmin, fmax, spacingKHz, ctx) {
  const minGap = (spacingKHz || 350) / 1000;
  const occ = ctx.channels.filter(c => c.occupied).map(c => ({ s: c.freq_start, e: c.freq_end }));
  const used = (ctx.used || []).map(u => ({ f: u.f, sp: (u.spacing || 350) / 1000 }));
  const allF = used.map(u => u.f);
  const im = computeIM(allF);
  const im2 = maskNew(), im3 = maskNew(), carM = maskNew();
  im.forEach(p => { if (p.f3 == null) maskMark(im2, p.freq, 0.15); else maskMark(im3, p.freq, 0.1); });
  used.forEach(u => maskMark(carM, u.f, 0.15));
  for (const strict of [true, false]) {
    for (let f = fmin + 0.3; f <= fmax - 0.3; f += 0.025) {
      f = parseFloat(f.toFixed(3));
      if (!PLAN_BANDS.some(r => f >= r[0] && f <= r[1])) continue;
      if (occ.some(c => f >= c.s && f < c.e)) continue;
      if (used.some(u => Math.abs(f - u.f) < Math.max(minGap, u.sp))) continue;
      if (maskHit(im2, f)) continue;
      let bad = false;
      for (const u of used) {
        for (const v of [2 * f - u.f, 2 * u.f - f, 3 * f - 2 * u.f, 3 * u.f - 2 * f])
          if (Math.abs(v - f) < 0.15 || maskHit(carM, v)) { bad = true; break; }
        if (bad) break;
      }
      if (bad) continue;
      if (strict && maskHit(im3, f)) continue; // 1re passe : zéro IM, même 3 tons
      return f;
    }
  }
  return null;
}

// ── Génération d'un plan complet ─────────────────────────────────────────────

/**
 * Génère un plan de fréquences pour un parc de micros.
 * @param {Array<{fmin,fmax,spacing,name?}>} mics
 * @param {Array} channels  grille de canaux (cf. easyrf-tnt)
 * @param {object} [opts]
 * @param {boolean} [opts.advanced=false]  interdit toute IM 3 sources sur porteuse
 *                  et minimise les IM5 à 3 sources (plus strict, peut moins placer)
 * @param {boolean} [opts.shuffle=false]   tirage aléatoire ⇒ plan différent à chaque appel
 * @returns {{ placed:(number|null)[], slots, stats }}
 *   placed[i] = fréquence du micro i (null si non plaçable)
 *   stats = { nOK, nKO, imTV, imFree, sacrificed:[ch], res3, res5, advanced }
 */
export function generatePlan(mics, channels, opts = {}) {
  const adv = !!opts.advanced, shuffle = !!opts.shuffle;
  const occZones = channels.filter(c => c.occupied).map(c => ({ s: c.freq_start, e: c.freq_end }));
  const inOcc = f => occZones.some(z => f >= z.s && f < z.e);
  const legal = f => PLAN_BANDS.some(r => f >= r[0] && f <= r[1]);
  const nearOcc = f => occZones.some(z => f > z.s - 0.3 && f < z.e + 0.3);
  const blocked = f => nearOcc(f) || !legal(f);
  const chOf = f => (f >= 470 && f < 694) || (f >= 822 && f < 838) ? Math.floor((f - 302) / 8) : null;

  const GUARD = 0.15;    // garde IM 2 tons ↔ porteuse (MHz)
  const GUARD3 = 0.1;    // garde IM 3 tons (produits plus rares)
  const GUARD53 = 0.05;  // garde IM5 à 3 sources (très faibles)

  // micros les plus contraints d'abord (plage étroite, spacing large)
  const rk = mics.map(() => Math.random());
  const order = mics.map((m, i) => i).sort((x, y) => {
    const wx = mics[x].fmax - mics[x].fmin, wy = mics[y].fmax - mics[y].fmin;
    return (wx !== wy ? wx - wy : (mics[y].spacing || 350) - (mics[x].spacing || 350)) || (shuffle ? rk[x] - rk[y] : 0);
  });

  const placed = new Array(mics.length).fill(null);
  const setF = [];            // porteuses posées {freq,sp}
  const imMask = maskNew();   // IM 2 tons (± garde)
  const im3Mask = maskNew();  // IM 3 tons (fA+fB−fC)
  const im53Mask = maskNew(); // IM5 3 sources (mode avancé)
  const carMask = maskNew();  // porteuses posées
  const polluted = new Set(); // canaux libres « sacrifiés »
  const pairIM = (a, b) => [2 * a - b, 2 * b - a, 3 * a - 2 * b, 3 * b - 2 * a];
  const tri5 = (x, a, b) => [3 * x - a - b, 3 * a - x - b, 3 * b - x - a, 2 * x + a - 2 * b, 2 * x + b - 2 * a, 2 * a + x - 2 * b, 2 * a + b - 2 * x, 2 * b + x - 2 * a, 2 * b + a - 2 * x];

  for (const idx of order) {
    const m = mics[idx], sp = (m.spacing || 350) / 1000;
    // Phase 1 : candidats sûrs côté 2 tons, notés pour concentrer les IM
    const cands = [];
    for (let f = m.fmin; f <= m.fmax; f = parseFloat((f + 0.025).toFixed(3))) {
      if (blocked(f)) continue;
      if (setF.some(c => Math.abs(f - c.freq) < Math.max(sp, c.sp))) continue;
      if (maskHit(imMask, f)) continue;
      let ok = true, score = 0;
      for (const c of setF) {
        for (const im of pairIM(f, c.freq)) {
          if (Math.abs(im - f) < GUARD || maskHit(carMask, im)) { ok = false; break; }
          if (inOcc(im)) score += 2;                          // IM en zone TV : idéal
          else if (legal(im)) {
            const ch = chOf(im);
            score -= (ch != null && polluted.has(ch)) ? 0.3 : 3; // sacrifie peu de canaux
          }
        }
        if (!ok) break;
      }
      if (!ok) continue;
      const minD = setF.length ? Math.min(...setF.map(c => Math.abs(f - c.freq))) : 5;
      cands.push({ f, c3: maskHit(im3Mask, f) ? 1 : 0, score: score + Math.min(minD, 1.5) + (shuffle ? Math.random() * 2 : 0) });
    }
    // Phase 2 : départager par IM 3 tons (et IM5 3 sources en mode avancé)
    cands.sort((a, b) => a.c3 - b.c3 || b.score - a.score);
    let best = null, bestV = Infinity, clean = 0;
    for (const c of cands.slice(0, 800)) {
      let v = c.c3;
      if (adv) {
        cnt3: for (let i = 0; i < setF.length && v === 0; i++) for (let j = i + 1; j < setF.length; j++) {
          const a = setF[i].freq, b = setF[j].freq;
          for (const im of [c.f + a - b, c.f + b - a, a + b - c.f])
            if (maskHit(carMask, im) || Math.abs(im - c.f) < GUARD3) { v++; break cnt3; }
        }
        if (v > 0) continue;
        let v5 = maskHit(im53Mask, c.f) ? 1 : 0;
        cnt5: for (let i = 0; i < setF.length && v5 < bestV; i++) for (let j = i + 1; j < setF.length; j++) {
          for (const im of tri5(c.f, setF[i].freq, setF[j].freq))
            if (maskHit(carMask, im) || Math.abs(im - c.f) < GUARD53) { v5++; if (v5 >= bestV) break cnt5; }
        }
        if (v5 < bestV) { bestV = v5; best = c.f; }
        if (bestV === 0 || ++clean >= 25) break;
      } else {
        cnt: for (let i = 0; i < setF.length && v < bestV; i++) for (let j = i + 1; j < setF.length; j++) {
          const a = setF[i].freq, b = setF[j].freq;
          for (const im of [c.f + a - b, c.f + b - a, a + b - c.f])
            if (maskHit(carMask, im) || Math.abs(im - c.f) < GUARD3) { v++; if (v >= bestV) break cnt; }
        }
        if (v < bestV) { bestV = v; best = c.f; }
        if (bestV === 0) break;
      }
    }
    if (best != null) {
      for (const c of setF) for (const im of pairIM(best, c.freq)) {
        maskMark(imMask, im, GUARD);
        const ch = chOf(im);
        if (ch != null && legal(im) && !inOcc(im)) polluted.add(ch);
      }
      for (let i = 0; i < setF.length; i++) for (let j = i + 1; j < setF.length; j++) {
        const a = setF[i].freq, b = setF[j].freq;
        for (const im of [best + a - b, best + b - a, a + b - best]) maskMark(im3Mask, im, GUARD3);
        if (adv) for (const im of tri5(best, a, b)) maskMark(im53Mask, im, GUARD53);
      }
      placed[idx] = best; setF.push({ freq: best, sp });
      maskMark(carMask, best, GUARD);
    }
  }

  // ── Bilan ──
  const freqs = placed.filter(f => f != null);
  const planIM = [];
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++)
    pairIM(freqs[i], freqs[j]).forEach(v => { const im = parseFloat(v.toFixed(3)); if (legal(im) || inOcc(im)) planIM.push({ freq: im, inOcc: inOcc(im) }); });
  const car3 = maskNew(); freqs.forEach(f => maskMark(car3, f, GUARD3));
  let res3 = 0;
  for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) for (let k = 0; k < freqs.length; k++) {
    if (k === i || k === j) continue;
    if (maskHit(car3, freqs[i] + freqs[j] - freqs[k])) res3++;
  }
  let res5 = 0;
  if (adv) {
    const car5 = maskNew(); freqs.forEach(f => maskMark(car5, f, GUARD53));
    for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) for (let k = j + 1; k < freqs.length; k++)
      for (const im of tri5(freqs[i], freqs[j], freqs[k])) if (maskHit(car5, im)) res5++;
  }

  const slots = mics.map((m, i) => ({
    name: m.name || null, freq: placed[i],
    off: placed[i] != null && !channels.some(c => placed[i] >= c.freq_start && placed[i] < c.freq_end),
  }));
  return {
    placed, slots,
    stats: {
      nOK: freqs.length, nKO: mics.length - freqs.length,
      imTV: planIM.filter(im => im.inOcc).length,
      imFree: planIM.filter(im => !im.inOcc).length,
      sacrificed: [...polluted].sort((a, b) => a - b),
      res3, res5, advanced: adv,
    },
  };
}
