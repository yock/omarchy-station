# Registry submission notes

Maintainer copy-paste material for the two listings. Keep it in sync with the
README sections [Dependencies and permissions](../README.md#dependencies-and-permissions)
and [Safety](../README.md#safety), which are the source of truth.

Both registries ask the same two questions — what does it need, and what is it
allowed to touch — but they use different taxonomies.

## Identity

| Field | Value |
| --- | --- |
| Publisher handle | `yock` |
| Plugin id | `yock.station-readiness` |
| Display name | Station Readiness |
| Repository | https://github.com/yock/omarchy-station |
| License | MIT (SPDX) |
| Version | see `manifest.json`; tag `v<version>` |

## Official registry (plugins-2.omarchy.org)

Values are declared in `manifest.json`; the publish flow reads them.

| Field | Value |
| --- | --- |
| `category` | `system` |
| `tags` | `bar`, `audio`, `monitoring` |
| `compatibility` | Omarchy `>=4.0.0`, `<5.0.0`, apiVersion 1 |

## Community marketplace (plugins.omarchy.org)

The marketplace takes its listing metadata from the submission issue, not from
`manifest.json`, and its vocabulary differs: it has no `audio` or `monitoring`
tag.

| Field | Value |
| --- | --- |
| Category | `Widgets` |
| Tags | `bar`, `system` |
| Preview | `preview.png` at the repository root (#15) |

## Dependencies to state

> Omarchy 4.x with Quickshell, and PipeWire. Requires `systemd` for
> `timedatectl` and `udev`, `procps-ng` and `psmisc` for device discovery — all
> stock on Arch. Optional per check: `hamlib` with `rigctld` running for CAT
> control, `gpsd` plus `chrony` for GPS/PPS timing, `chrony` or
> `systemd-timesyncd` for NTP, BlueZ for a Bluetooth TNC.

## Permission boundary to state

> Runs as the user. No sudo, no polkit, no root configuration, no clock
> stepping, no service restarts, no writes to the rig or modem. No outbound
> network: the only socket is `rigctl` talking to `rigctld` on loopback. It
> reads `/etc/default/gpsd`, `/proc/<pid>/fd`, `/sys/class/tty` and udev
> properties, and opens a serial TNC port only when no process holds it, then
> read-only for a zero-byte read. All processes it spawns are listed in the
> README.

## Listing description

> Station readiness for digital-mode operators: time sync, CAT control, radio
> audio and TNC transport at a glance, with a green/amber/red bar indicator.
> One drawn station glyph and a status dot; the panel names whichever half of
> the station is at reduced capability.
