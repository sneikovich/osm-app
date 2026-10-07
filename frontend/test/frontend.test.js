import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, normalize, distance, errorMessage, safeUrl, toCSV } from "../js/api.js";
import { encodeState, decodeState } from "../js/state.js";

test("buildRequest: around + kind", () => {
  const r = buildRequest({ tags: [" amenity=cafe ", ""], center: { lat: 50.45, lon: 30.52 }, radius: 300.4, kind: "node" });
  assert.deepEqual(r, { tags: ["amenity=cafe"], around: [50.45, 30.52, 300], timeout: 25, kind: "node" });
});

test("buildRequest: порожні теги / без місця", () => {
  assert.throws(() => buildRequest({ tags: [], center: { lat: 1, lon: 1 }, radius: 100 }), /Оберіть/);
  assert.throws(() => buildRequest({ tags: ["a=b"], center: null, radius: 100 }), /місце/);
});

test("normalize: центр, сортування, відкидання без координат", () => {
  const origin = { lat: 50, lon: 30 };
  const items = normalize([
    { type: "node", id: 1, lat: 50.01, lon: 30, tags: { name: "Далеко" } },
    { type: "way", id: 2, center: { lat: 50.001, lon: 30 }, tags: { "addr:street": "Хрещатик", "addr:housenumber": "1" } },
    { type: "relation", id: 3, tags: {} },
  ], origin);
  assert.equal(items.length, 2);
  assert.equal(items[0].key, "way/2");
  assert.equal(items[0].name, "Без назви");
  assert.equal(items[0].address, "Хрещатик, 1");
});

test("distance ≈ 111 км на градус широти", () => {
  assert.ok(Math.abs(distance({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111195) < 200);
});

test("errorMessage / safeUrl / toCSV", () => {
  assert.match(errorMessage(504), /радіус/);
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("example.com"), "https://example.com/");
  assert.match(toCSV([{ key: "node/1", name: 'А"Б', address: "", lat: 1, lon: 2, hours: "", phone: "", website: "", osmUrl: "u" }]), /"А""Б"/);
});

test("state: round-trip і старий формат", () => {
  const s = { preset: "cafe", tags: [], kind: "", center: { lat: 50.45, lon: 30.52 }, radius: 500 };
  assert.deepEqual(decodeState("#" + encodeState(s)), s);
  const old = decodeState("#tags=amenity%3Dcafe&area=around&coords=50.4501%2C30.5234%2C300&kind=node&timeout=25");
  assert.deepEqual(old.tags, ["amenity=cafe"]);
  assert.deepEqual(old.center, { lat: 50.4501, lon: 30.5234 });
  assert.equal(old.radius, 300);
  assert.equal(old.kind, "node");
});
