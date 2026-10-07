#!/bin/sh
# PostgreSQL from Debian packages, reachable from the history VM only.
# Env: POSTGRES_IP, HISTORY_IP, DB_NAME, DB_USER, DB_PASSWORD.
. /tmp/provision/lib.sh
: "${POSTGRES_IP:?}" "${HISTORY_IP:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"

apt-get install -y -qq postgresql >/dev/null
systemctl enable --quiet --now postgresql

version=$(ls /etc/postgresql | sort -n | tail -1)
etc=/etc/postgresql/$version/main
restart=0 reload=0

# Debian's postgresql.conf includes conf.d/*.conf.
if put "$etc/conf.d/overpass.conf" 0644 postgres:postgres <<CONF; then restart=1; fi
# Managed by deploy/scripts/postgres.sh
listen_addresses = 'localhost,$POSTGRES_IP'
CONF

hba="host $DB_NAME $DB_USER $HISTORY_IP/32 scram-sha-256"
if ! grep -qxF "$hba" "$etc/pg_hba.conf"; then
    echo "$hba" >>"$etc/pg_hba.conf"
    echo "changed: $etc/pg_hba.conf"
    reload=1
fi

if [ "$restart" = 1 ]; then
    log "restart postgresql"
    systemctl restart postgresql
elif [ "$reload" = 1 ]; then
    log "reload postgresql"
    systemctl reload postgresql
fi

# Role and database; tables come from history's own migrations.
cd /tmp
runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 \
    -v user="$DB_USER" -v pass="$DB_PASSWORD" -v db="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'user') \gexec
ALTER ROLE :"user" WITH LOGIN PASSWORD :'pass';
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SQL

pg_isready -q -h "$POSTGRES_IP" -t 30
log "ready: $POSTGRES_IP:5432"
