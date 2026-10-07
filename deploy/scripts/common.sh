#!/bin/sh
# Every VM: package index, base tools, timezone.
. /tmp/provision/lib.sh

# Refresh the package index at most once an hour. Own stamp file: apt sets the lists' mtime
# to the server's Last-Modified, so their age says nothing about when we last updated.
stamp=/var/lib/apt/provision-update-stamp
if [ -z "$(find "$stamp" -mmin -60 2>/dev/null)" ]; then
    log "apt-get update"
    apt-get update -qq
    touch "$stamp"
fi
apt-get install -y -qq curl ca-certificates >/dev/null

if [ "$(timedatectl show -p Timezone --value)" != Europe/Kyiv ]; then
    timedatectl set-timezone Europe/Kyiv
    echo "changed: timezone"
fi
