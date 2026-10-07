// Стан пошуку в URL-хеші: #p=cafe&lat=50.45&lon=30.52&r=500
// Підтримує старий формат: #tags=...&area=around&coords=lat,lon,r&kind=...
export function encodeState(s) {
  const p = new URLSearchParams();
  if (s.preset) p.set("p", s.preset);
  else if (s.tags?.length) p.set("t", s.tags.join("\n"));
  if (s.kind) p.set("k", s.kind);
  if (s.center) {
    p.set("lat", s.center.lat.toFixed(5));
    p.set("lon", s.center.lon.toFixed(5));
    p.set("r", String(Math.round(s.radius)));
  }
  return p.toString();
}

export function decodeState(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const s = { preset: p.get("p") || "", tags: [], kind: p.get("k") || "", center: null, radius: 500 };
  if (p.has("t")) s.tags = p.get("t").split("\n").filter(Boolean);

  if (p.has("lat") && p.has("lon")) {
    s.center = { lat: Number(p.get("lat")), lon: Number(p.get("lon")) };
    if (p.has("r")) s.radius = Number(p.get("r"));
  } else if (p.has("tags")) {
    // старий формат
    s.tags = p.get("tags").split("\n").map(x => x.trim()).filter(Boolean);
    s.kind = p.get("kind") || "";
    const n = (p.get("coords") || "").split(",").map(Number);
    if (p.get("area") === "around" && n.length === 3 && n.every(Number.isFinite)) {
      s.center = { lat: n[0], lon: n[1] };
      s.radius = n[2];
    }
  }
  if (s.center && !(Number.isFinite(s.center.lat) && Number.isFinite(s.center.lon))) s.center = null;
  if (!Number.isFinite(s.radius)) s.radius = 500;
  return s;
}
