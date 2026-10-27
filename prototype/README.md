# Station panel prototype

**PROTOTYPE — throwaway.** Nothing here is production code, nothing is wired to
a probe, and the whole directory is expected to move to a throwaway branch once
a variant wins.

## The question

Three reaches of the expanded station panel, over the same snapshot, on the
real Omarchy bar. The bar glyph and dot are held constant so only the panel is
under test.

| Variant | Answers | Structure |
|---|---|---|
| **A — triage list** | *Which check is blocking me?* | Flat worst-first list, no cards, thin verdict header |
| **B — instrument panel** | *What is the station doing right now?* | Verdict + 3-column readout grid, source/frequency/rate first, state as an edge |
| **C — guided flow** | *What do I do next?* | Operating order, one sentence per check, one suggested action |

## Run it

```bash
# install alongside the skeleton (throwaway copy, not a link)
mkdir -p ~/.config/omarchy/plugins/myockey.station-prototype
rsync -a --delete prototype/ ~/.config/omarchy/plugins/myockey.station-prototype/
omarchy-shell shell rescanPlugins
omarchy plugin enable myockey.station-prototype --section right
```

Disable the real skeleton while comparing so there is only one glyph:

```bash
omarchy plugin disable myockey.station
```

Editing the plugin on disk can leave a stale panel surface or a duplicate bar
widget instance — the file is new but the visible panel still renders the old
component. If what you see disagrees with the file, restart the shell rather
than rescanning:

```bash
omarchy-restart-shell
```

## Switch variants

With the panel open:

- `1` / `2` / `3` — variant A / B / C
- `s` — cycle the time-source ladder (see below)
- `Esc` — close

From a terminal:

```bash
omarchy-shell myockey.station-prototype variant B
omarchy-shell myockey.station-prototype sample no-fix
omarchy-shell myockey.station-prototype status
```

In the bar: left click opens, middle click cycles variant, right click cycles
sample state.

## The time model under test

Time readiness is **source-based**, not offset-based. The check asks which
source is disciplining the clock (GPS/PPS or NTP), whether the configured source
is healthy, and whether the clock is actually on it. A measured offset is only
ever relative to a source you already trust, so it is a diagnostic residual, not
an independent signal. The FT8 slot countdown is not part of readiness either.

The active source is the big readout; the detail is the most specific GPS rung:

| Rung | Readout | Detail | State |
|---|---|---|---|
| no GPS configured | NTP | `no GPS configured` | green |
| GPS disciplining | GPS | `3D fix · PPS` | green |
| GPS ready, not selected | NTP | `GPS ready · not selected` | green |
| GPS fix without PPS | GPS | `3D fix · no PPS` | green |
| no fix, NTP fallback | NTP | `GPS · no fix` | amber |
| gpsd not running | NTP | `gpsd not running` | amber |
| no GPS device | NTP | `no GPS device` | amber |
| no source at all | None | `no time source` | red |

Green assumes GPS is **optional**: NTP is adequate for digital modes, and a fix
does not force the clock onto GPS. A station that marks GPS **required** would
turn "ready but not selected" and "fix without PPS" amber as well. Amber is for
a configured GPS source that is *lost* while NTP carries the clock.

Samples:

| Sample | Time | Cat | Audio |
|---|---|---|---|
| `grey` | not probed | not probed | not probed |
| `green` | NTP, no GPS configured | ready | ready |
| `gps` | GPS 3D fix + PPS, disciplining | ready | ready |
| `gps-ready` | GPS ready, clock on NTP | ready | ready |
| `gps-no-pps` | GPS 3D fix, no PPS | ready | ready |
| `no-fix` | GPS no fix, NTP fallback | ready | ready |
| `gpsd-down` | gpsd not running, NTP fallback | ready | ready |
| `no-device` | no GPS device, NTP fallback | ready | ready |
| `red` | no source, free-running | ready | RX missing |

## The CAT model under test

CAT readiness is **link health**, not telemetry: `rigctld` reachable, serial
device present and permitted, rig answering frequency and mode. SWR, ALC and
forward power are TX-only, model-specific and calibration-dependent — the
FT-891 exposes them as raw `RM` meter values — so they are not part of the
check. The samples show `rigctld · PTT receive` as the secondary fact, not a
meter reading.

The CAT failure ladder still to add: no `rigctld` → no serial device →
permission denied → port busy → no response from the rig → ready.

PTT state is read-only and capability-gated: the FT-891 answers `TX;`, so the
sample shows `PTT receive`; a rig that does not answer `t` shows `rigctld`
alone. There is no PTT test button and no keying to measure SWR.

## After the decision

Capture the winning variant and why, fold it into the real `Panel.qml`, then
remove the plugin:

```bash
omarchy plugin remove myockey.station-prototype --yes
omarchy plugin enable myockey.station --section right
```

The losing variants and this directory belong on a `prototype/station-panel`
branch pointed at by the implementation issue, not on `main`.
