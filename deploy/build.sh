#!/bin/sh
# Build static (musl) binaries of the Rust services into deploy/dist/.
set -eu

TARGET=x86_64-unknown-linux-musl
here=$(cd "$(dirname "$0")" && pwd)
app=$(dirname "$here")
dist="$here/dist"

command -v musl-gcc >/dev/null || { echo "musl-gcc not found: sudo dnf install musl-gcc" >&2; exit 1; }
rustup target list --installed | grep -qx "$TARGET" \
    || { echo "rust target missing: rustup target add $TARGET" >&2; exit 1; }

export CC_x86_64_unknown_linux_musl=musl-gcc

build() { # <crate dir> <bin>
    echo "==> $2"
    cargo build --manifest-path "$app/$1/Cargo.toml" --release --target "$TARGET" --bin "$2"
    install -D -m 0755 "$app/$1/target/$TARGET/release/$2" "$dist/$2"
}

build overpass-api-fetcher overpass-server
build history history
file "$dist"/*
