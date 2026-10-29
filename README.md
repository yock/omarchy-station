# Omarchy Station

A station-readiness widget for [Omarchy](https://omarchy.org/) 4.x. One drawn
station glyph — a mast with a tip ball and signal arcs — and a small
green/amber/red dot; click it for the expanded readiness panel.

Time sync, CAT control, radio audio and TNC transport are all wired: the panel
reports the source disciplining the clock, the rig's frequency and mode, the
two assigned PipeWire nodes or the modem's transport, and it edits the audio,
GPS and TNC settings inline.

## Readiness model

A station declares the paths it expects — **Host audio**, **TNC**, or **Both** —
and readiness is the worst of the checks those declarations make applicable.
The declaration is a setting, never inferred from what is plugged in. Change it
in the panel by clicking **Station paths** or pressing `s`.

| Check | Station path | What it answers |
|---|---|---|
| **Time sync** | station-wide | Which source is disciplining the clock — GPS/PPS or NTP? If GPS is configured, how far did it get: no device, gpsd down, no fix, fix without PPS, ready but not selected? A healthy NTP fallback still counts. |
| **CAT control** | Host audio | Is `hamlib` installed and `rigctld` reachable? What frequency/mode is the rig on? Is the serial device present and permitted? |
| **Radio audio** | Host audio | Are the assigned Radio RX and Radio TX nodes present on PipeWire and unmuted, and is Radio TX kept off the system default output? |
| **TNC transport** | TNC | Is the assigned serial device or Bluetooth address present? Is a process already holding it? A held port is ready, and names the holder. |

A check that no declared path needs is **not applicable**: aggregation skips
it, the counts exclude it, and the panel never draws it. The overall state is
the worst of the applicable checks:

- **Green** — every applicable check ready
- **Amber** — at least one applicable check needs attention, none failed
- **Red** — at least one applicable check failed
- **Grey** — not probed yet / incomplete data

A station declaring both paths is green only when both are. The verdict names
each declared path — "Host audio ready · TNC needs attention" — so a working
half stays visible. The dot is intentionally always visible, and grey is an
honest "cannot answer yet" state rather than a fake green.

## Presentation

The expanded panel is a verdict line over one flat row: time sync first, then
the declared paths' checks — two, three or four columns, decided by the
declaration alone and never by hardware state. Time leads with its source
rather than an offset, because a clock's variance is not a readiness signal;
radio audio leads with the assigned Radio RX node, so a failure still says which
node is missing. The bar keeps the station glyph and a single dot, and its
tooltip carries a line per declared path.

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
├── CatProbe.qml           # hamlib/rigctld discovery, serial facts, f/m/t queries
├── AudioProbe.qml         # PipeWire presence, mute and default-output facts
├── TncProbe.qml           # serial holdership and paired Bluetooth facts
├── StationGlyph.qml       # the drawn mast glyph
├── Panel.qml              # expanded readiness panel and assignment picker
├── Readiness.js           # pure state model, ladders, parsers, ranking
├── test/readiness-test.js # node tests for the model, ladders and settings
├── README.md
└── LICENSE
```

`Readiness.js` has no Qt types, so the same applicability rules, the four
ladders, the tool-output parsers and the codec and transport rankings are
testable under Node.
The QML side only renders a snapshot; replacing the whole snapshot keeps the
bar, tooltip and panel consistent. Time and CAT share `ProbedCheck.qml`'s poll
state machine, which assembles facts off-screen and commits them in one
assignment, so a poll in flight never paints a half-updated check.

## Settings

Every key is stored in this widget's bar entry and declared in `manifest.json`,
which stays the source of truth for type, accepted values and default.

| Key | Type | Accepted values | Default | What it changes |
|---|---|---|---|---|
| `refreshIntervalSec` | integer | 1–60 | `5` | How often the time, CAT and TNC checks are re-probed, in seconds; radio audio and Bluetooth state update live. CLI-only: `omarchy bar set myockey.station refreshIntervalSec 10`. |
| `gpsMode` | enum | `Off`, `Optional`, `Required` | `Off` | Whether GPS timing is expected, and how hard its loss bites. Editable from the panel: click Time sync or press `g`. The consequences are the [Time sync policy matrix](#time-sync), not restated here. |
| `stationPaths` | enum | `Host audio`, `TNC`, `Both` | `Host audio` | Which station paths the station expects. `Host audio` grades CAT control and radio audio; `TNC` grades the modem transport and makes CAT and radio audio not applicable; `Both` requires every declared path to be ready. Editable from the panel: click Station paths or press `s`. CLI: `omarchy bar set myockey.station stationPaths Both`. |
| `radioRxNode` | string | any PipeWire source `node.name`, or `(empty)` | `(empty)` | The source a digital-mode app captures the rig's audio from. Editable in the audio picker: click Radio audio or press `a`. |
| `radioTxNode` | string | any PipeWire sink `node.name`, or `(empty)` | `(empty)` | The sink a digital-mode app plays tones into. Editable in the audio picker: click Radio audio or press `a`. |
| `tncTransport` | string | an absolute serial device path, a Bluetooth address, or `(empty)` | `(empty)` | The modem's transport. Classified by shape and graded on holdership. Editable in the TNC picker: click TNC transport or press `t`. |

## Time sync

`chronyc -n tracking` answers first, because a GPS/PPS refclock lives in chrony;
stock Omarchy's `timedatectl timesync-status` is the fallback, with
`timedatectl show -p NTPSynchronized` deciding whether the clock is actually
steered. With GPS configured, `gpspipe -w` supplies the receiver list, the fix
mode and the satellite count, and `chronyc -n sources` says whether a PPS
refclock exists and whether it is the selected reference.

The readout is the source that is actually disciplining the clock. The detail is
the most specific rung: gpsd is not installed, no GPS device, gpsd not running,
no fix, fix without PPS, ready but not selected, or the fix that is steering it.
A fix never forces the clock onto GPS, and an offset threshold is never applied —
see ADR 0001.

`gpsMode` says what the station expects:

| Value | No device, gpsd down, no fix | Fix without PPS, or ready but not selected |
|---|---|---|
| `Off` (default) | `GPS mode off` | — |
| `Optional` | amber | green |
| `Required` | amber | amber |

```bash
omarchy bar set myockey.station gpsMode Optional
```

## GPS time sync setup

The check reports what the station is doing; it never installs, enables or
reconfigures anything. Stock Omarchy disciplines the clock with
systemd-timesyncd, so a station that leaves `gpsMode` at `Off` needs no extra
packages at all.

GPS *timing* — as opposed to GPS presence — needs two packages. `gpsd` brings
`pps-tools`; `chrony` is what can consume a GPS refclock.

```bash
omarchy pkg add gpsd chrony
```

`chronyd.service` conflicts with `systemd-timesyncd.service`, so hand the clock
over explicitly:

```bash
sudo timedatectl set-ntp false        # stops and disables systemd-timesyncd
sudo systemctl enable --now chronyd
```

Point gpsd at the receiver in `/etc/default/gpsd`. Naming the device and adding
`-n` matters: a receiver that arrives through the hotplug path cannot use kernel
PPS, and without `-n` gpsd stops feeding time whenever no client is connected.

```
DEVICES="/dev/ttyUSB0"
GPSD_OPTIONS="-n"
```

```bash
sudo systemctl enable --now gpsd.service
```

Then point chrony at gpsd's sockets in `/etc/chrony.conf`. gpsd creates one
socket per device it reads; `ls /run/chrony.*.sock` after gpsd starts shows the
real names. Arch's `gpsd.service` is already ordered after `chronyd.service`,
which the socket form needs.

```
refclock SOCK /run/chrony.ttyUSB0.sock refid GPS precision 1e-1 offset 0.2
refclock SOCK /run/chrony.pps0.sock refid PPS precision 1e-7
```

If no PPS socket appears, the shared-memory form is the alternative:
`refclock SHM 0 refid GPS precision 1e-1 offset 0.2` plus
`refclock SHM 1 refid PPS precision 1e-7`.

A receiver that carries PPS on the serial DCD line needs the PPS line discipline
attached. It does not survive a replug, so a udev rule is the place to automate
it if you want that:

```bash
sudo ppsldisc /dev/ttyUSB0
```

Verify with `gpsmon` (3D fix and `PPS` lines), `ppstest /dev/pps0`, then
`chronyc sources` (the GPS refclock selected, shown as `#*`) and `chronyc
tracking`. Then tell the widget what to expect:

```bash
omarchy bar set myockey.station gpsMode Optional   # or Required
```

**What udev already does.** The `gpsd` package ships
`/usr/lib/udev/rules.d/25-gpsd-usb.rules` and `gpsdctl@.service`: a recognised
GNSS receiver creates `/dev/gpsN` and is offered to a running gpsd on plug-in
(`USBAUTO="true"` in `/etc/default/gpsd`). Generic USB-serial chips — the FTDI
and PL2303 that many receivers sit behind — are deliberately excluded upstream,
because they match too much hardware; use `DEVICES=` or a local VID:PID rule for
those. Installing packages and switching time daemons cannot be automated from a
udev worker, and this plugin does not try.

If the GPS is only used for position, `gpsd` alone is enough: the check reports
`3D fix · no PPS` or `GPS ready · not selected` and stays green under
`gpsMode=Optional`.

## CAT control

The widget attaches to an existing `rigctld`; it never starts one and never
opens the serial device. `rigctld` and `rigctl` both come from the `hamlib`
package:

```bash
omarchy pkg add hamlib
```

`pgrep -a -x rigctld` finds the daemon, its own command line says which device
and TCP port it was given, and `rigctl -m 2 -r 127.0.0.1:<port> f` (then `m`,
then `t`) reads frequency, mode and PTT state. All of it is read-only: nothing
is keyed, and no meter reading is requested. See ADR 0003.

A reply is what proves the link. When the reply fails, the most specific device
fact explains it: serial device missing, permission denied, or the port held by
another program. `pgrep` exits the same way for a stopped daemon and for a
package that was never installed, so the probe asks `command -v rigctld` before
it blames the daemon: a missing package reads `hamlib is not installed` with an
install hint, and a package that is present but idle reads `rigctld not
running`. Both fail the link. A missing `rigctl` client while `rigctld` runs is
reported as unknown rather than faulted, because nothing is known to be broken.

## TNC transport

A TNC path puts the modem between the host and the rig: the modem carries the
audio and keys the transmitter itself, so there is no host audio role and often
no CAT link to check. Click **Station paths** in the panel, or press `s`, and
choose `TNC` or `Both`; the TNC transport picker then appears as the last cell.
The same declaration can be set from the CLI:

```bash
omarchy bar set myockey.station stationPaths TNC
omarchy bar set myockey.station tncTransport /dev/ttyACM0
# or a Bluetooth address
omarchy bar set myockey.station tncTransport AA:BB:CC:DD:EE:4F
```

The check grades the transport and stops there. The probe resolves the path
(so a `/dev/serial/by-id/` symlink is checked at its target) and tests
existence, character-device-ness and permission; a scan of `/proc` names a
process holding the port. A free port is opened read-only and closed again; a
held port is never opened, and nothing is ever written to a modem. A held port
reads **ready** and
names the holder — "in use by `direwolf` (pid 4711)" — because a process using
the declared modem is the strongest evidence the station works. A legacy
`/dev/ttyS*` port warns: it exists and opens whether or not a modem is attached,
so presence there proves nothing. Bluetooth is graded at paired and connected.
See ADR 0005.

No transport proves KISS: the check never claims it on the panel. Click the TNC
column or press `t` to open the inline transport picker. It lists serial devices
and paired Bluetooth devices, recognised modem names first, then paired but
unrecognised, then the rest; every row says its name suggests rather than
identifies. When a Host-audio station has a recognised modem on a serial port,
the verdict carries one line of text — "KISS modem on `/dev/ttyACM0` — declare a
TNC path" — never a state.

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
  BarWidget.qml TimeProbe.qml CatProbe.qml AudioProbe.qml TncProbe.qml StationGlyph.qml Panel.qml
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

1. **Bluetooth bridging** — BLE GATT and SPP bridging need an `rfcomm` binding
   the widget must not install, so they belong in their own design; the TNC
   check stops at paired and connected.
2. **Host-audio station with no CAT** — a real station, and a separate design
   (ADR 0004).
3. **Top bar icon** — the station glyph and the status dot are settled; the
   compact icon treatment is tracked separately (#2).

## Safety

- The widget never keys the rig. PTT status is read only, and there is no test
  button until a watchdog-backed keying path exists.
- The widget never starts `rigctld` and never opens the CAT serial device.
- A TNC port held by another process is never opened, and nothing is ever
  written to a modem. A free TNC port is opened read-only and closed at once.
- No automatic root configuration, no clock stepping, no service restarts from
  the UI.
- Plugins run unsandboxed inside the long-lived Omarchy shell. Review any plugin
  before enabling it.

## License

MIT
