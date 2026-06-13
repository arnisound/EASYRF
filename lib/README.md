# EASYRF — modules réutilisables

Modules ES autonomes (zéro dépendance, zéro DOM) extraits d'EASYRF, pour
réutiliser dans un autre projet (artefact, app, script Node…) :

| Fichier | Rôle |
|---|---|
| `easyrf-tnt.js` | **API données** — interroge l'API publique Arcom « Ma couverture TNT » et renvoie la grille des canaux UHF occupés/libres. |
| `easyrf-scan.js` | **Import scans** — parse les exports CSV de scan de spectre (Shure WWB, Sennheiser WSM, RF Explorer, tinySA…) avec auto-détection du format. |
| `easyrf-coordination.js` | **Algorithme** — calcule des plans de fréquences micros/IEM en évitant les intermodulations (IM). |
| `easyrf-catalog.js` | **Base de données** — micros HF / IEM les plus utilisés en France (16 marques, 166 gammes), du haut de gamme au matériel d'entrée de gamme (the t.bone, LD Systems), avec leur espacement de coordination. |
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

## 3. Base de données micros / IEM

```js
import { MIC_CATALOG, IEM_CATALOG, listBrands, listModels,
         getModel, flatten, toMic } from './easyrf-catalog.js';

listBrands();                       // ['Shure','Sennheiser','Sony', …] (16 marques)
listModels('Shure');                // ['Axient Digital','ULX-D','QLX-D', …]
getModel('Shure', 'ULX-D');         // { sp:350, b:[['G51',470,534], …] }

// Construire un micro prêt pour generatePlan() : marque, modèle, index de gamme
const mic = toMic('Shure', 'ULX-D', 0, { name: 'HH 1' });
// → { brand:'Shure', model:'ULX-D', band:'G51', fmin:470, fmax:534, spacing:350, name:'HH 1' }

// Toutes les gammes à plat (124 entrées micros)
flatten(MIC_CATALOG);  // [{ brand, model, band, fmin, fmax, spacing }, …]
flatten(IEM_CATALOG);  // idem pour les retours in-ear
```

Structure brute : `marque → modèle → { sp:<espacement kHz>, b:[[libellé, fmin, fmax], …] }`.
Marques incluses : Shure, Sennheiser, Sony, Audio-Technica, Wisycom, Lectrosonics,
Sound Devices, Zaxcom, AKG, Mipro, beyerdynamic, the t.bone, LD Systems, Røde, DJI.

> Les gammes sont indicatives (déclinaisons EU courantes) ; vérifiez la bande
> exacte de votre matériel avant exploitation.

## 4. Importer un scan de spectre

```js
import { parseScan, binToChannels } from './easyrf-scan.js';

// CSV exporté par Shure Wireless Workbench, Sennheiser WSM, RF Explorer,
// tinySA, Lectrosonics Wireless Designer, etc. — un seul parseur les couvre.
const { points, meta, warnings } = parseScan(await file.text());
// points : [{ f, db }, …]  f en MHz, db en dBm, trié par fréquence
// meta   : { delimiter, decimal, unit, swapped, count, fmin, fmax, dbMin, dbMax, … }

// Reporter le niveau mesuré sur la grille TNT (champs scan_dbm / scan_occupied)
const { occupied } = binToChannels(points, channels, { threshold: -85 });
```

`parseScan()` auto-détecte le **délimiteur** (`,` `;` tab `|` espace), le **séparateur
décimal** (`.`/`,`), l'**unité** (Hz/kHz/MHz), l'ordre des colonnes et saute le
préambule/en-tête. Forçage possible : `parseScan(text, { delimiter, decimal, unit })`.
Formats couverts : tous ceux qui exportent un CSV `(fréquence, amplitude dBm)`
— soit la quasi-totalité des logiciels constructeur et analyseurs de spectre.

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
