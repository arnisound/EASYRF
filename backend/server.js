/**
 * RF SHOT — Backend proxy TNT
 * ===========================
 * Récupère la couverture TNT réelle via la même API que le site officiel
 * scanfrequences.anfr.fr :
 *   1. https://api-adresse.data.gouv.fr/reverse/  → code INSEE de la commune
 *   2. https://scanfrequences.anfr.fr/api/data?lat=&lng=&insee=  → canaux TNT
 *
 * Endpoints :
 *   GET /api/tnt?lat=43.63&lon=3.91
 *   GET /api/health
 */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Referer': 'https://scanfrequences.anfr.fr/',
};

// Canal UHF C21 = 470–478 MHz, pas de 8 MHz
function chanFreqStart(ch) { return 302 + ch * 8; }

async function reverseGeocode(lat, lon) {
  const url = `https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}`;
  console.log(`[GEO]  → ${url}`);
  const res = await fetch(url, { headers: BROWSER_HEADERS, timeout: 8000 });
  if (!res.ok) throw new Error(`Géocodage inverse : HTTP ${res.status}`);
  const j = await res.json();
  const props = j.features && j.features[0] && j.features[0].properties;
  if (!props || !props.citycode)
    throw new Error('Aucune commune trouvée pour ces coordonnées (point en mer ou hors France ?)');
  return { insee: props.citycode, city: props.city || props.label || null };
}

// ── Parsing défensif de la réponse scanfrequences ──────────────────────────
// Les noms de champs exacts du JSON ANFR pouvant varier, on cherche dans la
// réponse le tableau dont les éléments ressemblent à des canaux TNT, puis on
// lit chaque champ via une liste de noms candidats.

function normKey(k) { return k.toLowerCase().replace(/[^a-z0-9]/g, ''); }

function pick(obj, names) {
  for (const k of Object.keys(obj)) {
    if (names.includes(normKey(k))) return obj[k];
  }
  return undefined;
}

const FIELDS = {
  ch:      ['canal', 'channel', 'ch', 'numcanal', 'numerocanal', 'num'],
  mux:     ['multiplex', 'mux', 'plex', 'nommultiplex'],
  station: ['station', 'nomstation', 'emetteur', 'site', 'nom', 'libelle'],
  indoor:  ['indoor', 'interieur', 'int', 'niveauindoor'],
  outdoor: ['outdoor', 'exterieur', 'ext', 'niveauoutdoor'],
  out10:   ['outdoor10m', 'outdoor10', 'exterieur10m', 'ext10m'],
};

function looksLikeChannel(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const ch = parseInt(pick(o, FIELDS.ch));
  return !isNaN(ch) && ch >= 21 && ch <= 60;
}

function collectArrays(node, out = []) {
  if (Array.isArray(node)) {
    out.push(node);
    node.forEach(n => collectArrays(n, out));
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach(v => collectArrays(v, out));
  }
  return out;
}

function extractChannels(payload) {
  let best = null, bestScore = 0;
  for (const arr of collectArrays(payload)) {
    const score = arr.filter(looksLikeChannel).length;
    if (score > bestScore) { best = arr; bestScore = score; }
  }
  if (!best) return null;

  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const byCh = new Map();
  for (const item of best) {
    if (!looksLikeChannel(item)) continue;
    const ch = parseInt(pick(item, FIELDS.ch));
    const muxV = pick(item, FIELDS.mux);
    const staV = pick(item, FIELDS.station);
    byCh.set(ch, {
      mux:        muxV != null && muxV !== '' ? String(muxV) : null,
      station:    staV != null && staV !== '' ? String(staV) : null,
      indoor:     num(pick(item, FIELDS.indoor)),
      outdoor:    num(pick(item, FIELDS.outdoor)),
      outdoor10m: num(pick(item, FIELDS.out10)),
    });
  }
  if (byCh.size === 0) return null;

  const channels = [];
  for (let ch = 21; ch <= 48; ch++) {
    const d = byCh.get(ch);
    const freqStart = chanFreqStart(ch);
    channels.push({
      ch, freq_start: freqStart, freq_end: freqStart + 8,
      occupied: !!d,
      mux:     d ? d.mux : null,
      station: d ? d.station : null,
      indoor_dbuvm:     d ? d.indoor : null,
      outdoor_dbuvm:    d ? d.outdoor : null,
      outdoor10m_dbuvm: d ? d.outdoor10m : null,
      // approximation affichée par le frontend : dBm ≈ dBµV/m − 109.5
      level_dbm: d && d.outdoor != null ? parseFloat((d.outdoor - 109.5).toFixed(1)) : null,
    });
  }
  return channels;
}

async function fetchAnfr(lat, lon, insee) {
  const url = `https://scanfrequences.anfr.fr/api/data?lat=${lat}&lng=${lon}&insee=${insee}`;
  console.log(`[ANFR] → ${url}`);
  const res = await fetch(url, { headers: BROWSER_HEADERS, timeout: 10000 });
  if (!res.ok) throw new Error(`scanfrequences.anfr.fr : HTTP ${res.status}`);
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch {
    const e = new Error('Réponse ANFR non-JSON (structure inattendue)');
    e.raw = text.slice(0, 2000);
    throw e;
  }
  const channels = extractChannels(payload);
  if (!channels) {
    const e = new Error('Structure de réponse ANFR inattendue — voir le champ "raw"');
    e.raw = text.slice(0, 2000);
    throw e;
  }
  return channels;
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

app.get('/api/tnt', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon))
    return res.status(400).json({ error: 'Paramètres lat et lon requis' });
  if (lat < 41 || lat > 52 || lon < -6 || lon > 10)
    return res.status(400).json({ error: 'Coordonnées hors France métropolitaine' });
  try {
    console.log(`[API] /api/tnt lat=${lat} lon=${lon}`);
    const geo = await reverseGeocode(lat, lon);
    const channels = await fetchAnfr(lat, lon, geo.insee);
    const occupied = channels.filter(c => c.occupied).length;
    console.log(`[ANFR] ✓ ${geo.city || geo.insee} — ${occupied} canaux occupés`);
    res.json({
      lat, lon,
      insee: geo.insee,
      city: geo.city,
      source: 'anfr_live',
      source_label: `ANFR${geo.city ? ' — ' + geo.city : ''}`,
      channels_count: channels.length,
      occupied_count: occupied,
      free_count: channels.length - occupied,
      channels,
    });
  } catch (err) {
    console.error('[API]', err.message);
    const body = { error: err.message };
    if (err.raw) body.raw = err.raw;
    res.status(502).json(body);
  }
});

app.listen(PORT, () => {
  console.log(`\nRF SHOT Backend démarré sur http://localhost:${PORT}`);
  console.log(`  GET /api/tnt?lat=43.63&lon=3.91`);
  console.log(`  GET /api/health\n`);
});
