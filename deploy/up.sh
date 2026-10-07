#!/bin/sh
# Build binaries and bring up all VMs (Vagrantfile lives in app/).
set -eu
here=$(cd "$(dirname "$0")" && pwd)

"$here/build.sh"
cd "$here/.." && vagrant up
echo "open http://192.168.56.13"
