// rfshot-relay.ts — Relais CORS (Deno Deploy) pour l'API Arcom « Ma couverture TNT »
// ====================================================================================
// Petit proxy qui permet au navigateur d'interroger l'Arcom / l'ANFR, qui
// n'autorisent pas les appels cross-origin. Il ajoute les bons en-têtes (dont
// un Referer dépendant de l'hôte) et renvoie la réponse avec les en-têtes CORS.
//
// Déploiement : déposez ce fichier sur https://deno.com/deploy (entrée = ce
// fichier), puis passez l'URL obtenue à getTNT(lat, lon, { relay: '<url>' }).
//
// Usage : GET /?url=<URL encodée>
//   ex.  /?url=https%3A%2F%2Fmatnt.arcom.fr%2Fmctnt%2Fapi%2Fv1%2Fcoordinates-mv3%3F...
//
// Seuls les hôtes Arcom / ANFR / adresse.data.gouv.fr sont autorisés.

const ALLOWED_HOSTS: Record<string, string> = {
  "matnt.arcom.fr": "https://www.csa.fr/matnt/couverture",
  "scanfrequences.anfr.fr": "https://scanfrequences.anfr.fr/",
  "api-adresse.data.gouv.fr": "https://api-adresse.data.gouv.fr/",
};

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const reqUrl = new URL(req.url);
  if (reqUrl.pathname === "/" && !reqUrl.searchParams.has("url")) {
    return new Response("RF SHOT relay — OK", {
      headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "paramètre 'url' manquant" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let t: URL;
  try { t = new URL(target); }
  catch {
    return new Response(JSON.stringify({ error: "url invalide" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const referer = ALLOWED_HOSTS[t.hostname];
  if (!referer) {
    return new Response(JSON.stringify({ error: "hôte non autorisé : " + t.hostname }), {
      status: 403, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(t.toString(), {
      headers: { ...BROWSER_HEADERS, "Referer": referer },
      signal: AbortSignal.timeout(12000),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS, "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "échec amont", detail: String(e) }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
