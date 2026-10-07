import { PRESETS, KINDS, presetById, MIN_RADIUS, MAX_RADIUS } from "./presets.js";
import { buildRequest, query, normalize, formatDistance, toGeoJSON, toCSV } from "./api.js";
import { geocode } from "./geocode.js";
import { encodeState, decodeState } from "./state.js";

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

const KYIV = { lat: 50.4501, lon: 30.5234 };
const state = { preset: "", center: null, radius: 500, items: [] };
let inflight = null, geoInflight = null, lastRequest = null;

// ---- мапа ----
const map = L.map("map", { zoomControl: true }).setView([KYIV.lat, KYIV.lon], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 }).addTo(map);
let pin = null, circle = null;
const markers = new Map();

function setCenter(c, { pan = true } = {}) {
  state.center = c;
  if (pin) pin.setLatLng(c);
  else {
    pin = L.marker(c, { draggable: true, zIndexOffset: 1000, title: "Центр пошуку" }).addTo(map);
    pin.on("dragend", () => setCenter(norm(pin.getLatLng()), { pan: false }));
  }
  if (circle) circle.setLatLng(c).setRadius(state.radius);
  else circle = L.circle(c, { radius: state.radius, weight: 1, fillOpacity: .06, interactive: false }).addTo(map);
  if (pan) map.fitBounds(circle.getBounds(), { maxZoom: 16 });
  $("place-hint").textContent = `Центр пошуку: ${c.lat.toFixed(4)}, ${(c.lon ?? c.lng).toFixed(4)}. Його можна перетягнути.`;
}
const norm = ll => ({ lat: ll.lat, lon: ll.lng ?? ll.lon });

map.on("click", e => setCenter(norm(e.latlng), { pan: false }));

// ---- форма ----
const presetsBox = $("presets");
for (const p of PRESETS) {
  const b = el("button", { type: "button", className: "preset" }, el("span", { className: "ico", textContent: p.icon }), p.label);
  b.dataset.id = p.id;
  b.setAttribute("role", "radio");
  b.setAttribute("aria-checked", "false");
  b.onclick = () => selectPreset(state.preset === p.id ? "" : p.id);
  presetsBox.append(b);
}
function selectPreset(id) {
  state.preset = id;
  for (const b of presetsBox.children) b.setAttribute("aria-checked", String(b.dataset.id === id));
  if (id) $("tags").value = "";
}
$("tags").addEventListener("input", () => { if ($("tags").value.trim()) selectPreset(""); });

for (const k of KINDS) $("kind").append(el("option", { value: k.value, textContent: k.label }));

function setRadius(r) {
  state.radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, r));
  $("radius").value = state.radius;
  $("radius-val").textContent = formatDistance(state.radius);
  if (circle) circle.setRadius(state.radius);
}
$("radius").addEventListener("input", e => setRadius(Number(e.target.value)));

// ---- місце ----
async function findPlace() {
  const text = $("place").value.trim();
  if (!text) { $("place").focus(); return; }
  if (geoInflight) geoInflight.abort();
  const ctl = (geoInflight = new AbortController());
  const list = $("suggest");
  list.hidden = true;
  setStatus("Шукаємо місце…", "busy");
  try {
    const found = await geocode(text, ctl.signal);
    if (!found.length) { setStatus("Такого місця не знайдено. Спробуйте іншу назву.", "err"); return; }
    setStatus("Оберіть місце зі списку або натисніть «Знайти місця».");
    if (found.length === 1) { setCenter(found[0]); return; }
    list.replaceChildren(...found.map(f => {
      const b = el("button", { type: "button", textContent: f.label });
      b.onclick = () => { setCenter(f); list.hidden = true; $("place").value = f.label.split(",")[0]; };
      return el("li", {}, b);
    }));
    list.hidden = false;
  } catch (e) {
    if (e.name !== "AbortError") setStatus(e.message, "err");
  }
}
$("find").onclick = findPlace;
$("place").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); findPlace(); } });

$("locate").onclick = () => {
  if (!navigator.geolocation) { setStatus("Браузер не підтримує визначення локації.", "err"); return; }
  setStatus("Визначаємо вашу локацію…", "busy");
  navigator.geolocation.getCurrentPosition(
    pos => { setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setStatus("Локацію визначено."); },
    () => setStatus("Не вдалося визначити локацію. Дозвольте доступ або оберіть місце на мапі.", "err"),
    { timeout: 10000 },
  );
};
$("view").onclick = () => setCenter(norm(map.getCenter()), { pan: false });

// ---- пошук ----
function setStatus(text, cls = "", retry = false) {
  const s = $("status");
  s.className = "status " + cls;
  s.textContent = text;
  if (retry) s.append(el("button", { type: "button", className: "secondary", textContent: "Повторити", onclick: () => run() }));
}

function currentTags() {
  const custom = $("tags").value.split("\n").map(s => s.trim()).filter(Boolean);
  return custom.length ? custom : (presetById(state.preset)?.tags ?? []);
}

async function run() {
  let req;
  try {
    req = buildRequest({ tags: currentTags(), center: state.center, radius: state.radius, kind: $("kind").value });
  } catch (e) { setStatus(e.message, "err"); return; }

  history.replaceState(null, "", "#" + encodeState({
    preset: $("tags").value.trim() ? "" : state.preset, tags: currentTags(),
    kind: $("kind").value, center: state.center, radius: state.radius,
  }));

  if (inflight) inflight.abort();
  const ctl = (inflight = new AbortController());
  $("go").disabled = true;
  setStatus("Шукаємо… це може зайняти до пів хвилини.", "busy");
  clearResults();
  try {
    const raw = await query(req, ctl.signal);
    state.items = normalize(raw, state.center);
    showResults(state.items);
  } catch (e) {
    if (e.name === "AbortError") return;
    setStatus(e.message, "err", true);
  } finally {
    if (inflight === ctl) { inflight = null; $("go").disabled = false; }
  }
}
$("q").addEventListener("submit", e => { e.preventDefault(); run(); });

// ---- результати ----
function clearResults() {
  cluster.clearLayers(); markers.clear();
  $("list").replaceChildren();
  $("toolbar").hidden = true;
}

function popup(i) {
  const box = el("div", { className: "popup" }, el("h3", { textContent: i.name }));
  const line = t => t && box.append(el("p", { textContent: t }));
  line(i.address); line(i.hours && `🕒 ${i.hours}`); line(i.phone && `📞 ${i.phone}`);
  if (i.website) box.append(el("p", {}, el("a", { href: i.website, target: "_blank", rel: "noopener noreferrer", textContent: "Сайт" })));
  box.append(el("p", {}, el("a", { href: i.osmUrl, target: "_blank", rel: "noopener noreferrer", textContent: "Відкрити в OpenStreetMap" })));
  return box;
}

function showResults(items) {
  if (!items.length) {
    setStatus("Нічого не знайдено. Збільште радіус, змініть місце або оберіть іншу категорію.");
    return;
  }
  setStatus(`Знайдено: ${items.length}. Найближче — ${formatDistance(items[0].dist)} від центру.`);
  const buttons = new Map();
  for (const i of items) {
    const m = L.marker([i.lat, i.lon], { title: i.name }).bindPopup(popup(i));
    m.on("click", () => highlight(i.key, false));
    markers.set(i.key, m);
    cluster.addLayer(m);
    const b = el("button", { type: "button", className: "item" },
      el("div", { className: "name" + (i.hasName ? "" : " none"), textContent: i.name }),
      el("div", { className: "meta", textContent: [formatDistance(i.dist), i.address].filter(Boolean).join(" · ") }));
    b.onclick = () => highlight(i.key, true);
    buttons.set(i.key, b);
    $("list").append(el("li", {}, b));
  }
  highlight.buttons = buttons;
  $("toolbar").hidden = false;
  map.fitBounds(L.latLngBounds([...items.map(i => [i.lat, i.lon]), [state.center.lat, state.center.lon]]), { padding: [30, 30], maxZoom: 17 });
}

function highlight(key, openOnMap) {
  for (const [k, b] of highlight.buttons ?? []) {
    b.classList.toggle("active", k === key);
    if (k === key && !openOnMap) b.scrollIntoView({ block: "nearest" });
  }
  const m = markers.get(key);
  if (m && openOnMap) {
    if (matchMedia("(max-width: 760px)").matches) setPanel(false);
    cluster.zoomToShowLayer(m, () => m.openPopup());
  }
}

// ---- експорт ----
function download(name, type, text) {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("dl-csv").onclick = () => download("places.csv", "text/csv;charset=utf-8", "﻿" + toCSV(state.items));
$("dl-json").onclick = () => download("places.geojson", "application/geo+json", JSON.stringify(toGeoJSON(state.items), null, 2));
$("share").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); setStatus("Посилання скопійовано."); }
  catch { setStatus("Скопіюйте посилання з адресного рядка браузера."); }
};

// ---- мобільна панель ----
function setPanel(open) {
  $("panel").classList.toggle("closed", !open);
  $("toggle").setAttribute("aria-expanded", String(open));
}
$("toggle").onclick = () => setPanel($("panel").classList.contains("closed"));

// ---- старт: відновлення зі стану в URL ----
setRadius(500);
const saved = decodeState(location.hash);
if (saved.center || saved.preset || saved.tags.length) {
  if (saved.tags.length && !presetById(saved.preset)) $("tags").value = saved.tags.join("\n");
  else selectPreset(saved.preset);
  if (saved.tags.length) { $("adv").open = true; }
  $("kind").value = saved.kind;
  setRadius(saved.radius);
  if (saved.center) {
    setCenter(saved.center);
    if (currentTags().length) run();
  }
}
