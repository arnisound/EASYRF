/**
 * PMSE RF Coordinator — Backend proxy ANFR
 * ==========================================
 * Récupère les données de couverture TNT depuis scanfrequences.anfr.fr
 * Endpoints :
 *   GET /api/tnt?lat=43.94&lon=4.80
 *   GET /api/health
 */

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'] }));
app.use(express.json());

function chanToFreq(ch) { return 306 + ch * 8; }

function parseAnfrHtml(html) {
  const channels = [];
  const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex  = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let match;
  while ((match = tableRegex.exec(html)) !== null) {
    const row = match[1];
    const cells = [];
    let cell;
    const cr = new RegExp(cellRegex.source, 'gi');
    while ((cell = cr.exec(row)) !== null) {
      cells.push(cell[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length >= 7) {
      const ch = parseInt(cells[1]);
      if (!isNaN(ch) && ch >= 21 && ch <= 60) {
        const freqStart = parseFloat(cells[2]) || chanToFreq(ch);
        const mux = cells[4] || null;
        const outdoor = parseFloat(cells[6]) || null;
        const indoor  = parseFloat(cells[7]) || null;
        channels.push({
          ch, freq_start: freqStart, freq_end: freqStart + 8,
          occupied: mux !== null && mux !== '' && mux !== '-',
          mux: (mux && mux !== '-') ? mux : null,
          station: cells[0] || null,
          outdoor_dbuvm: outdoor, indoor_dbuvm: indoor,
          level_dbm: outdoor ? parseFloat((outdoor - 109.5).toFixed(1)) : null,
        });
      }
    }
  }
  return channels;
}

async function fetchAnfrData(lat, lon) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9',
    'Referer': 'https://scanfrequences.anfr.fr/',
  };
  const urls = [
    `https://scanfrequences.anfr.fr/Graphique?lat=${lat}&lon=${lon}`,
    `https://scanfrequences.anfr.fr/?lat=${lat}&lon=${lon}`,
  ];
  for (const url of urls) {
    try {
      console.log(`[ANFR] → ${url}`);
      const res = await fetch(url, { headers, redirect: 'follow', timeout: 8000 });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<tr') && text.length > 500) {
          const channels = parseAnfrHtml(text);
          if (channels.length > 0) {
            console.log(`[ANFR] ✓ ${channels.length} canaux`);
            return { source: 'anfr_live', channels };
          }
        }
      }
    } catch (e) { console.warn(`[ANFR] Échec: ${e.message}`); }
  }
  console.log(`[ANFR] Repli plan théorique pour ${lat}, ${lon}`);
  return { source: 'theoretical', channels: theoreticalPlan(lat, lon) };
}

function theoreticalPlan(lat, lon) {
  const zones = [
    { latC:48.85, lonC:2.35,  name:'Paris / Île-de-France',  emetteur:'Tour Eiffel',        occupied:[21,22,24,25,27,28,29,30,33,34,38,40,42,44,45,46] },
    { latC:45.75, lonC:4.85,  name:'Lyon',                   emetteur:'Mont Pilat',          occupied:[22,25,26,28,30,33,35,38,40,43,45,47] },
    { latC:43.30, lonC:5.37,  name:'Marseille / PACA',       emetteur:'Mont Faron',          occupied:[22,24,25,27,29,32,34,36,38,41,43,46,48] },
    { latC:43.95, lonC:4.80,  name:'Avignon / Vaucluse',     emetteur:'Mont Ventoux',        occupied:[21,23,26,28,31,33,36,38,41,43,46,48] },
    { latC:44.84, lonC:-0.58, name:'Bordeaux',                emetteur:'Pinède Gradignan',    occupied:[23,25,26,28,30,34,37,39,41,43,46,48] },
    { latC:43.60, lonC:1.44,  name:'Toulouse',                emetteur:'Pic du Midi',         occupied:[22,24,26,28,31,33,36,38,41,43,45,47] },
    { latC:47.22, lonC:-1.55, name:'Nantes',                  emetteur:'Nantes principal',    occupied:[21,23,25,28,30,32,36,38,40,43,45,47] },
    { latC:50.63, lonC:3.07,  name:'Lille / Nord',            emetteur:'Mont Cassel',         occupied:[21,22,25,27,30,32,34,37,39,42,44,46] },
    { latC:48.58, lonC:7.75,  name:'Strasbourg / Alsace',    emetteur:'Grand Ballon',        occupied:[22,24,26,29,31,33,35,38,40,43,45,47] },
    { latC:48.11, lonC:-1.68, name:'Rennes / Bretagne',       emetteur:'Rennes Ille',         occupied:[22,24,26,28,31,33,35,38,40,42,44,47] },
    { latC:43.71, lonC:7.26,  name:'Nice / Côte d\'Azur',    emetteur:'Mont Agel',           occupied:[21,23,25,28,30,33,35,38,40,43,45,48] },
    { latC:45.18, lonC:5.72,  name:'Grenoble',                emetteur:'Chamrousse',          occupied:[22,24,27,29,32,34,37,39,42,44,46,48] },
    { latC:48.57, lonC:7.75,  name:'Nancy / Lorraine',       emetteur:'Donon',               occupied:[23,25,27,30,32,35,37,40,42,45,47] },
    { latC:49.44, lonC:1.10,  name:'Rouen / Normandie',      emetteur:'Rouen-Elbeuf',        occupied:[21,24,26,28,31,33,36,38,41,43,46,48] },
    { latC:43.12, lonC:3.00,  name:'Montpellier',             emetteur:'Pic Saint-Loup',      occupied:[22,25,27,29,32,34,37,39,42,44,47] },
    { latC:47.32, lonC:5.04,  name:'Dijon / Bourgogne',      emetteur:'Mont Afrique',        occupied:[23,25,28,30,33,35,38,40,43,45,48] },
    { latC:45.65, lonC:0.16,  name:'Angoulême / Poitou',     emetteur:'Royan',               occupied:[22,24,27,29,32,34,37,39,42,44,47] },
    { latC:49.90, lonC:2.30,  name:'Amiens / Picardie',      emetteur:'Amiens',              occupied:[22,25,27,30,32,35,37,40,42,45,47] },
    { latC:43.30, lonC:3.22,  name:'Béziers / Hérault',      emetteur:'La Gardiole',         occupied:[21,23,26,28,31,33,36,38,41,43,46] },
    { latC:44.93, lonC:6.07,  name:'Briançon / Alpes',       emetteur:'Serre-Chevalier',     occupied:[22,24,27,29,32,35,38,41,44,47] },
  ];

  let bestZone = zones[0], bestDist = Infinity;
  for (const z of zones) {
    const d = Math.sqrt(Math.pow(lat - z.latC, 2) + Math.pow(lon - z.lonC, 2));
    if (d < bestDist) { bestDist = d; bestZone = z; }
  }

  const MUX = ['R1','R2','R3','R4','R5','R6','R7','R8'];
  const MUX_CONTENT = {
    R1:'TF1, France 2, M6, Arte, France 5',
    R2:'France 3 régional',
    R3:'TMC, TFX, TF1 SF, LCI',
    R4:'C8, CNews, CStar, Gulli',
    R5:'France 4, BFM TV, RMC Découverte',
    R6:'W9, 6ter, Téva, Paris Première',
    R7:'Local HD',
    R8:'Local / TNT+',
  };

  let muxIdx = 0;
  const channels = [];
  for (let ch = 21; ch <= 48; ch++) {
    const freqStart = chanToFreq(ch);
    const occupied  = bestZone.occupied.includes(ch);
    let mux = null, muxContent = null;
    if (occupied) {
      mux = MUX[muxIdx % MUX.length];
      muxContent = MUX_CONTENT[mux];
      muxIdx++;
    }
    const outdoor = occupied ? (55 + (ch % 20)) : null;
    channels.push({
      ch, freq_start: freqStart, freq_end: freqStart + 8,
      occupied, mux, mux_content: muxContent,
      station: occupied ? bestZone.emetteur : null,
      location_name: bestZone.name,
      outdoor_dbuvm: outdoor,
      indoor_dbuvm: outdoor ? Math.max(0, outdoor - 14) : null,
      level_dbm: outdoor ? parseFloat((outdoor - 109.5).toFixed(1)) : null,
    });
  }
  return channels;
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
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
    const result = await fetchAnfrData(lat, lon);
    const occupied = result.channels.filter(c => c.occupied).length;
    res.json({
      lat, lon,
      source: result.source,
      source_label: { anfr_live:'ANFR live', anfr_json:'ANFR JSON', theoretical:'Plan théorique' }[result.source] || result.source,
      channels_count: result.channels.length,
      occupied_count: occupied,
      free_count: result.channels.length - occupied,
      channels: result.channels,
    });
  } catch (err) {
    console.error('[API]', err);
    res.status(500).json({ error: 'Erreur interne', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nPMSE RF Backend démarré sur http://localhost:${PORT}`);
  console.log(`  GET /api/tnt?lat=43.94&lon=4.80`);
  console.log(`  GET /api/health\n`);
});
