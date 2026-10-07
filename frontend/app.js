"use strict";

const form = document.getElementById("q");
const coords = document.getElementById("coords");
const hint = document.getElementById("coords-hint");
const status = document.getElementById("status");
const table = document.getElementById("result");
const tbody = table.querySelector("tbody");

const AREAS = {
  none:   { n: 0, placeholder: "",                    hint: "whole planet. slow; use a tag that is rare." },
  around: { n: 3, placeholder: "50.45,30.52,500",     hint: "lat,lon,radius_m" },
  bbox:   { n: 4, placeholder: "50.40,30.40,50.50,30.60", hint: "south,west,north,east" },
};

let inflight = null;

function syncArea() {
  const a = AREAS[form.area.value];
  coords.disabled = a.n === 0;
  coords.required = a.n > 0;
  coords.placeholder = a.placeholder;
  hint.textContent = a.hint;
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.className = isError ? "err" : "";
}

function buildRequest() {
  const req = {
    tags: form.tags.value.split("\n").map(s => s.trim()).filter(Boolean),
    timeout: Number(form.timeout.value),
  };
  if (form.kind.value) req.kind = form.kind.value;

  const area = form.area.value;
  const want = AREAS[area].n;
  if (want) {
    const nums = coords.value.split(",").map(s => Number(s.trim()));
    if (nums.length !== want || nums.some(Number.isNaN)) {
      throw new Error(`${area}: expected ${want} comma-separated numbers (${AREAS[area].hint})`);
    }
    req[area] = nums;
  }
  return req;
}

function coordOf(el) {
  if (el.type === "node") return { lat: el.lat, lon: el.lon };
  return el.center || null;
}

function cell(row, content, cls) {
  const td = row.insertCell();
  if (cls) td.className = cls;
  if (content instanceof Node) td.append(content);
  else td.textContent = content;
}

function render(elements) {
  tbody.replaceChildren();
  for (const el of elements) {
    const row = tbody.insertRow();
    const c = coordOf(el);
    const link = document.createElement("a");
    link.href = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    link.textContent = el.id;
    cell(row, el.type);
    cell(row, link);
    cell(row, c ? c.lat.toFixed(6) : "", "n");
    cell(row, c ? c.lon.toFixed(6) : "", "n");
    cell(row, (el.tags && el.tags.name) || "-");
  }
  table.hidden = elements.length === 0;
}

async function run() {
  let req;
  try {
    req = buildRequest();
  } catch (e) {
    setStatus(`error: ${e.message}`, true);
    return;
  }

  // Shareable link: the form state lives in the URL fragment.
  history.replaceState(null, "", "#" + new URLSearchParams(new FormData(form)).toString());

  if (inflight) inflight.abort();
  const ctl = (inflight = new AbortController());
  const started = performance.now();
  setStatus("fetching…");
  form.querySelector("button").disabled = true;

  try {
    const resp = await fetch("api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: ctl.signal,
    });
    const body = await resp.json().catch(() => ({ error: `${resp.status} ${resp.statusText}` }));
    if (!resp.ok) throw new Error(body.error || `${resp.status} ${resp.statusText}`);

    render(body.elements);
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(`${body.elements.length} elements in ${secs}s.`);
  } catch (e) {
    if (e.name === "AbortError") return;
    table.hidden = true;
    setStatus(`error: ${e.message}`, true);
  } finally {
    if (inflight === ctl) {
      inflight = null;
      form.querySelector("button").disabled = false;
    }
  }
}

function restore() {
  if (location.hash.length < 2) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of p) {
    const field = form.elements[k];
    if (field) field.value = v;
  }
  return p.has("tags");
}

form.addEventListener("change", e => { if (e.target.name === "area") syncArea(); });
form.addEventListener("submit", e => { e.preventDefault(); run(); });

const restored = restore();
syncArea();
if (restored) run();
