# Omarchy Station

A bar widget that answers one question: can this station work a digital mode
right now?

## Language

**Station**:
The installation the widget assesses: a host, a transceiver, an audio chain and
a time source, whether a portable backpack setup or a modest fixed one.
_Avoid_: setup, shack.

**Station path**:
One complete way the host reaches the transceiver: Host-audio or TNC. A station
declares every path it expects, so having both is two paths rather than a third
kind of station. _Avoid_: mode, profile, station class.

**Host-audio path**:
The station path where the host carries the audio: CAT control plus a Radio RX
and Radio TX role. _Avoid_: soundcard mode, audio setup.

**TNC path**:
The station path where a modem carries the audio and keys the rig itself, so no
host audio role and no CAT link exist. _Avoid_: hardware TNC, KISS mode.

**TNC transport**:
The link from the host to a modem: a USB serial device or a Bluetooth device.
_Avoid_: TNC port, modem device.

**Readiness**:
Whether the station can work a digital mode right now, expressed as the worst of
the checks its declared station paths make applicable. _Avoid_: health, status,
green.

**Check**:
One of the independent readiness questions: time sync, CAT control, radio audio,
TNC transport. A check serves a station path or, like time sync, the station as a
whole. _Avoid_: probe, indicator.

**Not applicable**:
A check that no declared station path needs. It is neither a pass nor a failure,
aggregation skips it, and the panel never renders it. _Avoid_: disabled,
ignored, ok.

**Probe**:
The observation that supplies a check with its state. A check is the product
concept; a probe is how it is answered. _Avoid_: check.

**Verdict**:
The one-line overall readiness statement at the top of the expanded panel.
_Avoid_: headline, status.

**Readout**:
The primary value in a check's panel column: time source, frequency, the
assigned radio node, or the TNC transport. _Avoid_: metric, value.

**Time source**:
The reference that disciplines the host clock: GPS/PPS, NTP, or none. A source
can be configured, healthy, selected, or lost. _Avoid_: time sync, clock.

**Clock discipline**:
The host clock being steered by a time source. The clock can be disciplined by a
fallback source while the configured source is lost. _Avoid_: sync, lock.

**GPS fix**:
gpsd has a position/time solution (TPV mode 2 or 3). A connected receiver, or a
serial device that looks present, is not a fix. _Avoid_: GPS lock, GPS presence.

**Source health**:
How far the configured time source has got, reported as the most specific rung:
package not installed, no device, daemon not running, no fix, fix without PPS,
ready but not selected, or disciplining the clock. _Avoid_: GPS status.

**GPS mode**:
The station's setting for whether GPS timing is expected: `Off` (no GPS, NTP is
enough), `Optional` (GPS configured, so losing it warns but a fix without PPS or
an unselected fix stays green) or `Required` (all three warn). _Avoid_: GPS
enabled, GPS strictness.

**Offset**:
The residual error between the host clock and a time source it already trusts.
It is a diagnostic, never a readiness signal. _Avoid_: drift, variance, skew.

**CAT link**:
The path from the widget to the rig: the `hamlib` package installed, `rigctld`
reachable, serial device present and permitted, rig answering frequency — and
mode where the backend reports it. _Avoid_: CAT status.

**Meter reading**:
A TX-only diagnostic such as SWR, ALC or forward power. Many rigs expose raw,
uncalibrated values, and some expose none at all; never a readiness signal.
_Avoid_: SWR, power.

**PTT state**:
Whether the rig reports itself as transmitting, read over CAT. It confirms the
keying path, not RF output. _Avoid_: PTT test, TX check.

**PTT test**:
Keying the rig to see whether it emits RF. Out of scope until a watchdog-backed
keying path exists. _Avoid_: PTT check.

**Radio audio**:
The station's sound path to and from the transceiver: a receive path the station
decodes from and a transmit path it plays tones into. It belongs to the
Host-audio path; a TNC path carries its audio inside the modem. _Avoid_: sound,
audio device, audio chain.

**Radio RX**:
The receive role in radio audio: the source a digital-mode app captures the
rig's audio from. A role, not a device. _Avoid_: input, microphone, capture
device.

**Radio TX**:
The transmit role in radio audio: the sink a digital-mode app plays its tones
into. A role, not a device. _Avoid_: output, speaker, playback device.

**Node assignment**:
The operator's explicit binding of Radio RX or Radio TX to one audio node. Two
roles, one node each; never bound silently. _Avoid_: mapping, selection,
auto-detect.

**Radio codec**:
An audio interface that carries radio audio: a Digirig, a SignaLink, or a rig's
built-in USB sound card. A codec reports its chip family, never the radio model
— a Digirig, an IC-7300 and a SignaLink can all announce "USB Audio CODEC".
_Avoid_: sound card, interface, dongle, known device.

**Codec family**:
The descriptor group a radio codec belongs to: C-Media CM108/CM119, TI PCM290x,
West Mountain. It is all the station can actually recognise, and it is shared
with consumer gear, so it suggests rather than identifies. _Avoid_: model,
device type.

**Silence**:
No audio arriving on Radio RX at this instant. Never a readiness signal: a
missing node is, an empty band is not. _Avoid_: no signal, dead air, level.

**Node suspend**:
The system idling an unused audio node. Normal between transmissions, and never
a readiness signal. _Avoid_: asleep, powered down, lost node.

**On-air output**:
The system default output being Radio TX, so unrelated sounds are transmitted.
A warning, never a failure: the station still works a digital mode. _Avoid_:
default sink, routing problem.
