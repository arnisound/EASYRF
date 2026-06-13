// rfshot-scan.js — Import de scans de spectre RF (CSV multi-logiciels) en module autonome
// =============================================================================
// Extrait de RF SHOT. Parse les exports de scan de la plupart des logiciels de
// coordination et analyseurs de spectre : Shure Wireless Workbench, Sennheiser
// WSM, RF Explorer, tinySA / tinySA Ultra, Lectrosonics Wireless Designer,
// Soundbase / WaveTool, Rigol/Signal Hound, etc.
//
// Constat : tous ces outils convergent vers un CSV à deux colonnes
// (fréquence, amplitude). Les seules différences réelles sont :
//   • le délimiteur         : « , » « ; » tabulation, barre verticale ou espace
//   • le séparateur décimal : « . » ou « , » (locales européennes)
//   • l'unité de fréquence  : Hz, kHz ou MHz
//   • un éventuel préambule / en-tête à ignorer
// parseScan() auto-détecte ces quatre points et normalise vers { f (MHz), db (dBm) }.
// Un seul parseur tolérant couvre ainsi la quasi-totalité des fichiers, sans
// avoir à écrire un lecteur par marque.
//
//   import { parseScan, binToChannels } from './rfshot-scan.js';
//   const { points, meta, warnings } = parseScan(csvText);
//
// ── API ──────────────────────────────────────────────────────────────────────
// parseScan(text, opts?) -> { points, meta, warnings }
//   points  : [{ f, db }] trié par fréquence croissante (f en MHz, db en dBm)
//   meta    : { delimiter, decimal, unit, swapped, rows, used, skipped,
//               fmin, fmax, dbMin, dbMax, count, step, confidence }
//   warnings: string[]  (anomalies non bloquantes)
//   opts    : { delimiter, decimal, unit } — force tout ou partie de l'auto-détection
//             ('Hz' | 'kHz' | 'MHz' pour unit ; un caractère pour delimiter/decimal)
//
// binToChannels(points, channels, opts?) -> { channels, occupied, threshold }
//   Reporte le niveau mesuré sur une grille de canaux (ex. S.ch de RF SHOT) :
//   pour chaque canal, niveau crête dans [freq_start, freq_end[ et occupation
//   au-delà d'un seuil dBm. N'écrase PAS l'occupation TNT : écrit dans des
//   champs dédiés (scan_dbm / scan_occupied) pour laisser l'appelant décider.

const DELIMS = [";", ",", "\t", "|", " "];

// Découpe une ligne selon le délimiteur (l'espace fusionne les blancs multiples).
function splitLine(line, delim) {
  return delim === " " ? line.trim().split(/\s+/) : line.split(delim);
}

// Fabrique un convertisseur strict « token -> nombre » pour un séparateur décimal
// donné. Strict (regex plein token) pour ne PAS confondre un en-tête ou une
// cellule polluée (« 100;-42 ») avec un nombre — c'est la clé de la détection.
function makeNum(decimal) {
  if (decimal === ",")
    return (tok) => {
      const s = tok.trim();
      return /^[+-]?\d+(,\d+)?$/.test(s) ? parseFloat(s.replace(",", ".")) : NaN;
    };
  return (tok) => {
    const s = tok.trim();
    return /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s) ? parseFloat(s) : NaN;
  };
}

// Extrait jusqu'à deux premiers nombres stricts d'une ligne.
function rowNumbers(line, delim, num) {
  const out = [];
  for (const t of splitLine(line, delim)) {
    const v = num(t);
    if (!isNaN(v)) { out.push(v); if (out.length >= 2) break; }
  }
  return out;
}

// Choisit le couple (délimiteur, décimale) qui produit le plus de lignes
// « deux nombres » plausibles sur un échantillon. En cas d'égalité, le premier
// candidat l'emporte : ordre DELIMS + décimale « . » d'abord (cas le plus courant).
function detectFormat(lines) {
  const sample = lines.slice(0, Math.min(lines.length, 120));
  let best = { delim: ",", decimal: ".", score: -1 };
  for (const delim of DELIMS) {
    for (const decimal of delim === "," ? ["."] : [".", ","]) {
      const num = makeNum(decimal);
      let score = 0;
      for (const ln of sample) if (rowNumbers(ln, delim, num).length >= 2) score++;
      if (score > best.score) best = { delim, decimal, score };
    }
  }
  return best;
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const medianAbs = (a) => median(a.map(Math.abs));

function emptyResult(warnings) {
  return {
    points: [],
    meta: { delimiter: null, decimal: null, unit: null, swapped: false, rows: 0,
      used: 0, skipped: 0, fmin: null, fmax: null, dbMin: null, dbMax: null,
      count: 0, step: null, confidence: 0 },
    warnings,
  };
}

/**
 * Parse un scan de spectre CSV/texte vers une liste normalisée { f (MHz), db (dBm) }.
 * @param {string} text  contenu brut du fichier
 * @param {{delimiter?:string,decimal?:string,unit?:'Hz'|'kHz'|'MHz'}} [opts]
 * @returns {{points:{f:number,db:number}[], meta:object, warnings:string[]}}
 */
export function parseScan(text, opts = {}) {
  if (typeof text !== "string") throw new TypeError("parseScan: texte CSV attendu");
  const warnings = [];

  // 1. Lignes, sans BOM ni lignes vides, tous styles de fin de ligne confondus.
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  if (!lines.length) { warnings.push("Fichier vide."); return emptyResult(warnings); }

  // 2. Format (délimiteur + décimale), auto-détecté ou forcé via opts.
  const fmt = opts.delimiter
    ? { delim: opts.delimiter, decimal: opts.decimal || ".", score: lines.length }
    : detectFormat(lines);
  const num = makeNum(fmt.decimal);

  // 3. Extraction : on ne garde que les lignes donnant deux nombres (les autres
  //    — en-têtes, métadonnées du préambule — sont comptées dans `skipped`).
  const raw = [];
  let skipped = 0;
  for (const ln of lines) {
    const n = rowNumbers(ln, fmt.delim, num);
    if (n.length >= 2) raw.push(n); else skipped++;
  }
  if (!raw.length) {
    warnings.push("Aucune ligne de données numériques reconnue (format non supporté ?).");
    return emptyResult(warnings);
  }

  // 4. Orientation des colonnes : la fréquence a une magnitude bien plus grande
  //    que l'amplitude (centaines de MHz vs |dBm| < 130). On repère donc la
  //    colonne « fréquence » par sa médiane absolue la plus élevée.
  const c0 = raw.map((r) => r[0]);
  const c1 = raw.map((r) => r[1]);
  const swapped = medianAbs(c1) > medianAbs(c0);
  const freqRaw = swapped ? c1 : c0;
  const ampRaw = swapped ? c0 : c1;

  // 5. Unité de fréquence d'après l'ordre de grandeur (override possible).
  const medF = medianAbs(freqRaw);
  let unit = opts.unit, div;
  if (!unit) unit = medF >= 1e7 ? "Hz" : medF >= 1e4 ? "kHz" : "MHz";
  div = unit === "Hz" ? 1e6 : unit === "kHz" ? 1e3 : 1;

  // 6. Normalisation MHz/dBm + tri par fréquence.
  const points = freqRaw
    .map((f, i) => ({ f: f / div, db: ampRaw[i] }))
    .sort((a, b) => a.f - b.f);

  // 7. Statistiques + avertissements non bloquants.
  const dbs = points.map((p) => p.db);
  const fmin = points[0].f, fmax = points[points.length - 1].f;
  const dbMin = Math.min(...dbs), dbMax = Math.max(...dbs);
  let step = null;
  if (points.length > 1) {
    const diffs = [];
    for (let i = 1; i < points.length; i++) diffs.push(points[i].f - points[i - 1].f);
    step = median(diffs);
  }
  const confidence = Math.min(1, fmt.score / Math.max(1, lines.length));

  if (points.length < 10) warnings.push(`Scan très court (${points.length} points).`);
  if (dbMax > 30) warnings.push("Amplitudes positives élevées : niveaux en dBµV plutôt qu'en dBm ?");
  if (fmin < 1 || fmax > 6000) warnings.push(`Fréquences hors plage attendue (${fmin.toFixed(1)}–${fmax.toFixed(1)} MHz).`);
  if (confidence < 0.5) warnings.push("Format ambigu : vérifiez le résultat (forcez delimiter/decimal/unit si besoin).");

  return {
    points,
    meta: {
      delimiter: fmt.delim, decimal: fmt.decimal, unit, swapped,
      rows: lines.length, used: points.length, skipped,
      fmin, fmax, dbMin, dbMax, count: points.length, step, confidence,
    },
    warnings,
  };
}

/**
 * Reporte un scan sur une grille de canaux : niveau crête + occupation par seuil.
 * Écrit dans des champs dédiés (scan_dbm / scan_occupied) sans toucher au reste.
 * @param {{f:number,db:number}[]} points  sortie de parseScan().points
 * @param {Array<{freq_start:number,freq_end:number}>} channels  ex. RF SHOT S.ch
 * @param {{threshold?:number, prefix?:string}} [opts]  seuil dBm (def. -85), préfixe de champ
 * @returns {{channels:Array, occupied:number, threshold:number}}
 */
export function binToChannels(points, channels, opts = {}) {
  const threshold = opts.threshold != null ? opts.threshold : -85;
  const prefix = opts.prefix || "scan";
  let occupied = 0;
  for (const ch of channels) {
    let peak = null;
    for (const p of points)
      if (p.f >= ch.freq_start && p.f < ch.freq_end && (peak === null || p.db > peak)) peak = p.db;
    ch[prefix + "_dbm"] = peak;
    ch[prefix + "_occupied"] = peak !== null && peak >= threshold;
    if (ch[prefix + "_occupied"]) occupied++;
  }
  return { channels, occupied, threshold };
}
