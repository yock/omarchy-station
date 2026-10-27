# Omarchy Station

A station-readiness widget for [Omarchy](https://omarchy.org/) 4.x. One drawn
station glyph — a mast with a tip ball and signal arcs — and a small
green/amber/red dot; click it for the expanded readiness panel.

This repository is a **skeleton**. The status model, bar indicator and expanded
panel are in place; the three probes are deliberately stubbed as `unknown` so
the next step is wiring, not untangling placeholder logic.

## Readiness model

The plugin treats station readiness as three independent checks:

| Check | What it will answer |
|---|---|
| **Time sync** | Which source is disciplining the clock — GPS/PPS or NTP? If GPS is configured, how far did it get: no device, gpsd down, no fix, fix without PPS, ready but not selected? A healthy NTP fallback still counts. |
| **CAT control** | Is `rigctld` reachable? What frequency/mode is the rig on? Is the serial device present and permitted? |
| **Radio audio** | Are the radio RX/TX devices present on PipeWire? Are they muted or suspended? What are the levels and sample rate? |

The overall state is the worst of the three:

- **Green** — all checks ready
- **Amber** — at least one check needs attention, none failed
- **Red** — at least one check failed
- **Grey** — not probed yet / incomplete data

The dot is intentionally always visible. Grey is an honest "not wired yet"
state rather than a fake green.

## Presentation

The expanded panel is a verdict line over a three-column readout: time source,
frequency and audio rate, each with a coloured rule underneath. Time leads with
its source rather than an offset, because a clock's variance is not a readiness
signal. The bar keeps the station glyph and a single dot.

The glyph is drawn in QML (`StationGlyph.qml`) rather than set in an icon font.
That keeps it legible at the bar's 18px optical canvas — the Nerd Font tower and
antenna glyphs all fuse into blobs at that size — and means the widget needs no
Nerd Font at all. Its arc tips stop short of the top-right corner so the status
dot is never crowded; the dot alone carries state.

The panel was chosen from three prototypes — triage list, instrument panel and
guided flow. The full set, including the losing variants and their sample data,
lives on the `prototype/station-panel` branch.

## Layout

```
omarchy-station/
├── manifest.json          # plugin id: myockey.station, kind: bar-widget
├── BarWidget.qml          # station glyph, readiness dot, panel loader, IPC
├── StationGlyph.qml       # the drawn mast glyph
├── Panel.qml              # expanded readiness panel
├── Readiness.js           # pure state model and aggregation
├── test/readiness-test.js # node test for the aggregation rules
├── README.md
└── LICENSE
```

`Readiness.js` has no Qt types, so the same aggregation rules are testable
under Node. The QML side only renders a snapshot; replacing the whole snapshot
keeps the bar, tooltip and panel consistent.

## Validate

From this directory:

```bash
omarchy plugin validate .
node test/readiness-test.js
```

QML lint (Qt 6):

```bash
tmp=$(mktemp -d)
ln -s /usr/share/omarchy/shell "$tmp/qs"
/usr/lib/qt6/bin/qmllint -I "$tmp" -I /usr/lib/qt6/qml \
  BarWidget.qml StationGlyph.qml Panel.qml
rm -rf "$tmp"
```

## Install for local testing

The plugin is not installed or enabled yet. Once you want to see it in the bar,
install it the same way any third-party plugin is installed:

```bash
omarchy plugin add https://github.com/<you>/omarchy-station.git --enable
omarchy bar move myockey.station right
```

For local iteration before the repository exists, copy the directory into the
plugin directory and enable it explicitly:

```bash
mkdir -p ~/.config/omarchy/plugins
cp -r ~/Work/omarchy-station ~/.config/omarchy/plugins/myockey.station
omarchy plugin enable myockey.station --section right
omarchy-shell shell rescanPlugins
```

Remove it with `omarchy plugin remove myockey.station --yes` when you are done.

## Next probes

1. **Time** — read `timedatectl timesync-status` (stock Omarchy) or
   `chronyc tracking` for the selected reference and sync state; read
   `gpspipe -w` for TPV/SKY when GPS is configured. Report the most specific
   rung of the source ladder: no device, gpsd not running, no fix, fix without
   PPS, ready but not selected, or disciplining. A fix does not force the clock
   onto GPS — chrony's selected reference is the active source, and a healthy
   NTP fallback still counts as ready. Do not grade the clock on an offset
   threshold: a residual measured against a trusted source is not an
   independent signal.
2. **CAT** — detect an existing `rigctld`, otherwise optionally start one;
   poll `rigctl -m 2 f`, `m`, and optionally `t` for PTT state. Do not open the
   serial device directly if another app already owns it. PTT state is
   read-only; there is no test button and no keying. SWR, ALC and forward
   power are TX-only, model-specific and calibration-dependent: read them only
   as a last-TX diagnostic if the rig reports them, and never let them affect
   readiness.
3. **Audio** — discover PipeWire nodes, label them **Radio RX** and **Radio TX**,
   show presence/mute/level/sample rate, and warn if Radio TX is the system
   default sink.

## Safety

- No PTT keying in the skeleton or the first probe release. Read-only PTT status
  is enough until a watchdog-backed keying path exists.
- No automatic root configuration, no clock stepping, no service restarts from
  the UI.
- Plugins run unsandboxed inside the long-lived Omarchy shell. Review any plugin
  before enabling it.

## License

MIT
