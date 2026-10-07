# deploy

Деплой стеку на окремі VM: Vagrant + libvirt, провізіонінг Ansible з хоста. Кожен сервіс працює у своїй VM нативно, як systemd-юніт або пакет дистрибутива, без контейнерів. Це альтернатива `compose.yaml`, код сервісів однаковий.

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

`vagrant up` піднімає VM по черзі. Після останньої (frontend) один раз запускається Ansible (`deploy/ansible/site.yml`) на всі чотири. Спершу на всіх VM виконується `common`, потім по черзі postgres → history → fetcher → frontend.

```sh
vagrant status
vagrant ssh postgres
vagrant provision             # перекотити Ansible на всі VM (після змін коду спершу deploy/build.sh)
vagrant halt                  # зупинити всі; `vagrant halt fetcher` — одну
vagrant up fetcher            # підняти одну зупинену VM
vagrant destroy -f fetcher    # знищити одну; повернути: `vagrant up fetcher && vagrant provision`
```

Ansible-провізіонер прив'язаний до VM frontend і завжди проходить по всіх VM (`limit = all`). Тому `vagrant up` окремої VM, крім frontend, провізіонінг не запускає. Після такого `up` виконайте `vagrant provision`. VM без змін дають `changed=0`.

| група Ansible | VM |
|---|---|
| `database` | postgres |
| `history_svc` | history |
| `fetcher_svc` | fetcher |
| `web` | frontend |

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
| `../Vagrantfile` | усі VM: box, libvirt, IP, RAM, групи Ansible |
| `ansible/group_vars/all.yml` | IP, порти, облікові дані БД, endpoint Overpass |
| `ansible/site.yml` | playbook: `common` на всіх, далі роль сервісу на своїй групі |
| `ansible/roles/rust_service` | спільна роль для Rust-сервісів: користувач, бінарник, `/etc/default/<svc>`, systemd-юніт з hardening, перевірка `/healthz` |
| `ansible/roles/{postgres,history,fetcher,frontend}` | ролі сервісів |

Пароль БД у `group_vars/all.yml` — dev-значення. Для реального середовища: `ansible-vault encrypt_string`.

Playbooks ідемпотентні: повторний `vagrant provision` без змін дає `changed=0`.
