# frontend

Веб-форма для [overpass-api-fetcher](../overpass-api-fetcher/README.md). Статика (HTML/CSS/vanilla JS) без збірки й залежностей, віддається через nginx, який також проксує `/api/` на фетчер.

```
browser ──► nginx :80 ─┬─ /         index.html, style.css, app.js
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

## Форма

| поле | формат |
|---|---|
| tags | по одному на рядок: `key=value` або `key` |
| area | `none`; `around` — `lat,lon,radius_m`; `bbox` — `south,west,north,east` |
| kind | all / node / way / relation |
| timeout | 1–180 с |

Стан форми зберігається в URL, посиланням можна поділитися; при відкритті такого посилання запит виконується одразу:

```
http://localhost:8080/#tags=amenity%3Dcafe&area=around&coords=50.4501%2C30.5234%2C300&kind=&timeout=25
```

Тема (темна/світла) — за системними налаштуваннями.

## Файли

| файл | що це |
|---|---|
| `index.html`, `style.css`, `app.js` | сторінка |
| `nginx.conf.template` | конфіг nginx; підставляються лише `FETCHER_URL` і `NGINX_RESOLVER` |
| `15-resolver.envsh` | автовизначення DNS-резолвера при старті |
| `Dockerfile` | `nginx:1-alpine` |
