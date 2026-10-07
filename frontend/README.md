# frontend

Веб-застосунок («Що поруч?») для [overpass-api-fetcher](../overpass-api-fetcher/README.md). Статика (HTML/CSS/vanilla JS + Leaflet у `vendor/`) без збірки, віддається через nginx, який також проксує `/api/` на фетчер.

```
browser ──► nginx :80 ─┬─ /         index.html, style.css, js/, vendor/
                       ├─ /healthz  200 ok
                       └─ /api/  ──► fetcher:8080 ──► Overpass
                                          └─ async ─► history:8081 ──► postgres
```

Фронтенд про history не знає: `User-Agent` браузера nginx передає у фетчер як є.

## Запуск усього стеку

З каталогу `app/`:

```sh
podman-compose up --build        # або docker compose up --build
# http://localhost:8080
podman-compose down
```

Масштабування (окремо для кожного сервісу):

```sh
podman-compose up -d --scale fetcher=3 --scale history=2
```

nginx перерезолвлює ім'я `fetcher` кожні 10 с і розподіляє запити між репліками; якщо репліка недоступна, бере наступну.

> `cannot open .../exec.fifo: No such file or directory` при `up` означає, що контейнери вже запущені. Спершу `podman-compose down`.
>
> podman-compose `down` не видаляє репліки, створені через `--scale` (`app_fetcher_2` тощо). Їх треба прибрати вручну: `podman rm -f app_fetcher_2`.

## Конфігурація

| змінна | за замовчуванням | що робить |
|---|---|---|
| `FETCHER_URL` | `http://fetcher:8080` | куди проксувати `/api/` |
| `NGINX_RESOLVER` | перший `nameserver` з `/etc/resolv.conf` | DNS для резолву `FETCHER_URL` |

`NGINX_RESOLVER` визначається автоматично (`15-resolver.envsh`) і працює в docker, podman і k8s. У k8s `FETCHER_URL` має містити повне ім'я: `http://fetcher.<ns>.svc.cluster.local:8080` — nginx не використовує search-домени.

Таймаут проксі 300 с (Overpass до 180 с + повтори фетчера).

## Окремо від compose

```sh
podman build -t overpass-frontend .
podman run --rm -p 8080:80 -e FETCHER_URL=http://<host>:8080 overpass-frontend
```

Локально без контейнера: запустити `overpass-server` і будь-який сервер, що проксує `/api/` на нього. `python -m http.server` не підійде — він не проксує.

## Інтерфейс

Мова — українська. Користувач:

1. обирає категорію-картку («Кафе», «Аптеки», «АЗС»…; список у `js/presets.js`) — або в «Розширених налаштуваннях» вводить власні OSM-теги й тип об'єктів;
2. вказує місце: пошук міста/адреси (Nominatim, лише за «Знайти»/Enter), «Моя локація», «Центр мапи» або клік по мапі (маркер можна перетягнути), радіус 100 м – 5 км;
3. бачить результати на мапі (кластери) та у списку за відстанню; popup містить адресу, години, телефон, сайт; доступний експорт CSV/GeoJSON.

Запит до бекенду завжди `around` (`POST api/query`), тож «вся планета» неможлива. Стан зберігається в URL (`#p=cafe&lat=50.45&lon=30.52&r=500`); старі посилання `#tags=…&area=around&coords=…` теж працюють.

Тайли — `tile.openstreetmap.org`, геокодинг — `nominatim.openstreetmap.org` (напряму з браузера), тож для карти потрібен доступ до інтернету.

## Тести

Чисті функції (`js/api.js`, `js/state.js`) покрито тестами без залежностей:

```sh
cd frontend && npm test        # node --test
```

## Файли

| файл | що це |
|---|---|
| `index.html`, `style.css` | сторінка |
| `js/` | ES-модулі: `app.js` (UI), `api.js` (запити, нормалізація), `presets.js`, `geocode.js`, `state.js` |
| `vendor/` | Leaflet 1.9.4 і markercluster 1.5.3 (локальні копії) |
| `test/`, `package.json` | юніт-тести (в образ не копіюються) |
| `nginx.conf.template` | конфіг nginx; підставляються лише `FETCHER_URL` і `NGINX_RESOLVER` |
| `15-resolver.envsh` | автовизначення DNS-резолвера при старті |
| `Dockerfile` | `nginx:1-alpine` |
