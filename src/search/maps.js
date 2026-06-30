const MAPBOX_TOKEN =
  "pk.eyJ1IjoiY2hyaXN3aG9uZ21hcGJveCIsImEiOiJjbDl6bzJ6N3EwMGczM3BudjZmbm5yOXFnIn0.lPhc5Z5H3byF_gf_Jz48Ug";

const MAPBOX_REFERER = "https://labs.mapbox.com/";

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchWithTimeout(url, options = {}, ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const STOPWORDS = new Set([
  "the",
  "of",
  "and",
  "de",
  "da",
  "do",
  "du",
  "la",
  "le",
  "el",
  "di",
  "dos",
  "das",
]);

function tokenize(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w)),
  );
}

function tokenMatches(qToken, tokens) {
  if (tokens.has(qToken)) return true;
  if (qToken.length >= 5) {
    const prefix = qToken.slice(0, 5);
    for (const t of tokens) {
      if (t.length >= 5 && t.slice(0, 5) === prefix) return true;
    }
  }
  return false;
}

function rerankByQueryContext(results, query) {
  const qTokens = [...tokenize(query)];
  if (qTokens.length === 0 || results.length === 0) return results;

  const resultPlaceTokens = results.map((r) => tokenize(r.place));

  const locationHintTokens = [];
  for (const t of qTokens) {
    for (const pt of resultPlaceTokens) {
      if (tokenMatches(t, pt)) {
        locationHintTokens.push(t);
        break;
      }
    }
  }
  if (locationHintTokens.length === 0) return results;

  const scored = results.map((r, i) => {
    const pt = resultPlaceTokens[i];
    const hits = locationHintTokens.filter((t) => tokenMatches(t, pt)).length;
    return { r, i, hits };
  });

  return scored.sort((a, b) => b.hits - a.hits || a.i - b.i).map((s) => s.r);
}

export async function mapboxSearch(q, proximity) {
  const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("language", "en");
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  if (proximity) url.searchParams.set("proximity", proximity);

  const r = await fetchWithTimeout(
    url,
    {
      headers: { Referer: MAPBOX_REFERER, "User-Agent": BROWSER_UA },
    },
    4000,
  );
  if (!r.ok) return [];
  const data = await r.json();
  const mapped = (data.features || []).map((f) => ({
    id: f.properties?.mapbox_id || f.id || "",
    name: f.properties?.name || "",
    place: f.properties?.place_formatted || "",
    full: f.properties?.full_address || f.properties?.place_formatted || "",
    type: f.properties?.feature_type || "",
    coords: f.geometry?.coordinates || null,
  }));
  return rerankByQueryContext(mapped, q);
}

function haversineMeters(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function ddgGetVqd(query) {
  try {
    const r = await fetchWithTimeout(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=maps`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      3500,
    );
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/vqd=["']?(\d+-\d+(?:-\d+)?)["']?/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function ddgLocalSearchRaw(query, vqd, lat, lng) {
  const url = new URL("https://duckduckgo.com/local.js");
  url.searchParams.set("tg", "maps_places");
  url.searchParams.set("rt", "D");
  url.searchParams.set("mkexp", "b");
  url.searchParams.set("wiki_info", "1");
  url.searchParams.set("q", query);
  url.searchParams.set("is_requery", "1");
  url.searchParams.set("vqd", vqd);
  if (lat != null && lng != null) {
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("location_type", "geoip");
  }
  try {
    const r = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json,text/javascript;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://duckduckgo.com/",
        },
      },
      4500,
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function ddgLocalSearch(query, lat, lng) {
  const vqd = await ddgGetVqd(query);
  if (!vqd) return null;
  const first = await ddgLocalSearchRaw(query, vqd, lat, lng);
  if (first && (first.results || []).length > 0) return first;
  const fallback = await ddgLocalSearchRaw(query, vqd, null, null);
  if (fallback && (fallback.results || []).length > 0) return fallback;
  return first || fallback || null;
}

function proxyImage(url) {
  if (!url || typeof url !== "string") return null;
  return `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(url)}`;
}

function normalizeText(s) {
  if (!s || typeof s !== "string") return s || "";
  return s
    .replace(/\\r\\n|\\r|\\n/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function mapDdgResult(r) {
  if (!r) return null;
  const photos = Array.isArray(r.thumbnails)
    ? r.thumbnails.slice(0, 12).map(proxyImage).filter(Boolean)
    : [];
  const reviews = Array.isArray(r.review_detail)
    ? r.review_detail.map((rv) => ({
        excerpt: normalizeText(rv.excerpt || ""),
        rating: Number(rv.rating) || 0,
        date: Number(rv.time_created) || 0,
        user: {
          name: normalizeText(rv.user?.name || ""),
          image: proxyImage(rv.user?.image_url) || null,
        },
      }))
    : [];
  return {
    name: r.name || null,
    category:
      r.ddg_category ||
      (Array.isArray(r.returned_categories) && r.returned_categories[0]?.[0]) ||
      null,
    address: r.address || r.mapkit_address || null,
    addressLines: r.address_lines || r.mapkit_address_lines || null,
    city: r.city || null,
    country: r.country_code || null,
    phone: r.phone || r.mapkit_phone || null,
    phoneDisplay: r.display_phone || r.phone || null,
    website: r.website || null,
    rating: typeof r.rating === "number" ? r.rating : null,
    reviewCount: typeof r.reviews === "number" ? r.reviews : null,
    hours: r.hours || null,
    image: proxyImage(r.image),
    photos,
    reviews,
    url: r.url || null,
    engine: r.engine || null,
    coordinates:
      r.coordinates && typeof r.coordinates.longitude === "number"
        ? [r.coordinates.longitude, r.coordinates.latitude]
        : null,
  };
}

async function pickBestDdgResult(name, lat, lng) {
  const ddg = await ddgLocalSearch(name, lat, lng);
  const results = ddg?.results || [];
  if (!results.length) return null;
  for (const r of results) {
    if (!r.coordinates) continue;
    const dist = haversineMeters(
      [r.coordinates.longitude, r.coordinates.latitude],
      [lng, lat],
    );
    if (dist <= 500) return r;
  }
  return results[0] || null;
}

async function wikipediaSummary(title) {
  try {
    const r = await fetchWithTimeout(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title,
      )}?redirect=true`,
      { headers: { "User-Agent": BROWSER_UA } },
      3000,
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (d.type === "disambiguation") return null;
    const c = d.coordinates;
    return {
      title: d.title,
      displayTitle: d.displaytitle,
      description: d.description,
      extract: d.extract,
      thumbnail: d.thumbnail?.source,
      originalImage: d.originalimage?.source,
      pageUrl: d.content_urls?.desktop?.page,
      wikidataId: d.wikibase_item,
      coords:
        c && typeof c.lon === "number" && typeof c.lat === "number"
          ? [c.lon, c.lat]
          : null,
    };
  } catch {
    return null;
  }
}

async function wikipediaGeoSearch(lat, lng, radius = 500, limit = 12) {
  try {
    const r = await fetchWithTimeout(
      `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lng}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`,
      { headers: { "User-Agent": BROWSER_UA } },
      3000,
    );
    if (!r.ok) return [];
    const d = await r.json();
    return d.query?.geosearch || [];
  } catch {
    return [];
  }
}

async function resolveWikipedia(name, lat, lng) {
  const direct = await wikipediaSummary(name);
  if (direct?.coords) {
    const dist = haversineMeters(direct.coords, [lng, lat]);
    if (dist <= 5000) return direct;
  }
  const hits = await wikipediaGeoSearch(lat, lng, 600, 15);
  if (!hits.length) return direct;
  const qTokens = tokenize(name);
  let best = null;
  let bestScore = 0;
  for (const h of hits) {
    const hTokens = tokenize(h.title);
    let overlap = 0;
    for (const t of qTokens) if (tokenMatches(t, hTokens)) overlap++;
    const score = overlap / Math.max(1, qTokens.size);
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  if (best && bestScore >= 0.5) {
    const s = await wikipediaSummary(best.title);
    if (s?.coords && haversineMeters(s.coords, [lng, lat]) <= 3000) return s;
  }
  return direct;
}

async function commonsImages(query, limit = 8) {
  try {
    const r = await fetchWithTimeout(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        query,
      )}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`,
      { headers: { "User-Agent": BROWSER_UA } },
      3000,
    );
    if (!r.ok) return [];
    const d = await r.json();
    const pages = d.query?.pages || {};
    const out = [];
    for (const p of Object.values(pages)) {
      const info = p.imageinfo?.[0];
      if (!info) continue;
      if (!/\.(jpe?g|png|webp|gif)$/i.test(info.url || "")) continue;
      out.push(info.thumburl || info.url);
    }
    return out;
  } catch {
    return [];
  }
}

async function overpassLookup(name, lat, lng) {
  const radius = 500;
  const escaped = name.replace(/["\\]/g, "\\$&");
  const q = `[out:json][timeout:6];(node(around:${radius},${lat},${lng})["name"="${escaped}"];way(around:${radius},${lat},${lng})["name"="${escaped}"];node(around:${radius},${lat},${lng})["name:en"="${escaped}"];way(around:${radius},${lat},${lng})["name:en"="${escaped}"];);out tags center 1;`;
  const body = `data=${encodeURIComponent(q)}`;
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const d = await Promise.any(
      endpoints.map(async (ep) => {
        const r = await fetch(ep, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": BROWSER_UA,
          },
          body,
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(String(r.status));
        return await r.json();
      }),
    );
    const el = d.elements?.[0];
    if (!el) return null;
    const center =
      el.type === "node"
        ? [el.lon, el.lat]
        : el.center
          ? [el.center.lon, el.center.lat]
          : null;
    return { id: el.id, type: el.type, tags: el.tags || {}, center };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

function mergeFallbackPlace(name, wiki, osm, commons) {
  const coords = wiki?.coords || osm?.center || null;
  if (!coords) return null;
  const tags = osm?.tags || {};
  const addrParts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:postcode"],
    tags["addr:city"],
    tags["addr:country"],
  ].filter(Boolean);
  const address = addrParts.length ? addrParts.join(", ") : null;
  const website = tags.website || tags["contact:website"] || null;
  const phone = tags.phone || tags["contact:phone"] || null;

  const photoPool = [];
  const seen = new Set();
  const pushPhoto = (url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    photoPool.push(proxyImage(url));
  };
  if (wiki?.originalImage) pushPhoto(wiki.originalImage);
  if (wiki?.thumbnail) pushPhoto(wiki.thumbnail);
  for (const url of commons || []) pushPhoto(url);

  return {
    name: wiki?.title || tags.name || name,
    category:
      tags.tourism ||
      tags.historic ||
      tags.amenity ||
      tags.shop ||
      (wiki?.description ? wiki.description : null),
    address,
    addressLines: addrParts.length ? addrParts : null,
    city: tags["addr:city"] || null,
    country: tags["addr:country"] || null,
    phone,
    phoneDisplay: phone,
    website,
    rating: null,
    reviewCount: null,
    hours: null,
    openingHoursText: tags.opening_hours || null,
    description: wiki?.extract || null,
    image: photoPool[0] || null,
    photos: photoPool.slice(0, 10),
    reviews: [],
    url: wiki?.pageUrl || null,
    engine: wiki ? "Wikipedia" : osm ? "OpenStreetMap" : null,
    coordinates: coords,
  };
}

async function fallbackEnrich(name, lat, lng) {
  const [wiki, osm, commons] = await Promise.all([
    resolveWikipedia(name, lat, lng),
    overpassLookup(name, lat, lng),
    commonsImages(name, 8),
  ]);
  return mergeFallbackPlace(name, wiki, osm, commons);
}

export async function enrichPlace(name, lat, lng) {
  let best = null;
  for (let attempt = 0; attempt < 2 && !best; attempt++) {
    best = await pickBestDdgResult(name, lat, lng);
  }
  if (best) return { name, lat, lng, place: mapDdgResult(best) };

  const fallback = await fallbackEnrich(name, lat, lng);
  return { name, lat, lng, place: fallback };
}
