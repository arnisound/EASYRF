// rfshot-tnt.js — Couche données « couverture TNT » (France) en module autonome
// =============================================================================
// Extrait de RF SHOT. Aucune dépendance, aucun DOM, aucun état global : des
// fonctions pures + un point d'entrée `getTNT()` qui interroge l'API publique
// Arcom « Ma couverture TNT » et renvoie la liste des canaux UHF (21–48) avec
// leur occupation, plus les canaux PMSE 65/66 toujours libres.
//
// Compatible navigateur (fetch natif) et Node ≥ 18 (fetch global).
//
//   import { getTNT, applyExclusion, distKm } from './rfshot-tnt.js';
//   const { channels } = await getTNT(43.61, 3.87);
//
// Un « canal » a la forme :
//   { ch, freq_start, freq_end, occupied, pmse, mux, mux_content, station,
//     sta_lat, sta_lng, indoor_dbuvm, outdoor_dbuvm, level_dbm, emitters }
// `emitters` conserve TOUS les émetteurs reçus pour ce canal (triés du plus
// fort au plus faible), ce qui permet le filtrage par distance a posteriori.

// ── Constantes ───────────────────────────────────────────────────────────────

// Canal UHF N → fréquence basse = 302 + 8N MHz (canal 21 = 470 MHz … 48 = 686).
export const chanFreqStart = ch => 302 + ch * 8;

// Canaux PMSE réservés aux micros HF hors TNT : 65/66 ≈ 822–838 MHz
// (sous-bande harmonisée 823–832 MHz). Toujours considérés libres.
export const PMSE_CH = [65, 66];

// API publique Arcom (clé statique embarquée dans le site, ce n'est pas un secret).
const ARCOM_BASE = 'https://matnt.arcom.fr/mctnt/api/v1/coordinates-mv3';
const ARCOM_CLE = 'iMc5PxK';

// Relais CORS optionnel (voir relay/main.ts). Mettez à null pour le désactiver.
const DEFAULT_RELAY = 'https://stormy-tiger-34.arnisoundtools.deno.net';

// ── Lecture tolérante des champs (noms variables selon l'API) ────────────────

const normKey = k => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const pick = (obj, names) => {
  for (const k of Object.keys(obj)) if (names.includes(normKey(k))) return obj[k];
  return undefined;
};
const FIELDS = {
  ch: ['canal', 'channel', 'ch', 'numcanal', 'numerocanal', 'num', 'ncanal', 'nocanal', 'canalstation'],
  mux: ['multiplex', 'mux', 'plex', 'nommultiplex'],
  station: ['station', 'nomstation', 'emetteur', 'site', 'nom', 'libelle'],
  indoor: ['indoor', 'interieur', 'int', 'niveauindoor'],
  outdoor: ['outdoor', 'exterieur', 'ext', 'niveauoutdoor', 'champ', 'valeurdata'],
  out10: ['outdoor10m', 'outdoor10', 'exterieur10m', 'ext10m'],
};

// ── Construction de la grille de canaux ──────────────────────────────────────

// `byCh` : Map<canal, {mux,station,indoor,outdoor,outdoor10m,sta_lat,sta_lng,
//                       content,cands}>. Tout canal présent = occupé.
export function buildChannels(byCh) {
  const channels = [];
  const add = (ch, pmse) => {
    const d = byCh.get(ch), freqStart = chanFreqStart(ch);
    channels.push({
      ch, freq_start: freqStart, freq_end: freqStart + 8,
      occupied: !!d, pmse: !!pmse,
      mux: d ? d.mux : null,
      mux_content: d && d.content ? d.content : null,
      station: d ? d.station : null,
      sta_lat: d && d.sta_lat != null ? d.sta_lat : null,
      sta_lng: d && d.sta_lng != null ? d.sta_lng : null,
      indoor_dbuvm: d ? d.indoor : null,
      outdoor_dbuvm: d ? d.outdoor : null,
      outdoor10m_dbuvm: d ? d.outdoor10m : null,
      level_dbm: d && d.outdoor != null ? parseFloat((d.outdoor - 109.5).toFixed(1)) : null,
      emitters: d && d.cands ? d.cands : null,
    });
  };
  for (let ch = 21; ch <= 48; ch++) add(ch, false);
  PMSE_CH.forEach(ch => add(ch, true));
  return channels;
}

// ── Parseur dédié à la réponse Arcom coordinates-mv3 ─────────────────────────
// Réponse : { success, adresse, lat, lng,
//   data: [ { R1:{…canal…}, R2:{…}, site_station, lieu_station,
//             lat_station, lng_station, … }, … ],  ← un objet PAR ÉMETTEUR
//   mux:  { R1:{chaines:[{nom_chaine},…]}, … } }    ← contenu des multiplex
export function extractArcom(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const contentOf = {};
  if (payload.mux && typeof payload.mux === 'object') {
    for (const [m, md] of Object.entries(payload.mux)) {
      const noms = md && Array.isArray(md.chaines) ? md.chaines.map(c => c && c.nom_chaine).filter(Boolean) : [];
      if (noms.length) contentOf[m] = noms.slice(0, 8).join(', ') + (noms.length > 8 ? '…' : '');
    }
  }
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const byCh = new Map();
  const harvest = (n, found) => {
    if (Array.isArray(n)) { n.forEach(x => harvest(x, found)); return; }
    if (!n || typeof n !== 'object') return;
    const chV = parseInt(pick(n, FIELDS.ch));
    if (!isNaN(chV) && chV >= 21 && chV <= 60)
      found.push({ ch: chV, outdoor: num(pick(n, FIELDS.outdoor)), indoor: num(pick(n, FIELDS.indoor)) });
    Object.values(n).forEach(v => harvest(v, found));
  };
  const emetteurs = Array.isArray(payload.data) ? payload.data : [];
  for (const em of emetteurs) {
    if (!em || typeof em !== 'object') continue;
    const staName = [em.site_station, em.lieu_station].filter(Boolean).join(' / ') || null;
    let sLat = parseFloat(em.lat_station), sLng = parseFloat(em.lng_station);
    if (!isFinite(sLat) || !isFinite(sLng) || Math.abs(sLat) > 90 || Math.abs(sLng) > 180) { sLat = null; sLng = null; }
    for (const [k, v] of Object.entries(em)) {
      if (!/^R/.test(k) || !v || typeof v !== 'object') continue; // R1…R15, RLocal…
      const found = []; harvest(v, found);
      for (const f of found) {
        const arr = byCh.get(f.ch) || [];
        arr.push({ mux: k, station: staName, content: contentOf[k] || null, indoor: f.indoor, outdoor: f.outdoor, sta_lat: sLat, sta_lng: sLng });
        byCh.set(f.ch, arr);
      }
    }
  }
  if (!byCh.size) return null;
  const bestBy = new Map();
  for (const [ch, arr] of byCh) {
    const sorted = arr.slice().sort((a, b) => ((b.outdoor != null ? b.outdoor : -999)) - ((a.outdoor != null ? a.outdoor : -999)));
    bestBy.set(ch, { ...sorted[0], outdoor10m: null, cands: sorted });
  }
  return buildChannels(bestBy);
}

// Parseur générique de secours : repère le tableau d'objets qui ressemble le
// plus à une liste de canaux, quelle que soit la structure JSON.
export function extractChannels(payload) {
  const looksLikeChannel = o => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    const ch = parseInt(pick(o, FIELDS.ch));
    return !isNaN(ch) && ch >= 21 && ch <= 60;
  };
  const collect = (node, out = []) => {
    if (Array.isArray(node)) { out.push(node); node.forEach(n => collect(n, out)); }
    else if (node && typeof node === 'object') Object.values(node).forEach(v => collect(v, out));
    return out;
  };
  let best = null, bestScore = 0;
  for (const arr of collect(payload)) {
    const score = arr.filter(looksLikeChannel).length;
    if (score > bestScore) { best = arr; bestScore = score; }
  }
  if (!best) return null;
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const byCh = new Map();
  for (const item of best) {
    if (!looksLikeChannel(item)) continue;
    const ch = parseInt(pick(item, FIELDS.ch));
    const muxV = pick(item, FIELDS.mux), staV = pick(item, FIELDS.station);
    byCh.set(ch, {
      mux: muxV != null && muxV !== '' ? String(muxV) : null,
      station: staV != null && staV !== '' ? String(staV) : null,
      indoor: num(pick(item, FIELDS.indoor)),
      outdoor: num(pick(item, FIELDS.outdoor)),
      outdoor10m: num(pick(item, FIELDS.out10)),
    });
  }
  return byCh.size ? buildChannels(byCh) : null;
}

// ── Accès réseau ─────────────────────────────────────────────────────────────

async function fetchJson(url, timeoutMs) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const txt = await r.text();
  let data = null; try { data = JSON.parse(txt); } catch (_) {}
  if (!r.ok) throw new Error('HTTP ' + r.status + (data && data.error ? ' — ' + data.error : ''));
  if (data == null) throw new Error('réponse non-JSON');
  return data;
}

// Appel direct puis, en cas d'échec (CORS…), via le relais s'il est fourni.
async function fetchArcom(url, relay) {
  let eDirect;
  try { return await fetchJson(url, 12000); }
  catch (e) { eDirect = e; if (!relay) throw e; }
  try { return await fetchJson(relay.replace(/\/$/, '') + '/?url=' + encodeURIComponent(url), 15000); }
  catch (eRelay) { throw new Error('direct : ' + (eDirect.message || 'échec') + ' · relais : ' + (eRelay.message || 'échec')); }
}

/**
 * Récupère la couverture TNT à une position donnée.
 * @param {number} lat
 * @param {number} lon
 * @param {object} [opts]
 * @param {string|null} [opts.relay]  URL du relais CORS (DEFAULT_RELAY, null pour désactiver)
 * @param {boolean}     [opts.reverseGeocode]  résoudre le nom de commune (def. true)
 * @returns {Promise<{source,source_label,channels,raw}>}
 */
export async function getTNT(lat, lon, opts = {}) {
  const relay = opts.relay === undefined ? DEFAULT_RELAY : opts.relay;
  let city = null;
  if (opts.reverseGeocode !== false) {
    try {
      const geo = await fetchJson(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`, 8000);
      const p = geo.features && geo.features[0] && geo.features[0].properties;
      if (p) city = p.city || p.label || null;
    } catch (_) {}
  }
  const adr = encodeURIComponent(city || (lat + ', ' + lon));
  const url = `${ARCOM_BASE}?adr=${adr}&lat=${lat}&lng=${lon}&type=4&cle=${ARCOM_CLE}`;
  const payload = await fetchArcom(url, relay);
  if (payload && payload.success === false)
    throw new Error('Arcom a répondu « échec »' + (payload.message ? ' : ' + payload.message : ''));
  const channels = extractArcom(payload) || extractChannels(payload);
  if (!channels) throw new Error('réponse Arcom reçue mais aucun canal UHF dedans');
  return {
    source: 'arcom_live',
    source_label: 'Arcom MaTNT' + (city ? ' — ' + city : ''),
    channels,
    raw: payload,
  };
}

// ── Distance & exclusion par éloignement ─────────────────────────────────────

// Distance haversine (km) entre deux points géographiques.
export function distKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Recalcule l'occupation des canaux en ignorant les émetteurs au-delà de `km`
 * de la position (lat,lon). Modifie `channels` sur place et renvoie le nombre
 * d'émetteurs ignorés. `km<=0` ⇒ aucun filtrage (réinitialise au plus fort).
 */
export function applyExclusion(channels, lat, lon, km) {
  let ignored = 0;
  channels.forEach(c => {
    if (!c.emitters || !c.emitters.length) return; // canal PMSE / libre d'origine
    let cands = c.emitters;
    if (km > 0 && lat != null && lon != null) {
      cands = cands.filter(e => {
        if (e.sta_lat == null || e.sta_lng == null) return true;
        return distKm(lat, lon, e.sta_lat, e.sta_lng) <= km;
      });
      ignored += c.emitters.length - cands.length;
    }
    const best = cands[0] || null; // déjà triés du plus fort au plus faible
    c.occupied = !!best;
    c.mux = best ? best.mux : null;
    c.station = best ? best.station : null;
    c.mux_content = best ? best.content : null;
    c.sta_lat = best ? best.sta_lat : null;
    c.sta_lng = best ? best.sta_lng : null;
    c.indoor_dbuvm = best ? best.indoor : null;
    c.outdoor_dbuvm = best ? best.outdoor : null;
    c.level_dbm = best && best.outdoor != null ? parseFloat((best.outdoor - 109.5).toFixed(1)) : null;
  });
  return ignored;
}
