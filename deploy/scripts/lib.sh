# Sourced by every provisioning script (uploaded to /tmp/provision/lib.sh by the Vagrantfile).
set -eu
export DEBIAN_FRONTEND=noninteractive

log() { printf '==> %s\n' "$*"; }

# put DEST MODE [OWNER:GROUP] < content
# Installs stdin as DEST only if it differs. Returns 0 (and prints) when DEST changed, 1 otherwise,
# so callers can do: if put ...; then restart=1; fi
put() {
    dest=$1 mode=$2 owner=${3:-root:root}
    tmp=$(mktemp)
    cat >"$tmp"
    if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
        rm -f "$tmp"
        return 1
    fi
    install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$tmp" "$dest"
    rm -f "$tmp"
    printf 'changed: %s\n' "$dest"
}

# wait_http URL: fail provisioning if the service doesn't become healthy in ~60 s.
wait_http() {
    # -s without -S: the expected failures while the service starts stay quiet.
    if ! curl -fs -o /dev/null --retry 30 --retry-delay 2 --retry-all-errors "$1"; then
        echo "not healthy: $1" >&2
        return 1
    fi
    log "healthy: $1"
}
