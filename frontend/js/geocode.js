// Пошук місця за назвою через Nominatim (один запит на дію користувача).
export async function geocode(text, signal) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: text, format: "jsonv2", limit: "5", "accept-language": "uk",
  });
  let resp;
  try {
    resp = await fetch(url, { signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Не вдалося знайти місце: немає зв'язку з сервісом пошуку.");
  }
  if (!resp.ok) throw new Error("Сервіс пошуку місць тимчасово недоступний.");
  const rows = await resp.json();
  return rows.map(r => ({ label: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }));
}
