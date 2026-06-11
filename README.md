# EASYRF — Coordinateur PMSE RF France

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

## Démarrage rapide

Le backend est requis pour la capture TNT (il interroge les serveurs de l'ANFR) :

```bash
cd backend
npm install
node server.js
# → http://localhost:3001
```

Puis ouvrir `frontend/index.html` dans le navigateur — le backend est détecté automatiquement.

## Source des données

Le backend utilise la même API que le site officiel [scanfrequences.anfr.fr](https://scanfrequences.anfr.fr/) :

1. `api-adresse.data.gouv.fr/reverse/` — convertit les coordonnées GPS en code INSEE de commune
2. `scanfrequences.anfr.fr/api/data?lat=&lng=&insee=` — renvoie les canaux TNT reçus à ce point (station, multiplex, niveaux indoor/outdoor en dBµV/m)

Source des données : Arcom (ex-CSA) « Ma couverture TNT », via l'ANFR.

## Fonctionnalités

- **Géolocalisation** GPS ou saisie manuelle de coordonnées
- **Données TNT** : canaux UHF C21–C48 (470–694 MHz) depuis l'ANFR
- **45+ modèles** de micros sans fil : Shure, Sennheiser, Sony, Audio-Technica, Wisycom, Lectrosonics, Røde, DJI + retours IEM
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
