# EASYRF — Coordinateur PMSE RF France

### 👉 [OUVRIR L'APPLICATION](https://arnisound.github.io/EASYRF/)

> ⚠️ L'application **n'est pas cette page**. Cette page (sur `github.com`) affiche
> seulement le code. Pour lancer l'app, clique sur le lien ci-dessus — il ouvre
> `arnisound.github.io/EASYRF/`, où se trouve le bouton « Analyser TNT ».

---

Application de planification fréquences pour microphones sans fil (PMSE), basée sur les données de couverture TNT de l'ANFR.

## Structure

```
EASYRF/
├── frontend/
│   └── index.html        # App standalone (ouvrir dans le navigateur)
└── backend/
    ├── server.js         # Proxy ANFR (Node.js / Express)
    └── package.json
```

## Utilisation

L'application fonctionne directement dans le navigateur, sans rien installer.
Une fois GitHub Pages activé (voir ci-dessous), ouvrir l'adresse publiée,
entrer ses coordonnées GPS puis cliquer « Analyser TNT ».

### Activer le lien web (GitHub Pages)
1. Dépôt GitHub → **Settings** → **Pages**
2. **Build and deployment** → **Source** : choisir **GitHub Actions**
3. Le workflow `.github/workflows/pages.yml` publie le site à chaque push.
   L'URL apparaît dans Settings → Pages (du type `https://arnisound.github.io/easyrf/`).

### Usage local (optionnel)
Ouvrir `frontend/index.html` directement dans le navigateur. Si les appels
directs à l'ANFR sont bloqués (CORS), lancer le backend de secours :

```bash
cd backend && npm install && node server.js   # → http://localhost:3001
```

## Source des données

L'app utilise la même API que le site officiel [scanfrequences.anfr.fr](https://scanfrequences.anfr.fr/) :

1. `api-adresse.data.gouv.fr/reverse/` — convertit les coordonnées GPS en code INSEE de commune
2. `scanfrequences.anfr.fr/api/data?lat=&lng=&insee=` — renvoie les canaux TNT reçus à ce point (station, multiplex, niveaux indoor/outdoor en dBµV/m)

Source des données : Arcom (ex-CSA) « Ma couverture TNT », via l'ANFR.

## Fonctionnalités

- **Géolocalisation** GPS ou saisie manuelle de coordonnées
- **Données TNT** : canaux UHF C21–C48 (470–694 MHz) depuis l'ANFR
- **50+ modèles** de micros sans fil, du haut de gamme à l'entrée de gamme : Shure, Sennheiser, Sony, Audio-Technica, Wisycom, Lectrosonics, AKG, Mipro, beyerdynamic, the t.bone, LD Systems, Røde, DJI + retours IEM
- **Calcul IM3 + IM5** : produits d'intermodulation ordres 3 et 5 (paires et triplets)
- **Plan automatique** : placement optimal des porteuses avec les IM3/IM5 dirigés dans les canaux TV occupés ("poubelle")
- **Tableau unifié** : canaux TNT + porteuses micros + produits IM triés par fréquence
- **Visualisation spectre** : 470–694 MHz avec canaux, micros et IM
- **Export CSV**

## API Backend

```
GET /api/tnt?lat=43.9493&lon=4.8055
GET /api/health
```

## Licence
MIT
