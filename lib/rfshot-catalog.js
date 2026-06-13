// rfshot-catalog.js — Base de données micros HF / IEM (France) en module autonome
// =============================================================================
// Extrait de RF SHOT. Catalogue des systèmes HF (micros) et IEM (ears) les plus
// utilisés en France, avec leurs gammes de fréquences EU et l'espacement de
// coordination recommandé par modèle.
//
//   import { MIC_CATALOG, IEM_CATALOG, listBrands, listModels, getModel,
//            flatten, toMic } from './rfshot-catalog.js';
//
// Structure : marque → modèle → { sp, b }
//   sp : espacement de coordination en kHz (écart minimal sans intermodulation)
//   b  : liste de gammes [ [libelle, fmin_MHz, fmax_MHz], … ]
//
// Repères d'espacement (sp) :
//   Shure numérique 350 · Sennheiser numérique 600 · analogiques ~400 ·
//   Lectrosonics / Sound Devices / Zaxcom 300 · 2.4 GHz auto-coordonné.
//
// ⚠️ Les gammes sont indicatives (versions/déclinaisons EU les plus courantes) ;
// vérifiez toujours la bande exacte de votre matériel et la réglementation
// locale avant exploitation.

// ── Micros HF ────────────────────────────────────────────────────────────────
export const MIC_CATALOG = {
  "Shure": {
    "Axient Digital": { sp: 350, b: [["G56", 470, 636], ["K54 (EU ≤694)", 606, 694]] },
    "ULX-D": { sp: 350, b: [["G51", 470, 534], ["H51", 534, 598], ["J51", 572, 636], ["K51", 606, 670], ["L52", 632, 696], ["S50 (823–832)", 823, 832], ["S50 (863–865)", 863, 865]] },
    "QLX-D": { sp: 350, b: [["G51", 470, 534], ["H51", 534, 598], ["J51", 572, 636], ["K51", 606, 670], ["L52", 632, 696], ["S50 (823–832)", 823, 832]] },
    "SLX-D": { sp: 350, b: [["H56", 518, 562], ["J53", 562, 606], ["K59", 606, 650], ["L56", 650, 694], ["S50 (823–832)", 823, 832]] },
    "BLX": { sp: 400, b: [["H8E", 518, 542], ["K3E", 606, 630], ["S8 (823–832)", 823, 832], ["T11 (863–865)", 863, 865]] },
    "Microflex MX8": { sp: 350, b: [["J53", 566, 636]] }
  },
  "Sennheiser": {
    "EW-DX": { sp: 600, b: [["Q1-9", 470, 550], ["R1-9", 520, 608], ["S1-10", 606, 694], ["S2-10", 614, 694], ["S4-10", 630, 694], ["U1/5 (823–832)", 823, 832], ["U1/5 (863–865)", 863, 865], ["Y1-3 (1G8)", 1785, 1805]] },
    "EW-D": { sp: 600, b: [["Q1-6", 470, 526], ["R1-6", 520, 576], ["R4-9", 552, 608], ["S1-7", 606, 662], ["S4-7", 630, 662], ["S7-10", 662, 694], ["U1/5 (823–832)", 823, 832], ["U1/5 (863–865)", 863, 865]] },
    "Digital 6000": { sp: 600, b: [["A1-A4", 470, 558], ["A5-A8", 550, 638], ["B1-B4 (EU ≤694)", 630, 694]] },
    "SK 9000": { sp: 600, b: [["A1-A4", 470, 558], ["A5-A8", 550, 638], ["B1-B4 (EU ≤694)", 630, 694]] },
    "EW100 G4": { sp: 400, b: [["A1", 470, 516], ["A", 516, 558], ["AS", 520, 558], ["G", 566, 608], ["GB", 606, 648], ["B", 626, 668], ["E (823–832)", 823, 832], ["E (863–865)", 863, 865]] },
    "EW300/500 G4": { sp: 400, b: [["AW+", 470, 558], ["GW1", 558, 608], ["GW", 558, 626], ["GBW", 606, 678], ["BW", 626, 698]] },
    "2000 Series": { sp: 400, b: [["AW", 516, 558], ["GW", 558, 626], ["BW", 626, 698]] },
    "XSW 1/2": { sp: 400, b: [["A", 548, 572], ["B", 614, 638], ["E (823–832)", 823, 832], ["E (863–865)", 863, 865]] }
  },
  "Sony": {
    "UWP-D": { sp: 400, b: [["CE21", 470, 542], ["CE33", 566, 633], ["CE42", 638, 694]] },
    "DWX (numérique)": { sp: 400, b: [["470–694 (selon version)", 470, 694]] }
  },
  "Audio-Technica": {
    "5000 Series (num.)": { sp: 350, b: [["DE2", 470, 530], ["EG2", 560, 596]] },
    "3000 Series (ana.)": { sp: 400, b: [["DE2", 470, 530], ["EG2", 560, 596], ["GG3", 626, 662]] }
  },
  "Wisycom": {
    "MTP40S / MTP41S": { sp: 400, b: [["470–694", 470, 694]] },
    "MTP60 / MTP61 (large bande)": { sp: 400, b: [["470–694 (UHF)", 470, 694], ["823–832 (PMSE)", 823, 832], ["863–865 (libre)", 863, 865], ["1785–1805 (1G8)", 1785, 1805]] },
    "MCR42 / MCR54": { sp: 400, b: [["470–694", 470, 694], ["823–832 (PMSE)", 823, 832]] },
    "MPR50 / MPR52": { sp: 400, b: [["470–694", 470, 694], ["823–832 (PMSE)", 823, 832]] }
  },
  "Lectrosonics": {
    "Digital Hybrid (SMx, LT)": { sp: 300, b: [["A1", 470, 537], ["B1", 537, 614], ["C1", 614, 691]] },
    "D Squared (DSQD/DPR)": { sp: 300, b: [["470–608", 470, 608], ["614–694", 614, 694]] },
    "DCR / M2T": { sp: 300, b: [["A1", 470, 614]] }
  },
  "Sound Devices": {
    "A20-Mini / A20-TX": { sp: 300, b: [["A1 (large 470–694)", 470, 694]] }
  },
  "Zaxcom": {
    "ZMT4 / TRXLT": { sp: 300, b: [["470–694", 470, 694]] }
  },
  "AKG": {
    "DMS800 (num.)": { sp: 400, b: [["BD1 (EU ≤694)", 548, 694]] },
    "WMS470 (ana.)": { sp: 400, b: [["B7", 500, 531], ["B8", 570, 601], ["B9", 600, 631], ["B1", 650, 680]] }
  },
  "Mipro": {
    "ACT-5xx / ACT-7xx": { sp: 400, b: [["470–694 (selon version)", 470, 694]] }
  },
  "beyerdynamic": {
    "TG 1000 (num.)": { sp: 400, b: [["470–694 (TG1000 ≤789)", 470, 694]] }
  },
  "the t.bone": {
    "freeU 823 / Twin 823": { sp: 400, b: [["823–832 (PMSE)", 823, 832]] },
    "freeU 863 / Twin 863": { sp: 400, b: [["863–865 (libre)", 863, 865]] },
    "free solo 590": { sp: 400, b: [["596–620", 596, 620]] },
    "free solo 660": { sp: 400, b: [["665–679", 665, 679]] },
    "free solo 823": { sp: 400, b: [["823–832 (PMSE)", 823, 832]] },
    "free solo 863": { sp: 400, b: [["863–865 (libre)", 863, 865]] },
    "TWS / TWS 16 (823)": { sp: 400, b: [["823–832 (PMSE)", 823, 832]] },
    "TWS / TWS 16 (863)": { sp: 400, b: [["863–865 (libre)", 863, 865]] }
  },
  "LD Systems": {
    "U300 (ana.)": { sp: 400, b: [["470–490", 470, 490], ["514–542", 514, 542], ["584–608", 584, 608], ["655–679", 655, 679], ["823–832 (PMSE)", 823, 832], ["863–865 (libre)", 863, 865]] },
    "U500 (ana.)": { sp: 400, b: [["U505 (584–608)", 584, 608], ["U506 (655–679)", 655, 679], ["U508 (823–832)", 823, 832], ["U508 (863–865)", 863, 865]] },
    "WS 1000 G2 (ana.)": { sp: 400, b: [["823–832 (PMSE)", 823, 832], ["863–865 (libre)", 863, 865]] }
  },
  "Audio-Technica (2.4 GHz)": {
    "System 10 Pro": { sp: 1000, b: [["2.4 GHz", 2400, 2483]] }
  },
  "Røde": {
    "Wireless GO II": { sp: 1000, b: [["2.4 GHz", 2400, 2483]] },
    "Wireless ME": { sp: 1000, b: [["2.4 GHz", 2400, 2483]] }
  },
  "DJI": {
    "Mic 2": { sp: 2000, b: [["2.4 GHz", 2400, 2483]] }
  }
};

// ── Retours in-ear (IEM / ears) ──────────────────────────────────────────────
export const IEM_CATALOG = {
  "Shure": {
    "PSM300": { sp: 400, b: [["H20", 518, 578], ["K12", 606, 630], ["S8 (823–832)", 823, 832], ["T11 (863–865)", 863, 865]] },
    "PSM900": { sp: 400, b: [["G7E", 506, 542], ["K1E", 596, 632], ["L6E", 656, 692]] },
    "PSM1000": { sp: 400, b: [["G10", 470, 542], ["J8", 554, 626], ["K10", 596, 668], ["L8", 626, 698]] }
  },
  "Sennheiser": {
    "EW IEM G4": { sp: 400, b: [["A1", 470, 516], ["A", 516, 558], ["AS", 520, 558], ["G", 566, 608], ["GB", 606, 648], ["B", 626, 668], ["E (823–832)", 823, 832], ["E (863–865)", 863, 865]] },
    "XSW IEM": { sp: 400, b: [["A", 476, 500], ["B", 572, 596], ["C", 662, 686], ["E (823–832)", 823, 832], ["E (863–865)", 863, 865]] },
    "2000 IEM": { sp: 400, b: [["AW", 516, 558], ["GW", 558, 626], ["BW", 626, 698]] }
  },
  "Lectrosonics": {
    "R1a / Duet": { sp: 300, b: [["A1", 470, 537], ["B1", 537, 614], ["C1", 614, 691]] }
  },
  "Wisycom": {
    "MPR30 IFB": { sp: 400, b: [["470–694", 470, 694]] }
  },
  "LD Systems": {
    "U300 IEM (ana.)": { sp: 400, b: [["470–490", 470, 490], ["514–542", 514, 542], ["584–608", 584, 608], ["655–679", 655, 679], ["823–832 (PMSE)", 823, 832], ["863–865 (libre)", 863, 865]] },
    "U500 IEM / MEI 1000 G2 (ana.)": { sp: 400, b: [["584–608", 584, 608], ["655–679", 655, 679], ["823–832 (PMSE)", 823, 832], ["863–865 (libre)", 863, 865]] }
  },
  "the t.bone": {
    "IEM 100 (863)": { sp: 400, b: [["863–865 (libre)", 863, 865]] }
  }
};

// ── Helpers d'accès ──────────────────────────────────────────────────────────

/** Liste des marques d'un catalogue (MIC_CATALOG par défaut). */
export const listBrands = (catalog = MIC_CATALOG) => Object.keys(catalog);

/** Liste des modèles d'une marque. */
export const listModels = (brand, catalog = MIC_CATALOG) => Object.keys(catalog[brand] || {});

/** Renvoie l'entrée d'un modèle : { sp, b } ou undefined. */
export const getModel = (brand, model, catalog = MIC_CATALOG) => (catalog[brand] || {})[model];

/**
 * Aplatit un catalogue en une liste de gammes exploitables directement.
 * @returns {Array<{brand,model,band,fmin,fmax,spacing}>}
 */
export function flatten(catalog = MIC_CATALOG) {
  const out = [];
  for (const [brand, models] of Object.entries(catalog))
    for (const [model, { sp, b }] of Object.entries(models))
      for (const [band, fmin, fmax] of b)
        out.push({ brand, model, band, fmin, fmax, spacing: sp });
  return out;
}

/**
 * Construit un objet « micro » prêt pour generatePlan() / assignFrequency().
 * @param {string} brand @param {string} model
 * @param {number} bandIndex  index de la gamme dans .b (def. 0)
 * @param {object} [extra]  champs à fusionner (name, kind…)
 * @returns {{brand,model,band,fmin,fmax,spacing}|null}
 */
export function toMic(brand, model, bandIndex = 0, extra = {}, catalog = MIC_CATALOG) {
  const m = getModel(brand, model, catalog);
  if (!m || !m.b[bandIndex]) return null;
  const [band, fmin, fmax] = m.b[bandIndex];
  return { brand, model, band, fmin, fmax, spacing: m.sp, ...extra };
}
