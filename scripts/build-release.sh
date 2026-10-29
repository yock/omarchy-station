#!/usr/bin/env bash

# Build the registry publish tarball from an explicit runtime allowlist.
#
# The repo carries agent scaffolding (.agents/, AGENTS.md, skills-lock.json,
# docs/, test/, scripts/) that the plugin never loads. Packing the working tree
# would ship it for no runtime benefit, so this script names what ships instead
# of what it leaves out: a new file is absent from a release until someone adds
# it here, and a new dev-only file can never leak in silently.
#
# The same allowlist is what the official inspector requires: manifest.json at
# the archive root, no symlinks, no traversal, one preview at most.
#
# Usage: scripts/build-release.sh [output-dir]      (default: dist)

set -euo pipefail

fail() {
  echo "build-release: $*" >&2
  exit 1
}

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

[[ -f manifest.json ]] || fail "manifest.json not found in $repo_root"
command -v jq >/dev/null 2>&1 || fail "jq is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"

id=$(jq -r '.id // ""' manifest.json)
version=$(jq -r '.version // ""' manifest.json)
[[ -n $id ]] || fail "manifest id is empty"
[[ -n $version ]] || fail "manifest version is empty"

# Runtime files only. The name segment of the id is the archive's stem.
name=${id#*.}
output_dir=${1:-dist}
archive="$output_dir/$name-$version.tar.gz"

shopt -s nullglob
mapfile -t qml < <(printf '%s\n' *.qml | LC_ALL=C sort)
files=(manifest.json Readiness.js README.md LICENSE "${qml[@]}")

# A preview is optional (#15) and the inspector rejects more than one.
previews=()
for candidate in preview.png preview.jpg preview.jpeg preview.webp preview.avif preview.gif; do
  [[ -f $candidate ]] && previews+=("$candidate")
done
(( ${#previews[@]} <= 1 )) || fail "at most one preview image may ship: ${previews[*]}"
(( ${#previews[@]} == 0 )) || files+=("${previews[0]}")

for file in "${files[@]}"; do
  [[ -f $file ]] || fail "missing runtime file: $file"
  [[ ! -L $file ]] || fail "runtime file is a symlink: $file"
done

mkdir -p "$output_dir"
rm -f "$archive"

# Sorted QML input and fixed metadata keep the artifact byte-stable for a given
# tree, so a published checksum means something.
tar -czf "$archive" \
  --owner=0 --group=0 --numeric-owner \
  --mtime='UTC 1970-01-01' \
  --format=gnu \
  -T <(printf '%s\n' "${files[@]}")

# Verify the artifact rather than trusting the command that made it.
mapfile -t entries < <(tar -tzf "$archive")
(( ${#entries[@]} > 0 )) || fail "archive is empty"
(( ${#entries[@]} < 2000 )) || fail "archive has ${#entries[@]} entries; the registry limit is 2000"

[[ ${entries[0]} == manifest.json ]] || fail "manifest.json is not the first archive entry: ${entries[0]}"

allowed=$(printf '%s\n' "${files[@]}")
for entry in "${entries[@]}"; do
  [[ $entry == /* ]] && fail "absolute path in archive: $entry"
  [[ $entry == *..* ]] && fail "traversal path in archive: $entry"
  [[ -n $(printf '%s\n' "$allowed" | grep -Fx -- "$entry") ]] || fail "unexpected file in archive: $entry"
done

bytes=$(wc -c <"$archive")
(( bytes < 10 * 1024 * 1024 )) || fail "archive is $bytes bytes; the registry limit is 10 MB"

# A clean extraction is the only proof the archive is self-contained.
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
tar -xzf "$archive" -C "$scratch"
[[ -f "$scratch/manifest.json" ]] || fail "extraction has no manifest.json at its root"
if command -v omarchy >/dev/null 2>&1; then
  omarchy plugin validate "$scratch" >/dev/null \
    || fail "the extracted plugin does not pass omarchy plugin validate"
fi

echo "built $archive"
echo "  plugin: $id $version"
echo "  files:  ${#entries[@]}"
echo "  size:   $bytes bytes"
printf '  %s\n' "${entries[@]}"
