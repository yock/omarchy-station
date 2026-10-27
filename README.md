# Omarchy Station

A station-readiness widget for [Omarchy](https://omarchy.org/) 4.x. One drawn
station glyph — a mast with a tip ball and signal arcs — and a small
green/amber/red dot; click it for the expanded readiness panel.

Radio audio is wired: the panel reports the two assigned PipeWire nodes and
edits the assignments inline. Time sync and CAT control are still stubbed as
`unknown` (#1), so the panel stays honest about what it has not probed.

## Readiness model

The plugin treats station readiness as three independent checks:

| Check | What it will answer |
|---|---|
| **Time sync** | Which source is disciplining the clock — GPS/PPS or NTP? If GPS is configured, how far did it get: no device, gpsd down, no fix, fix without PPS, ready but not selected? A healthy NTP fallback still counts. |
| **CAT control** | Is `rigctld` reachable? What frequency/mode is the rig on? Is the serial device present and permitted? |
| **Radio audio** | Are the assigned Radio RX and Radio TX nodes present on PipeWire and unmuted, and is Radio TX kept off the system default output? |

The overall state is the worst of the three:

- **Green** — all checks ready
- **Amber** — at least one check needs attention, none failed
- **Red** — at least one check failed
- **Grey** — not probed yet / incomplete data

The dot is intentionally always visible. Grey is an honest "cannot answer yet"
state rather than a fake green.

## Presentation

The expanded panel is a verdict line over a three-column readout: time source,
frequency and the assigned radio, each with a coloured rule underneath. Time
leads with its source rather than an offset, because a clock's variance is not a
readiness signal; radio audio leads with the assigned Radio RX node, so a
failure still says which node is missing. The bar keeps the station glyph and a
single dot.

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
├── AudioProbe.qml         # PipeWire presence, mute and default-output facts
├── StationGlyph.qml       # the drawn mast glyph
├── Panel.qml              # expanded readiness panel and assignment picker
├── Readiness.js           # pure state model, audio ladder, codec ranking
├── test/readiness-test.js # node tests for the model and audio ladder
├── README.md
└── LICENSE
```

`Readiness.js` has no Qt types, so the same aggregation rules, the radio
audio ladder and the codec ranking are testable under Node. The QML side only
renders a snapshot; replacing the whole snapshot keeps the bar, tooltip and
panel consistent.

## Radio audio assignments

Two roles, one node each, stored as PipeWire `node.name` in this widget's
`shell.json` entry: `radioRxNode` (a non-stream audio source) and
`radioTxNode` (a non-stream audio sink). Click the radio column in the panel,
or press `a`, to open the inline picker; it lists source and sink candidates
ranked by codec family — radio-class, other USB audio, then onboard analog —
with Clear and Done rows. Up/Down move, Enter assigns, and Escape collapses the
picker before it closes the panel. Only nodes present right now are listed, and
nothing binds without an explicit choice.

A station can also be pre-configured from the CLI:

```bash
omarchy bar set myockey.station radioRxNode alsa_input.usb-codec-00.mono-fallback
omarchy bar set myockey.station radioTxNode alsa_output.usb-codec-00.analog-stereo
```

The picker persists through `bar.shell.updateEntryInline`, rebuilding the whole
entry from the current settings because that call replaces it. With no writable
bar entry the choice stays session-only. An unassigned role reads `unknown`, not
green: every digital-mode station needs an audio path. A vanished assignment
fails and is never rebound automatically.

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
  BarWidget.qml AudioProbe.qml StationGlyph.qml Panel.qml
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
3. **Audio** — done, against ADR 0002. Node presence, mute and Radio TX being
   the system default output drive the check through Quickshell's native
   PipeWire service; suspend, sample rate, levels and signal presence are never
   readiness signals. Stations with a hardware TNC have no host audio path at
   all and are designed separately (#4).

## Safety

- No PTT keying in the skeleton or the first probe release. Read-only PTT status
  is enough until a watchdog-backed keying path exists.
- No automatic root configuration, no clock stepping, no service restarts from
  the UI.
- Plugins run unsandboxed inside the long-lived Omarchy shell. Review any plugin
  before enabling it.

## License

MIT
