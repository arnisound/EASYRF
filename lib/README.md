# EASYRF — modules réutilisables

Deux modules ES autonomes (zéro dépendance, zéro DOM) extraits d'EASYRF, pour
réutiliser dans un autre projet (artefact, app, script Node…) :

| Fichier | Rôle |
|---|---|
| `easyrf-tnt.js` | **API données** — interroge l'API publique Arcom « Ma couverture TNT » et renvoie la grille des canaux UHF occupés/libres. |
| `easyrf-coordination.js` | **Algorithme** — calcule des plans de fréquences micros/IEM en évitant les intermodulations (IM). |
| `easyrf-relay.ts` | Relais CORS optionnel (Deno Deploy) si l'appel direct navigateur est bloqué. |

Compatibles navigateur (ESM) et Node ≥ 18 (`fetch`/`AbortSignal.timeout` natifs).

---

## 1. Récupérer la couverture TNT

```js
import { getTNT, applyExclusion, distKm } from './easyrf-tnt.js';

const { channels, source_label } = await getTNT(43.6105, 3.8705);
// channels : [{ ch, freq_start, freq_end, occupied, pmse, mux, station,
//               sta_lat, sta_lng, level_dbm, emitters, ... }, ...]

// Optionnel : ignorer les émetteurs à plus de 60 km (libère des canaux)
const ignored = applyExclusion(channels, 43.6105, 3.8705, 60);
```

`getTNT(lat, lon, opts)` :
- `opts.relay` — URL d'un relais CORS (un défaut public est fourni ; `null` pour désactiver).
- `opts.reverseGeocode` — résoudre le nom de commune via `api-adresse.data.gouv.fr` (défaut `true`).

> ⚠️ Depuis un navigateur, l'appel direct à `matnt.arcom.fr` est souvent bloqué
> par CORS. Déployez `easyrf-relay.ts` sur Deno Deploy et passez son URL via
> `opts.relay`. En Node, l'appel direct fonctionne sans relais.

## 2. Coordonner les fréquences

```js
import { generatePlan, assignFrequency, computeIM, imHitsPerCarrier } from './easyrf-coordination.js';

const mics = [
  { name: 'HH 1', fmin: 470, fmax: 534, spacing: 350 }, // Shure ULX-D G51
  { name: 'HH 2', fmin: 470, fmax: 534, spacing: 350 },
  { name: 'BP 1', fmin: 606, fmax: 678, spacing: 600 }, // Sennheiser EW-DX
  // …jusqu'à ~50 micros
];

// Plan standard : zéro IM 2 tons sur porteuse, IM dirigées vers les canaux TV
const { placed, slots, stats } = generatePlan(mics, channels);
// placed[i] = fréquence (MHz) du micro i, ou null si non plaçable
// stats = { nOK, nKO, imTV, imFree, sacrificed:[canaux], res3, res5, advanced }

// Plan avancé : interdit aussi toute IM 3 sources sur porteuse + minimise les IM5
const strict = generatePlan(mics, channels, { advanced: true });

// Régénérer un plan différent (tirage aléatoire)
const autre = generatePlan(mics, channels, { shuffle: true });
```

Ajout d'une seule fréquence à un parc existant (workflow « au fil de l'eau ») :

```js
const f = assignFrequency(470, 534, 350, {
  channels,
  used: [{ f: 471.200, spacing: 350 }, { f: 472.000, spacing: 350 }],
}); // → 472.8 (ou null si saturé)
```

Audit des intermodulations d'un plan fini :

```js
const hits = imHitsPerCarrier(placed.filter(Boolean));
// [{ idx, freq, im2:[...], im3:[...] }, ...]  im2 = produits critiques
```

---

## Notes techniques

- **Fréquences en MHz, espacement en kHz.** L'espacement par modèle (`spacing`)
  sert d'écart minimal entre porteuses voisines.
- **IM 2 tons** (`2fA−fB`, `3fA−2fB`) : les plus fortes → jamais sur une porteuse
  (contrainte dure, garde 150 kHz).
- **IM 3 tons** (`fA+fB−fC`) : croissent en n³ ; minimisées, tolérées au-delà de
  la capacité (≈ 25-30 micros sur la seule bande TNT).
- **IM5 3 sources** : prises en compte uniquement en mode `advanced`.
- Les IM sont poussées en priorité dans les **canaux TV occupés** (sans gêne) ;
  à défaut, l'algo « sacrifie » quelques canaux libres (`stats.sacrificed`) pour
  y concentrer les IM résiduelles plutôt que de polluer tout le spectre.
- `PLAN_BANDS` définit les bandes légales françaises (TNT 470-694, PMSE 823-832,
  863-865, 1785-1805, 2.4 GHz). Adaptez ce tableau pour un autre pays.
- Performance : masques `Uint8Array` (25 kHz/cellule) ⇒ contrôles IM en O(1).
  Un plan de 50 micros se calcule en < 1 s.
