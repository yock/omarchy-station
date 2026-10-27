# Omarchy Station

A station-readiness widget for [Omarchy](https://omarchy.org/) 4.x. One drawn
station glyph — a mast with a tip ball and signal arcs — and a small
green/amber/red dot; click it for the expanded readiness panel.

Radio audio, time sync and CAT control are all wired: the panel reports the
source disciplining the clock, the rig's frequency and mode, and the two
assigned PipeWire nodes, and it edits the audio assignments inline.

## Readiness model

The plugin treats station readiness as three independent checks:

| Check | What it answers |
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
├── BarWidget.qml          # station glyph, readiness dot, poll timer, IPC
├── ProbedCheck.qml        # shared poll state machine for the time and CAT checks
├── TimeProbe.qml          # chrony/timesyncd source health and gpsd facts
├── CatProbe.qml           # rigctld discovery, serial facts, f/m/t queries
├── AudioProbe.qml         # PipeWire presence, mute and default-output facts
├── StationGlyph.qml       # the drawn mast glyph
├── Panel.qml              # expanded readiness panel and assignment picker
├── Readiness.js           # pure state model, ladders, parsers, ranking
├── test/readiness-test.js # node tests for the model and the ladders
├── README.md
└── LICENSE
```

`Readiness.js` has no Qt types, so the same aggregation rules, the three
ladders, the tool-output parsers and the codec ranking are testable under Node.
The QML side only renders a snapshot; replacing the whole snapshot keeps the
bar, tooltip and panel consistent. Time and CAT share `ProbedCheck.qml`'s poll
state machine, which assembles facts off-screen and commits them in one
assignment, so a poll in flight never paints a half-updated check.

## Time sync

`chronyc -n tracking` answers first, because a GPS/PPS refclock lives in chrony;
stock Omarchy's `timedatectl timesync-status` is the fallback, with
`timedatectl show -p NTPSynchronized` deciding whether the clock is actually
steered. With GPS configured, `gpspipe -w` supplies the receiver list, the fix
mode and the satellite count, and `chronyc -n sources` says whether a PPS
refclock exists and whether it is the selected reference.

The readout is the source that is actually disciplining the clock. The detail is
the most specific rung: no GPS device, gpsd not running, no fix, fix without
PPS, ready but not selected, or the fix that is steering it. A fix never forces
the clock onto GPS, and an offset threshold is never applied — see ADR 0001.

`gpsMode` says what the station expects:

| Value | No device, gpsd down, no fix | Fix without PPS, or ready but not selected |
|---|---|---|
| `Off` (default) | `no GPS configured` | — |
| `Optional` | amber | green |
| `Required` | amber | amber |

```bash
omarchy bar set myockey.station gpsMode Optional
```

## CAT control

The widget attaches to an existing `rigctld`; it never starts one and never
opens the serial device. `pgrep -a -x rigctld` finds the daemon, its own command
line says which device and TCP port it was given, and `rigctl -m 2 -r
127.0.0.1:<port> f` (then `m`, then `t`) reads frequency, mode and PTT state. All
of it is read-only: nothing is keyed, and no meter reading is requested. See ADR
0003.

A reply is what proves the link. When the reply fails, the most specific device
fact explains it: serial device missing, permission denied, or the port held by
another program. A missing `rigctl` client is reported as unknown rather than
faulted, because nothing is known to be broken.

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
  BarWidget.qml TimeProbe.qml CatProbe.qml AudioProbe.qml StationGlyph.qml Panel.qml
rm -rf "$tmp"
```

## Install for local testing

Install it the same way any third-party plugin is installed:

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

A rescan can land mid-write and leave the widget unmounted; `omarchy restart
shell` is the reliable way to pick up a new probe file. Remove it with
`omarchy plugin remove myockey.station --yes` when you are done.

## Next

1. **Radio audio probe for a hardware TNC** — stations whose audio path lives
   inside the modem have no host nodes at all, so the audio check needs a
   separate design (#4).
2. **Top bar icon** — the station glyph and the status dot are settled; the
   compact icon treatment is tracked separately (#2).

## Safety

- The widget never keys the rig. PTT status is read only, and there is no test
  button until a watchdog-backed keying path exists.
- The widget never starts `rigctld` and never opens the serial device.
- No automatic root configuration, no clock stepping, no service restarts from
  the UI.
- Plugins run unsandboxed inside the long-lived Omarchy shell. Review any plugin
  before enabling it.

## License

MIT
