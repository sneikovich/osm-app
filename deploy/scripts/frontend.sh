#!/bin/sh
# nginx: static page + /api/ proxy to the fetcher VM.
# Env: FETCHER_IP. Static files are uploaded to /tmp/provision/www/.
. /tmp/provision/lib.sh
: "${FETCHER_IP:?}"

apt-get install -y -qq nginx >/dev/null
reload=0

for f in index.html app.js style.css; do
    put "/var/www/overpass/$f" 0644 <"/tmp/provision/www/$f" || true
done

# Same locations as frontend/nginx.conf.template; the fetcher is a fixed IP, so no resolver.
# Quoted heredoc keeps nginx's $variables; @FETCHER_IP@ is filled in by sed.
site() {
    sed "s/@FETCHER_IP@/$FETCHER_IP/" <<'CONF'
# Managed by deploy/scripts/frontend.sh
server {
    listen 80 default_server;
    server_name _;
    root /var/www/overpass;

    location / {
        try_files $uri $uri/ =404;
    }

    location /api/ {
        proxy_pass http://@FETCHER_IP@:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Overpass timeout (<=180s) + client slack + retry back-off.
        proxy_read_timeout 300s;
        client_max_body_size 16k;
    }

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }
}
CONF
}
if site | put /etc/nginx/sites-available/overpass 0644; then reload=1; fi

if [ "$(readlink /etc/nginx/sites-enabled/overpass 2>/dev/null)" != /etc/nginx/sites-available/overpass ]; then
    ln -sfn /etc/nginx/sites-available/overpass /etc/nginx/sites-enabled/overpass
    echo "changed: sites-enabled/overpass"
    reload=1
fi
if [ -e /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
    echo "changed: removed sites-enabled/default"
    reload=1
fi

systemctl enable --quiet --now nginx
if [ "$reload" = 1 ]; then
    nginx -t -q
    log "reload nginx"
    systemctl reload nginx
fi

wait_http http://127.0.0.1/healthz
