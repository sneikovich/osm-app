# deploy

Деплой стеку на окремі VM: Vagrant + libvirt. Провізіонінг — shell-скрипти з `scripts/`, які Vagrant запускає всередині кожної VM. Кожен сервіс працює у своїй VM нативно, як systemd-юніт або пакет дистрибутива, без контейнерів. Це альтернатива `compose.yaml`, код сервісів однаковий.

| VM | IP | порт | у VM |
|---|---|---|---|
| postgres | 192.168.56.10 | 5432 | `postgresql` (пакет Debian) |
| history | 192.168.56.11 | 8081 | `/usr/local/bin/history`, `history.service` |
| fetcher | 192.168.56.12 | 8080 | `/usr/local/bin/overpass-server`, `overpass-fetcher.service` |
| frontend | 192.168.56.13 | 80 | `nginx`, статика у `/var/www/overpass` |

Box `debian/trixie64`. 512 МБ RAM на VM, у postgres 1 ГБ. Rust-бінарники збираються на хості статично (musl) і копіюються у VM.

## Підготовка хоста (один раз)

```sh
sudo dnf install libvirt-devel gcc make musl-gcc
vagrant plugin install vagrant-libvirt
rustup target add x86_64-unknown-linux-musl
sudo systemctl enable --now libvirtd
sudo usermod -aG libvirt $USER        # потім перелогінитись
```

Плагін ставиться через `vagrant plugin install`, а не через dnf, бо Vagrant з репозиторію HashiCorp використовує власний Ruby.

## Запуск

Усі команди `vagrant` виконуються з `app/`, там лежить єдиний `Vagrantfile`.

```sh
deploy/up.sh        # build.sh + vagrant up
# http://192.168.56.13
deploy/down.sh      # vagrant destroy -f для всіх VM (дані БД теж)
```

`vagrant up` піднімає VM по черзі: postgres → history → fetcher → frontend (`VAGRANT_NO_PARALLEL`). Кожну VM провізіонують її власні скрипти одразу після старту, тож БД готова раніше, ніж history запускає міграцію.

```sh
vagrant status
vagrant ssh postgres
vagrant provision             # перекотити всі VM (після змін коду спершу deploy/build.sh)
vagrant provision fetcher     # лише одну
vagrant halt                  # зупинити всі; `vagrant halt fetcher` — одну
vagrant destroy -f fetcher    # знищити одну; `vagrant up fetcher` створить і налаштує її заново
```

## Провізіонінг

Vagrantfile завантажує у VM потрібні файли (provisioner `file` → `/tmp/provision/`) і запускає скрипти від root (provisioner `shell`). Налаштування (IP, облікові дані БД, endpoint Overpass) задаються в хешах `NET`/`SETTINGS` у Vagrantfile і передаються в скрипти як змінні оточення.

| VM | провізіонери по черзі |
|---|---|
| усі | `lib.sh` (upload), `common.sh`: apt, curl, timezone |
| postgres | `postgres.sh`: пакет, `conf.d/overpass.conf` (`listen_addresses`), рядок у `pg_hba.conf` для IP history, роль і БД |
| history | `dist/history` (upload), `rust-service.sh` |
| fetcher | `dist/overpass-server` (upload), `rust-service.sh` |
| frontend | `index.html`, `app.js`, `style.css` (upload), `frontend.sh`: nginx, сайт із `proxy_pass` на fetcher |

`rust-service.sh` — спільний для обох Rust-сервісів. Він створює системного користувача, ставить бінарник, пише `/etc/default/<svc>` і systemd-юніт з hardening, а наприкінці чекає `/healthz`.

Скрипти ідемпотентні. Файли пишуться через `put` з `lib.sh`, який міняє файл лише тоді, коли вміст відрізняється, і друкує `changed: <файл>`. Сервіс перезапускається лише після таких змін. Повторний `vagrant provision` без змін не виводить жодного `changed:` і нічого не перезапускає.

## Діагностика

```sh
vagrant ssh fetcher
systemctl status overpass-fetcher
journalctl -u overpass-fetcher -f
cat /etc/default/overpass-fetcher       # змінні оточення сервісу
```

| VM | юніт |
|---|---|
| postgres | `postgresql` |
| history | `history` |
| fetcher | `overpass-fetcher` |
| frontend | `nginx` |

З хоста:

```sh
curl 192.168.56.11:8081/healthz
curl 192.168.56.12:8080/healthz
curl -s 192.168.56.13/api/query -H 'content-type: application/json' \
  -d '{"tags":["amenity=cafe"],"around":[50.4501,30.5234,300]}'
```

БД:

```sh
vagrant ssh postgres -c 'sudo -u postgres psql history -c "select * from queries order by id desc limit 10"'
vagrant ssh postgres -- -N -L 5433:localhost:5432    # тунель: pgcli postgres://history:history@localhost:5433/history
```

## Файли

| шлях | що це |
|---|---|
| `build.sh` | статична збірка `overpass-server` і `history` → `dist/` |
| `up.sh`, `down.sh` | підняти / знищити всі VM |
| `../Vagrantfile` | усі VM: box, libvirt, IP, RAM, налаштування (`NET`, `SETTINGS`), порядок провізіонерів |
| `scripts/lib.sh` | `put` (ідемпотентний запис файлу), `wait_http`, `log` |
| `scripts/common.sh` | спільне для всіх VM |
| `scripts/rust-service.sh` | Rust-сервіс як systemd-юніт (history, fetcher) |
| `scripts/postgres.sh`, `scripts/frontend.sh` | postgres і nginx |

Пароль БД у Vagrantfile — dev-значення.
