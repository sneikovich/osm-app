// Звернення до бекенду (POST api/query) і чисті допоміжні функції.

// Збирає тіло запиту з людських параметрів. Кидає Error з зрозумілим текстом.
export function buildRequest({ tags, center, radius, kind }) {
  const clean = (tags || []).map(s => s.trim()).filter(Boolean);
  if (clean.length === 0) throw new Error("Оберіть, що шукати: категорію або власні теги.");
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
    throw new Error("Вкажіть місце: знайдіть місто, клікніть на мапі або натисніть «Моя локація».");
  }
  const req = { tags: clean, around: [round6(center.lat), round6(center.lon), Math.round(radius)], timeout: 25 };
  if (kind) req.kind = kind;
  return req;
}

const round6 = n => Math.round(n * 1e6) / 1e6;

export function errorMessage(status, serverText) {
  switch (status) {
    case 400: return "Некоректний запит. Перевірте теги та місце.";
    case 502: return "Сервіс карт відповів помилкою. Спробуйте ще раз трохи пізніше.";
    case 503: return "Сервіс карт зараз перевантажений. Зачекайте хвилину й повторіть.";
    case 504: return "Пошук тривав занадто довго. Зменште радіус або оберіть рідкіснішу категорію.";
    default:  return serverText ? `Помилка: ${serverText}` : `Не вдалося виконати запит (код ${status}).`;
  }
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function query(req, signal) {
  let resp;
  try {
    resp = await fetch("api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError(0, "Немає зв'язку із сервером. Перевірте інтернет і повторіть.");
  }
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new ApiError(resp.status, errorMessage(resp.status, body.error));
  return body.elements || [];
}

// Відстань у метрах (haversine).
export function distance(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(1)} км`;
}

function address(t) {
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
  return [street, t["addr:city"]].filter(Boolean).join(", ");
}

// Елемент Overpass → плоский об'єкт для UI; елементи без координат відкидаються.
export function normalize(elements, origin) {
  const out = [];
  for (const el of elements) {
    const pos = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center;
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) continue;
    const t = el.tags || {};
    out.push({
      key: `${el.type}/${el.id}`,
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      name: t.name || t["name:uk"] || "Без назви",
      hasName: Boolean(t.name || t["name:uk"]),
      address: address(t),
      hours: t.opening_hours || "",
      phone: t.phone || t["contact:phone"] || "",
      website: safeUrl(t.website || t["contact:website"]),
      lat: pos.lat,
      lon: pos.lon,
      dist: origin ? distance(origin, pos) : 0,
      tags: t,
    });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

// Лише http(s)-посилання, щоб не вставляти javascript: з чужих даних.
export function safeUrl(u) {
  if (!u) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
}

export function toGeoJSON(items) {
  return {
    type: "FeatureCollection",
    features: items.map(i => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [i.lon, i.lat] },
      properties: { id: i.key, name: i.name, ...i.tags },
    })),
  };
}

export function toCSV(items) {
  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = items.map(i => [i.key, i.name, i.address, i.lat, i.lon, i.hours, i.phone, i.website, i.osmUrl].map(q).join(","));
  return ["id,name,address,lat,lon,opening_hours,phone,website,osm_url", ...rows].join("\n");
}
