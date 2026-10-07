#!/bin/sh
# One of our Rust services as a hardened systemd unit.
# Env: SVC_NAME (unit + system user), SVC_BINARY (uploaded to /tmp/provision/), SVC_PORT, SVC_ENV (KEY=VALUE lines).
. /tmp/provision/lib.sh
: "${SVC_NAME:?}" "${SVC_BINARY:?}" "${SVC_PORT:?}" "${SVC_ENV:?}"
restart=0

if ! id -u "$SVC_NAME" >/dev/null 2>&1; then
    useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$SVC_NAME"
    echo "changed: user $SVC_NAME"
fi

if put "/usr/local/bin/$SVC_BINARY" 0755 <"/tmp/provision/$SVC_BINARY"; then restart=1; fi

if printf '%s\n' "$SVC_ENV" | put "/etc/default/$SVC_NAME" 0640 "root:$SVC_NAME"; then restart=1; fi

if put "/etc/systemd/system/$SVC_NAME.service" 0644 <<UNIT; then restart=1; systemctl daemon-reload; fi
# Managed by deploy/scripts/rust-service.sh
[Unit]
Description=$SVC_NAME
Wants=network-online.target
After=network-online.target

[Service]
User=$SVC_NAME
Group=$SVC_NAME
EnvironmentFile=/etc/default/$SVC_NAME
ExecStart=/usr/local/bin/$SVC_BINARY
Restart=on-failure
RestartSec=3

NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX

[Install]
WantedBy=multi-user.target
UNIT

systemctl enable --quiet "$SVC_NAME"
if [ "$restart" = 1 ]; then
    log "restart $SVC_NAME"
    systemctl restart "$SVC_NAME"
else
    systemctl start "$SVC_NAME"
fi

wait_http "http://127.0.0.1:$SVC_PORT/healthz"
