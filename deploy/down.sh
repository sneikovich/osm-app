#!/bin/sh
# Destroy all service VMs (the postgres VM's data goes with it).
set -eu
here=$(cd "$(dirname "$0")" && pwd)

cd "$here/.." && vagrant destroy -f
