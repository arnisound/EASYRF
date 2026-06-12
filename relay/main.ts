// EASYRF — Relais TNT (Deno Deploy)
// =================================
// Petit proxy qui permet au navigateur d'interroger l'ANFR (qui n'autorise
// pas les appels cross-origin). Il ajoute les bons en-têtes et renvoie la
// réponse avec les en-têtes CORS nécessaires.
//
// Usage : GET /?url=<URL encodée>
//   ex.  /?url=https%3A%2F%2Fscanfrequences.anfr.fr%2Fapi%2Fdata%3Flat%3D...
//
// Seuls les hôtes ANFR / CSA / adresse.data.gouv.fr sont autorisés (pas un
// proxy ouvert). Le Referer envoyé en amont dépend de l'hôte cible.

const ALLOWED_HOSTS: Record<string, string> = {
  "scanfrequences.anfr.fr": "https://scanfrequences.anfr.fr/",
  "api-adresse.data.gouv.fr": "https://api-adresse.data.gouv.fr/",
  "www.csa.fr": "https://www.csa.fr/matnt/couverture",
  "csa.fr": "https://www.csa.fr/matnt/couverture",
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const reqUrl = new URL(req.url);

  if (reqUrl.pathname === "/" && !reqUrl.searchParams.has("url")) {
    return new Response("EASYRF relay — OK", {
      headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "paramètre 'url' manquant" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let t: URL;
  try {
    t = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: "url invalide" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const referer = ALLOWED_HOSTS[t.hostname];
  if (!referer) {
    return new Response(
      JSON.stringify({ error: "hôte non autorisé : " + t.hostname }),
      { status: 403, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  try {
    const upstream = await fetch(t.toString(), {
      headers: { ...BROWSER_HEADERS, "Referer": referer },
      signal: AbortSignal.timeout(12000),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "échec amont", detail: String(e) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
