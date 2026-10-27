// Run with: node test/readiness-test.js
//
// Readiness.js is a QML import rather than a Node module, so evaluate it in a
// bare VM context and exercise the same functions the QML calls.

const assert = require("node:assert/strict")
const fs = require("node:fs")
const vm = require("node:vm")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "Readiness.js"), "utf8")
const context = {}
vm.createContext(context)
vm.runInContext(source, context)

const R = context

// Not probed: honest grey, not a fake green.
const empty = R.emptySnapshot()
assert.equal(R.overall(empty), R.UNKNOWN)
assert.equal(R.verdict(R.UNKNOWN), "Not probed yet")
assert.equal(R.rows(empty)[0].readout, "—")
assert.equal(R.counts(empty).unknown, 3)

const allReady = {
  time: R.check(R.OK, "NTP", "no GPS configured", "clock disciplined"),
  cat: R.check(R.OK, "14.074", "MHz USB · FT-891", "rigctld · PTT receive"),
  audio: R.check(R.OK, "USB codec", "Radio RX and TX ready", "TX: USB codec")
}
assert.equal(R.overall(allReady), R.OK)
assert.equal(R.rows(allReady).length, 3)
assert.equal(R.rows(allReady)[1].readout, "14.074")
assert.equal(R.rows(allReady)[1].meta, "rigctld · PTT receive")
const readyCounts = R.counts(allReady)
assert.equal(readyCounts.ready, 3)
assert.equal(readyCounts.attention, 0)
assert.equal(readyCounts.blocked, 0)
assert.equal(readyCounts.unknown, 0)
assert.equal(R.verdict(R.OK), "Station ready")
assert.match(R.verdictDetail(R.OK, R.counts(allReady)), /All three checks are green/)

const oneWarning = {
  time: R.check(R.OK, "NTP", "no GPS configured", "clock disciplined"),
  cat: R.check(R.WARN, "—", "rig not responding", ""),
  audio: R.check(R.OK, "USB codec", "Radio RX and TX ready", "TX: USB codec")
}
assert.equal(R.overall(oneWarning), R.WARN)
assert.equal(R.verdict(R.WARN), "Needs attention")
assert.match(R.verdictDetail(R.WARN, R.counts(oneWarning)), /1 of 3 checks needs attention/)

const oneFailure = {
  time: R.check(R.WARN, "NTP", "GPS · no fix", "GPS lost"),
  cat: R.check(R.FAIL, "—", "rigctld not running", ""),
  audio: R.check(R.OK, "USB codec", "Radio RX and TX ready", "TX: USB codec")
}
assert.equal(R.overall(oneFailure), R.FAIL)
assert.equal(R.verdict(R.FAIL), "Not ready")
assert.match(R.verdictDetail(R.FAIL, R.counts(oneFailure)), /1 check failed · 1 needs attention/)
assert.match(R.tooltip(oneFailure), /Station: Not ready/)
assert.match(R.tooltip(oneFailure), /CAT control: Fault/)

const partial = {
  time: R.check(R.OK, "NTP", "no GPS configured", "clock disciplined"),
  cat: R.check(R.UNKNOWN, "—", "Not probed yet", ""),
  audio: R.check(R.OK, "USB codec", "Radio RX and TX ready", "TX: USB codec")
}
assert.equal(R.overall(partial), R.UNKNOWN)
assert.equal(R.counts(partial).unknown, 1)

// ---- Radio audio: the state ladder (ADR 0002) --------------------------
//
// `audioCheck` is the seam: the probe resolves facts about the two assigned
// nodes, and the ladder owns the order, the wording and the meta carry-over.
// Only three things drive state — node presence, mute, and Radio TX being the
// system default output.

function audioInput(overrides) {
  const base = {
    pipewireReady: true,
    everReady: true,
    rx: { assigned: "", present: false, muted: false, nickname: "", description: "", radioCandidate: false },
    tx: { assigned: "", present: false, muted: false, nickname: "", description: "", radioCandidate: false, isDefault: false }
  }
  const merged = Object.assign({}, base, overrides || {})
  merged.rx = Object.assign({}, base.rx, (overrides || {}).rx || {})
  merged.tx = Object.assign({}, base.tx, (overrides || {}).tx || {})
  return merged
}

const RX = {
  assigned: "alsa_input.usb-codec-00.analog-stereo",
  present: true,
  nickname: "USB codec",
  description: "USB Audio CODEC"
}
const TX = {
  assigned: "alsa_output.usb-codec-00.analog-stereo",
  present: true,
  nickname: "USB codec",
  description: "USB Audio CODEC"
}

// Rung 1a: PipeWire has never announced itself ready. Grey, never red.
const booting = R.audioCheck(audioInput({ pipewireReady: false, everReady: false }))
assert.equal(booting.state, R.UNKNOWN)
assert.equal(booting.detail, "Waiting for PipeWire")

// Rung 1: PipeWire was ready and went away. Red, because nothing can answer.
const stopped = R.audioCheck(audioInput({ pipewireReady: false, everReady: true }))
assert.equal(stopped.state, R.FAIL)
assert.equal(stopped.detail, "PipeWire is not running")
assert.equal(stopped.readout, "—")

// Rung 2: an unassigned role is unknown, and names the missing role.
const noRx = R.audioCheck(audioInput({ tx: TX }))
assert.equal(noRx.state, R.UNKNOWN)
assert.equal(noRx.readout, "—")
assert.equal(noRx.detail, "Radio RX not assigned")

const noTx = R.audioCheck(audioInput({ rx: RX }))
assert.equal(noTx.state, R.UNKNOWN)
assert.equal(noTx.readout, "USB codec")
assert.equal(noTx.detail, "Radio TX not assigned")

const unassigned = R.audioCheck(audioInput())
assert.equal(unassigned.state, R.UNKNOWN)
assert.equal(unassigned.detail, "Radio RX and TX not assigned")

// A radio-class codec exists for both roles but nothing binds without the
// operator: the detail invites the assignment and the state stays unknown.
const invite = R.audioCheck(audioInput({
  rx: { radioCandidate: true },
  tx: { radioCandidate: true }
}))
assert.equal(invite.state, R.UNKNOWN)
assert.equal(invite.detail, "USB audio codec detected — assign it")

// Rung 3: a stale assignment. The operator chose a node that is gone; the
// readout still names it, so the failure says which one disappeared. Nothing
// rebinds it silently.
const staleRx = R.audioCheck(audioInput({ rx: Object.assign({}, RX, { present: false }), tx: TX }))
assert.equal(staleRx.state, R.FAIL)
assert.equal(staleRx.readout, RX.assigned)
assert.equal(staleRx.detail, 'Radio RX "' + RX.assigned + '" is not present')

// Rung 4: Radio TX vanished while Radio RX is fine.
const staleTx = R.audioCheck(audioInput({ rx: RX, tx: Object.assign({}, TX, { present: false }) }))
assert.equal(staleTx.state, R.FAIL)
assert.equal(staleTx.readout, "USB codec")
assert.equal(staleTx.detail, 'Radio TX "' + TX.assigned + '" is not present')

// Rung 5: RX muted is a warning — one toggle from ready, not a fault.
const mutedRx = R.audioCheck(audioInput({ rx: Object.assign({}, RX, { muted: true }), tx: TX }))
assert.equal(mutedRx.state, R.WARN)
assert.equal(mutedRx.detail, "Radio RX is muted — nothing will decode")

// Rung 6: TX muted.
const mutedTx = R.audioCheck(audioInput({ rx: RX, tx: Object.assign({}, TX, { muted: true }) }))
assert.equal(mutedTx.state, R.WARN)
assert.equal(mutedTx.detail, "Radio TX is muted — nothing will transmit")

// Rung 7: Radio TX is the system default output.
const onAir = R.audioCheck(audioInput({ rx: RX, tx: Object.assign({}, TX, { isDefault: true }) }))
assert.equal(onAir.state, R.WARN)
assert.equal(onAir.detail, "Radio TX is the default output — other sounds go on air")

// Rung 8: both nodes present, unmuted, and Radio TX is not the default.
const ready = R.audioCheck(audioInput({ rx: RX, tx: TX }))
assert.equal(ready.state, R.OK)
assert.equal(ready.readout, "USB codec")
assert.equal(ready.detail, "Radio RX and TX ready")
assert.equal(ready.meta, "TX: USB codec")

// One node for both roles: no second name to carry, so no meta.
const duplex = R.audioCheck(audioInput({
  rx: { assigned: RX.assigned, present: true, nickname: "USB codec" },
  tx: { assigned: RX.assigned, present: true, nickname: "USB codec" }
}))
assert.equal(duplex.state, R.OK)
assert.equal(duplex.meta, "")

// Readout falls back nickname → description → "—" for a present node, and a
// missing node is named by its assignment.
const described = R.audioCheck(audioInput({
  rx: { assigned: "alsa_input.codec", present: true, description: "USB Audio CODEC" },
  tx: TX
}))
assert.equal(described.readout, "USB Audio CODEC")
const unnamed = R.audioCheck(audioInput({
  rx: { assigned: "alsa_input.codec", present: true },
  tx: TX
}))
assert.equal(unnamed.readout, "—")

// More than one rung broken: state comes from the highest rung, and the rest
// ride along in meta prefixed "also: ".
const several = R.audioCheck(audioInput({
  rx: Object.assign({}, RX, { present: false }),
  tx: Object.assign({}, TX, { muted: true, isDefault: true })
}))
assert.equal(several.state, R.FAIL)
assert.equal(several.detail, 'Radio RX "' + RX.assigned + '" is not present')
assert.equal(
  several.meta,
  "also: Radio TX is muted — nothing will transmit · Radio TX is the default output — other sounds go on air"
)

// Unassigned outranks mute: an unconfigured check stays unknown, and the
// broken rung below it is still carried.
const unassignedWithMute = R.audioCheck(audioInput({
  tx: Object.assign({}, TX, { muted: true })
}))
assert.equal(unassignedWithMute.state, R.UNKNOWN)
assert.equal(unassignedWithMute.detail, "Radio RX not assigned")
assert.equal(unassignedWithMute.meta, "also: Radio TX is muted — nothing will transmit")

// ---- Radio audio: candidate ranking ------------------------------------
//
// Candidates are ranked by codec family, never by model. The matcher is the
// second seam: it takes node descriptors and returns the two role lists the
// picker renders.

function audioNode(name, description, extra) {
  return Object.assign({
    name: name,
    description: description,
    nickname: "",
    isSink: false,
    isStream: false,
    audio: true
  }, extra || {})
}

const TI_SOURCE = "alsa_input.usb-Burr-Brown_from_TI_USB_Audio_CODEC-00.analog-stereo"
const CMEDIA_SOURCE = "alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback"
const CMEDIA_PNP_SOURCE = "alsa_input.usb-C-Media_Electronics_Inc._USB_PnP_Sound_Device-00.analog-stereo"
const WEST_MOUNTAIN_SOURCE = "alsa_input.usb-West_Mountain_Radio_RIGblaster_Advantage_Audio-00.analog-stereo"

const ranked = R.audioCandidates([
  audioNode(WEST_MOUNTAIN_SOURCE, "USB Audio CODEC"),
  audioNode("alsa_input.pci-0000_00_1f.3.analog-stereo", "Built-in Audio Analog Stereo"),
  audioNode("alsa_input.usb-Generic_USB_Headset-00.mono", "USB Headset Mono"),
  audioNode(CMEDIA_SOURCE, "USB Audio CODEC"),
  audioNode(TI_SOURCE, "USB Audio CODEC"),
  audioNode(CMEDIA_PNP_SOURCE, "USB Audio CODEC"),
  audioNode("alsa_output.pci-0000_00_1f.3.hdmi-stereo", "HDMI Output", { isSink: true }),
  audioNode("alsa_output.pci-0000_00_1f.3.analog-stereo", "Built-in Audio Analog Stereo", { isSink: true }),
  audioNode("alsa_output.usb-codec.monitor", "Monitor of USB Audio CODEC", { isSink: true }),
  audioNode("firefox", "Firefox", { isStream: true }),
  audioNode("hdmi-capture", "HDMI capture", { audio: false }),
  audioNode("display-sink", "DisplayPort monitor", { isSink: true })
])

// Radio-class first, then other USB, then onboard; inside a tier by
// description, then node name, so two identical codecs keep a stable order.
assert.equal(ranked.rx.map(function(c) { return c.name }).join("|"), [
  TI_SOURCE,
  CMEDIA_SOURCE,
  CMEDIA_PNP_SOURCE,
  WEST_MOUNTAIN_SOURCE,
  "alsa_input.usb-Generic_USB_Headset-00.mono",
  "alsa_input.pci-0000_00_1f.3.analog-stereo"
].join("|"))
assert.equal(ranked.tx.map(function(c) { return c.name }).join("|"),
  "alsa_output.pci-0000_00_1f.3.analog-stereo")

assert.equal(ranked.rx[0].tier, R.TIER_RADIO)
assert.equal(ranked.rx[4].tier, R.TIER_USB)
assert.equal(ranked.rx[5].tier, R.TIER_ONBOARD)
assert.equal(ranked.tx[0].tier, R.TIER_ONBOARD)

// Every prefix family ranks radio-class. Reason lines name a codec family and
// never a radio model, so a Digirig and an IC-7300 stay the same string.
const families = [TI_SOURCE, CMEDIA_SOURCE, CMEDIA_PNP_SOURCE, WEST_MOUNTAIN_SOURCE]
for (const name of families) {
  const found = R.audioCandidates([audioNode(name, "USB Audio CODEC")]).rx[0]
  assert.equal(found.tier, R.TIER_RADIO, name)
  assert.match(found.reason, /radio-class codec/, name)
}
for (const bad of ["Digirig", "SignaLink", "IC-7300", "RIGblaster", "FT-891"]) {
  for (const candidate of ranked.rx.concat(ranked.tx)) {
    assert.ok(candidate.reason.indexOf(bad) === -1, "reason mentions " + bad)
  }
}

// A row carries label, description and reason; a nickname wins the label.
const nicknamed = R.audioCandidates([
  audioNode(CMEDIA_SOURCE, "USB Audio CODEC", { nickname: "Radio" })
]).rx[0]
assert.equal(nicknamed.label, "Radio")
assert.equal(nicknamed.description, "USB Audio CODEC")
assert.match(nicknamed.reason, /C-Media/)

// Same description, different names: the name breaks the tie.
assert.equal(
  R.audioCandidates([
    audioNode("alsa_input.z-codec", "USB Audio CODEC"),
    audioNode("alsa_input.a-codec", "USB Audio CODEC")
  ]).rx.map(function(c) { return c.name }).join("|"),
  "alsa_input.a-codec|alsa_input.z-codec"
)

// A sink is never a Radio RX candidate and a source is never Radio TX.
const roles = R.audioCandidates([
  audioNode("alsa_input.codec", "Input"),
  audioNode("alsa_output.codec", "Output", { isSink: true })
])
assert.equal(roles.rx.map(function(c) { return c.name }).join("|"), "alsa_input.codec")
assert.equal(roles.tx.map(function(c) { return c.name }).join("|"), "alsa_output.codec")

// A non-USB node that is not PCI/platform hardware is tier three but does not
// claim to be the host's built-in audio.
const bluetooth = R.audioCandidates([
  audioNode("bluez_output.headset", "Bluetooth Headset", { isSink: true })
]).tx[0]
assert.equal(bluetooth.tier, R.TIER_ONBOARD)
assert.match(bluetooth.reason, /other system audio/)
assert.ok(bluetooth.reason.indexOf("onboard") === -1)

// The picker and the bar widget must write the same shell.json key per role.
assert.equal(R.audioSettingKey("rx"), "radioRxNode")
assert.equal(R.audioSettingKey("tx"), "radioTxNode")

// Nothing to offer is an empty list, not an error.
assert.equal(R.audioCandidates([]).rx.length, 0)
assert.equal(R.audioCandidates([]).tx.length, 0)
assert.equal(R.audioCandidates(undefined).rx.length, 0)
assert.equal(R.audioCandidates(undefined).tx.length, 0)

// ---- Time sync: the source ladder (ADR 0001) ---------------------------
//
// `timeCheck` is the seam: the probe resolves which daemon is running, whether
// the clock is disciplined, and how far the GPS source got. The ladder owns
// the rung order, the gpsMode policy and the wording. An offset is never
// consulted, and a healthy NTP fallback is still a ready clock.

// Facts start from the neutral set the probe uses, so the helper tracks the
// shape instead of restating it.
function timeInput(overrides) {
  const base = R.timeFacts()
  const given = overrides || {}
  const merged = Object.assign({}, base,
    { daemon: "chrony", synced: true, server: "0.arch.pool.ntp.org" }, given)
  merged.gps = Object.assign({}, base.gps, given.gps || {})
  return merged
}

// Nothing probed yet is grey, not "no time source".
assert.equal(R.notProbed().state, R.UNKNOWN)
assert.equal(R.notProbed().detail, "Not probed yet")

// The setting is case-insensitive and anything unrecognised means off.
assert.equal(R.gpsModeOf("Off"), R.GPS_OFF)
assert.equal(R.gpsModeOf("OPTIONAL"), R.GPS_OPTIONAL)
assert.equal(R.gpsModeOf("required"), R.GPS_REQUIRED)
assert.equal(R.gpsModeOf(undefined), R.GPS_OFF)

// No daemon at all: the clock is free-running, and that is a fault.
const noDaemon = R.timeCheck(timeInput({ daemon: "none", synced: false }))
assert.equal(noDaemon.state, R.FAIL)
assert.equal(noDaemon.readout, "None")
assert.equal(noDaemon.detail, "no time source")
assert.equal(noDaemon.meta, "clock free-running")

// A daemon that is up but not steering the clock is a fault, not "unknown":
// the station has no trustworthy UTC right now.
const unsyncedNtp = R.timeCheck(timeInput({ synced: false }))
assert.equal(unsyncedNtp.state, R.FAIL)
assert.equal(unsyncedNtp.readout, "None")
assert.equal(unsyncedNtp.detail, "clock not synchronised")
assert.match(unsyncedNtp.meta, /chrony/)
assert.match(unsyncedNtp.meta, /0\.arch\.pool\.ntp\.org/)

const unsyncedTimesyncd = R.timeCheck(timeInput({
  daemon: "timesyncd",
  synced: false,
  server: ""
}))
assert.match(unsyncedTimesyncd.meta, /systemd-timesyncd/)

// No GPS configured and NTP carrying the clock: green, and the detail says
// the GPS absence is intentional rather than broken.
const ntpReady = R.timeCheck(timeInput())
assert.equal(ntpReady.state, R.OK)
assert.equal(ntpReady.readout, "NTP")
assert.equal(ntpReady.detail, "no GPS configured")
assert.equal(ntpReady.meta, "clock disciplined")

// GPS configured but lost: the check warns even though NTP still carries the
// clock, because the station's intended source is gone.
const gpsdDown = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: false }
}))
assert.equal(gpsdDown.state, R.WARN)
assert.equal(gpsdDown.readout, "NTP")
assert.equal(gpsdDown.detail, "gpsd not running")
assert.equal(gpsdDown.meta, "GPS lost")

// A missing gpspipe is not the same as a stopped daemon: the package is not
// installed, and that is what the operator has to fix.
const gpsdMissing = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: false, installed: false }
}))
assert.equal(gpsdMissing.state, R.WARN)
assert.equal(gpsdMissing.detail, "gpsd is not installed")
assert.equal(gpsdMissing.meta, "GPS lost")

// A configured device that is not there is more specific than a daemon that
// is not running, so it is reported first.
const noDevice = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: false, missing: true }
}))
assert.equal(noDevice.state, R.WARN)
assert.equal(noDevice.detail, "no GPS device")

// gpsd up but reporting no receivers is the same rung.
const noReceiver = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: true, devices: 0 }
}))
assert.equal(noReceiver.state, R.WARN)
assert.equal(noReceiver.detail, "no GPS device")

// No fix: warn, and the used-satellite count explains it.
const noFix = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: true, devices: 1, mode: 0, satellites: 0 }
}))
assert.equal(noFix.state, R.WARN)
assert.equal(noFix.detail, "GPS · no fix")
assert.equal(noFix.meta, "GPS lost")

const noFixSats = R.timeCheck(timeInput({
  gpsMode: "required",
  gps: { gpsd: true, devices: 1, mode: 0, satellites: 4 }
}))
assert.equal(noFixSats.meta, "GPS lost · 4 satellites")

// A fix without PPS stays green when GPS is optional: NMEA timing is enough
// for a digital mode. Marking GPS required turns the same rung amber.
const noPps = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: true, devices: 1, mode: 3, satellites: 9, pps: false, selected: false }
}))
assert.equal(noPps.state, R.OK)
assert.equal(noPps.readout, "NTP")
assert.equal(noPps.detail, "3D fix · no PPS")
assert.equal(noPps.meta, "clock disciplined")

const noPpsRequired = R.timeCheck(timeInput({
  gpsMode: "required",
  gps: { gpsd: true, devices: 1, mode: 3, satellites: 9, pps: false, selected: false }
}))
assert.equal(noPpsRequired.state, R.WARN)
assert.equal(noPpsRequired.meta, "GPS required")

// When chrony is disciplined by the NMEA refclock rather than PPS, the
// readout is still GPS: it is the source actually steering the clock.
const nmeaSelected = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: true, devices: 1, mode: 2, pps: false, selected: true }
}))
assert.equal(nmeaSelected.state, R.OK)
assert.equal(nmeaSelected.readout, "GPS")
assert.equal(nmeaSelected.detail, "2D fix · no PPS")
assert.equal(nmeaSelected.meta, "NMEA timing")

// Ready but not selected: reported, green unless GPS is required.
const readyNotSelected = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: true, devices: 1, mode: 3, satellites: 9, pps: true, selected: false }
}))
assert.equal(readyNotSelected.state, R.OK)
assert.equal(readyNotSelected.readout, "NTP")
assert.equal(readyNotSelected.detail, "GPS ready · not selected")
assert.equal(readyNotSelected.meta, "clock disciplined")

const readyNotSelectedRequired = R.timeCheck(timeInput({
  gpsMode: "required",
  gps: { gpsd: true, devices: 1, mode: 3, pps: true, selected: false }
}))
assert.equal(readyNotSelectedRequired.state, R.WARN)
assert.equal(readyNotSelectedRequired.meta, "GPS required")

// The top rung: GPS has a fix and PPS, and chrony is using it.
const disciplining = R.timeCheck(timeInput({
  gpsMode: "required",
  gps: { gpsd: true, devices: 1, mode: 3, satellites: 9, pps: true, selected: true }
}))
assert.equal(disciplining.state, R.OK)
assert.equal(disciplining.readout, "GPS")
assert.equal(disciplining.detail, "3D fix · PPS")
assert.equal(disciplining.meta, "clock disciplined")

// A clock that is not disciplined outranks every GPS rung: no source health
// can be claimed while chrony is not steering the clock.
const unsyncedWithGps = R.timeCheck(timeInput({
  gpsMode: "required",
  synced: false,
  gps: { gpsd: true, devices: 1, mode: 3, pps: true, selected: true }
}))
assert.equal(unsyncedWithGps.state, R.FAIL)
assert.equal(unsyncedWithGps.detail, "clock not synchronised")

// The setting arrives from shell.json as whatever the manifest offers, so the
// ladder has to accept the displayed casing too.
const optionalCased = R.timeCheck(timeInput({ gpsMode: "Optional", gps: { gpsd: false } }))
assert.equal(optionalCased.state, R.WARN)

// ---- Time sync: reading the tools -------------------------------------
//
// The probe runs the tools and hands their output to these parsers. Each one
// is tolerant of a truncated or missing answer and returns neutral facts for
// it, so a stopped daemon can never be read as healthy. The fixtures are the
// real output shapes of chronyc, timedatectl and gpspipe.

const CHRONY_TRACKING = [
  "Reference ID    : 84A36006 (0.arch.pool.ntp.org)",
  "Stratum         : 2",
  "Ref time (UTC)  : Mon Oct 26 03:27:16 2026",
  "System time     : 0.000003456 seconds fast of NTP time",
  "Last offset     : +0.000000123 seconds",
  "RMS offset      : 0.000054321 seconds",
  "Frequency       : 0.123 ppm slow",
  "Residual freq   : +0.001 ppm",
  "Skew            : 0.123 ppm",
  "Root delay      : 0.021315 seconds",
  "Root dispersion : 0.000412 seconds",
  "Update interval : 34.1 seconds",
  "Leap status     : Normal"
].join("\n")

const tracking = R.chronyTrackingFacts(CHRONY_TRACKING)
assert.equal(tracking.synced, true)
assert.equal(tracking.server, "0.arch.pool.ntp.org")
assert.equal(tracking.reference, "84A36006")

// A reference without a resolvable name still tells us what carries the
// clock, so the address becomes the server.
const numericReference = R.chronyTrackingFacts([
  "Reference ID    : 17A1E1FA (   )",
  "Leap status     : Normal"
].join("\n"))
assert.equal(numericReference.server, "17A1E1FA")

// Chrony before its first sync: a zero reference and a clear leap status.
const chronyUnsynced = R.chronyTrackingFacts([
  "Reference ID    : 00000000 ()",
  "Stratum         : 0",
  "Leap status     : Not synchronised"
].join("\n"))
assert.equal(chronyUnsynced.synced, false)
assert.equal(chronyUnsynced.server, "")

// Nothing on stderr, nothing parsed: still unsynced, still no server.
const chronyEmpty = R.chronyTrackingFacts("")
assert.equal(chronyEmpty.synced, false)
assert.equal(chronyEmpty.server, "")

// PPS refclock selected: chrony names it in the tracking reference.
const ppsReference = R.chronyTrackingFacts([
  "Reference ID    : 50505300 (PPS)",
  "Leap status     : Normal"
].join("\n"))
assert.equal(ppsReference.synced, true)
assert.equal(ppsReference.server, "PPS")

const CHRONY_SOURCES = [
  "MS Name/IP address         Stratum Poll Reach LastRx Last sample               ",
  "===============================================================================",
  "^* 0.arch.pool.ntp.org            2   6   377    35    -14us[  -14us] +/-   21ms",
  "#* PPS0                          0   4   377    13   +123ns[ +123ns] +/-  100ns"
].join("\n")

const sources = R.chronySourcesFacts(CHRONY_SOURCES)
assert.equal(sources.pps, true)
assert.equal(sources.selected, true)

// No PPS refclock configured at all.
const ntpOnly = R.chronySourcesFacts([
  "MS Name/IP address         Stratum Poll Reach LastRx Last sample               ",
  "===============================================================================",
  "^* 0.arch.pool.ntp.org            2   6   377    35    -14us[  -14us] +/-   21ms"
].join("\n"))
assert.equal(ntpOnly.pps, false)
assert.equal(ntpOnly.selected, false)

// A PPS refclock that is not answering has no pulses to give: no PPS.
const ppsUnreachable = R.chronySourcesFacts([
  "MS Name/IP address         Stratum Poll Reach LastRx Last sample               ",
  "===============================================================================",
  "#? PPS0                          0   4     0     -     +0ns[   +0ns] +/-    0ns"
].join("\n"))
assert.equal(ppsUnreachable.pps, false)

// Reachable but not the selected reference: GPS is ready, NTP leads.
const ppsNotSelected = R.chronySourcesFacts([
  "MS Name/IP address         Stratum Poll Reach LastRx Last sample               ",
  "===============================================================================",
  "^* 0.arch.pool.ntp.org            2   6   377    35    -14us[  -14us] +/-   21ms",
  "#+ PPS0                          0   4   377    13   +123ns[ +123ns] +/-  100ns"
].join("\n"))
assert.equal(ppsNotSelected.pps, true)
assert.equal(ppsNotSelected.selected, false)

// A receiver steering the clock over NMEA or SHM is the selected source even
// though there is no PPS refclock: the readout must say GPS, not NTP.
const nmeaSource = R.chronySourcesFacts([
  "MS Name/IP address         Stratum Poll Reach LastRx Last sample               ",
  "===============================================================================",
  "#* GPSD                          0   4   377    13   +123us[ +123us] +/-   10ms"
].join("\n"))
assert.equal(nmeaSource.selected, true)
assert.equal(nmeaSource.pps, false)

const shmSource = R.chronySourcesFacts([
  "MS Name/IP address         Stratum Poll Reach LastRx Last sample               ",
  "===============================================================================",
  "#* SHM0                          0   4   377    13   +123us[ +123us] +/-   10ms"
].join("\n"))
assert.equal(shmSource.selected, true)

// An NTP source is never reported as a local clock.
assert.equal(ntpOnly.selected, false)

const TIMESYNC_STATUS = [
  "       Server: 23.186.168.132 (0.arch.pool.ntp.org)",
  "Poll interval: 34min 8s (min: 32s; max 34min 8s)",
  "         Leap: normal",
  "      Version: 4",
  "      Stratum: 2",
  "    Reference: 84A36006",
  "    Precision: 1us (-25)",
  "Root distance: 21.315ms (max: 5s)",
  "       Offset: -7.342ms",
  "        Delay: 99.153ms",
  "       Jitter: 30.503ms",
  " Packet count: 43",
  "    Frequency: +0.699ppm"
].join("\n")

assert.equal(R.timesyncStatusFacts(TIMESYNC_STATUS).server, "0.arch.pool.ntp.org")

// timesyncd with no server yet reports n/a, which is not a name.
assert.equal(R.timesyncStatusFacts("       Server: n/a\n Packet count: 0").server, "")
assert.equal(R.timesyncStatusFacts("").server, "")

const GPS_REPORT = [
  '{"class":"VERSION","release":"3.25","rev":"3.25","proto_major":3,"proto_minor":15}',
  '{"class":"DEVICES","devices":[{"class":"DEVICE","path":"/dev/ttyUSB0","driver":"NMEA0183"}]}',
  '{"class":"TPV","device":"/dev/ttyUSB0","mode":3,"time":"2026-10-26T12:00:01.000Z"}',
  '{"class":"SKY","device":"/dev/ttyUSB0","nSat":12,"uSat":9,"satellites":[]}'
].join("\n")

const gps = R.gpsReportFacts(GPS_REPORT)
assert.equal(gps.gpsd, true)
assert.equal(gps.devices, 1)
assert.equal(gps.mode, 3)
assert.equal(gps.satellites, 9)

// gpsd up with no receiver attached.
const gpsNoDevice = R.gpsReportFacts([
  '{"class":"VERSION","release":"3.25"}',
  '{"class":"DEVICES","devices":[]}'
].join("\n"))
assert.equal(gpsNoDevice.gpsd, true)
assert.equal(gpsNoDevice.devices, 0)
assert.equal(gpsNoDevice.mode, 0)

// An older SKY shape without uSat: count the used satellites instead.
assert.equal(R.gpsReportFacts(
  '{"class":"SKY","satellites":[{"PRN":1,"used":true},{"PRN":2,"used":false},{"PRN":3,"used":true}]}'
).satellites, 2)

// No connection to gpsd: gpspipe prints its complaint on stderr and no JSON.
assert.equal(R.gpsReportFacts("").gpsd, false)
assert.equal(R.gpsReportFacts("gpspipe: could not connect to gpsd, socket: Connection refused").gpsd, false)

// A truncated read still counts what it saw, and a later TPV wins.
const partialGps = R.gpsReportFacts([
  '{"class":"VERSION","release":"3.25"}',
  '{"class":"DEVICES","devices":[{"class":"DEVICE","path":"/dev/ttyUSB0"}]}',
  '{"class":"TPV","mode":0}',
  '{"class":"TPV","mode":2}'
].join("\n"))
assert.equal(partialGps.devices, 1)
assert.equal(partialGps.mode, 2)

// The device check prints the configured paths that are missing; a setup with
// every receiver present prints nothing.
assert.equal(R.gpsConfigFacts("").missing, false)
assert.equal(R.gpsConfigFacts("/dev/ttyUSB0\n").missing, true)

// ---- CAT control: link health, not telemetry (ADR 0003) ----------------
//
// `catCheck` is the seam: the probe resolves whether rigctld is up, what
// device it opened and what the rig answered. The ladder owns the failure
// order and the wording. Frequency and mode are read; SWR, ALC, forward power
// and PTT tests never reach it.

function catInput(overrides) {
  const base = R.catFacts()
  const given = overrides || {}
  const merged = Object.assign({}, base, { rigctld: true }, given)
  merged.device = Object.assign({}, base.device,
    { known: true, path: "/dev/ttyUSB0", present: true, access: true, held: true, busy: false },
    given.device || {})
  merged.reply = Object.assign({}, base.reply,
    { freq: 14074000, mode: "USB", ptt: 0, error: "" }, given.reply || {})
  return merged
}

// No rigctld: the link cannot exist, and the endpoint says where we looked.
const noRigctld = R.catCheck(catInput({ rigctld: false }))
assert.equal(noRigctld.state, R.FAIL)
assert.equal(noRigctld.readout, "—")
assert.equal(noRigctld.detail, "rigctld not running")
assert.equal(noRigctld.meta, "127.0.0.1:4532")

// A rig that answers is ready, whatever the device facts look like: rigctld
// may run as another user, so its own open handle outranks our permissions.
const catReady = R.catCheck(catInput({ device: { present: false } }))
assert.equal(catReady.state, R.OK)
assert.equal(catReady.readout, "14.074")
assert.equal(catReady.detail, "MHz · USB")
assert.equal(catReady.meta, "rigctld · PTT receive")

// PTT is read-only status, never a test and never a signal on its own.
assert.equal(R.catCheck(catInput({ reply: { ptt: 1 } })).meta, "rigctld · PTT transmit")
assert.equal(R.catCheck(catInput({ reply: { ptt: 3 } })).meta, "rigctld · PTT transmit")
assert.equal(R.catCheck(catInput({ reply: { ptt: -1 } })).meta, "rigctld")
assert.equal(R.catCheck(catInput({ reply: { ptt: 1 } })).state, R.OK)

// Mode is optional: a frequency-only answer still proves the link.
const modeMissing = R.catCheck(catInput({ reply: { mode: "" } }))
assert.equal(modeMissing.state, R.OK)
assert.equal(modeMissing.detail, "MHz")

// The rigctl client is missing, so the link cannot be asked at all. That is
// unknown, not a fault: nothing is known to be broken.
const noClient = R.catCheck(catInput({ queryable: false, reply: { freq: 0 } }))
assert.equal(noClient.state, R.UNKNOWN)
assert.match(noClient.detail, /rigctl is not installed/)

// A failed link is explained by the device, most specific rung first.
const deviceMissing = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { present: false }
}))
assert.equal(deviceMissing.state, R.FAIL)
assert.equal(deviceMissing.detail, "serial device /dev/ttyUSB0 not present")

const deviceDenied = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { present: true, access: false, held: false }
}))
assert.equal(deviceDenied.state, R.FAIL)
assert.equal(deviceDenied.detail, "permission denied on /dev/ttyUSB0")
assert.match(deviceDenied.meta, /dialout/)

const deviceBusy = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { present: true, access: true, held: false, busy: true }
}))
assert.equal(deviceBusy.state, R.FAIL)
assert.equal(deviceBusy.detail, "serial port /dev/ttyUSB0 is in use")
assert.match(deviceBusy.meta, /another program/)

// rigctld holds the device itself, so a failed reply is the rig's silence,
// not a port problem.
const noReply = R.catCheck(catInput({
  reply: { freq: 0, mode: "", ptt: -1, error: "Communication timed out" },
  device: { present: true, access: false, held: true, busy: true }
}))
assert.equal(noReply.state, R.FAIL)
assert.equal(noReply.detail, "rig is not responding")
assert.equal(noReply.meta, "Communication timed out")

// A rig that is reached but reports no frequency has not answered the
// question the check asks.
const noFrequency = R.catCheck(catInput({ reply: { freq: 0, mode: "USB" } }))
assert.equal(noFrequency.state, R.FAIL)
assert.equal(noFrequency.detail, "rig is not responding")

// rigctld started without -r (a network or config-file rig): no device rung
// can be claimed, so the silence is all we have.
const noDeviceKnown = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { known: false }
}))
assert.equal(noDeviceKnown.state, R.FAIL)
assert.equal(noDeviceKnown.detail, "rig is not responding")

// ---- CAT control: reading rigctld and rigctl ---------------------------
//
// The host script reports what an existing rigctld's device looks like; rigctl
// answers a command or an error. Both are parsed here so the ladder stays pure.

const deviceReport = [
  "present=1",
  "access=1",
  "holds=0",
  "others= 5353"
].join("\n")

const device = R.catDeviceFacts(deviceReport, "/dev/ttyUSB0")
assert.equal(device.known, true)
assert.equal(device.path, "/dev/ttyUSB0")
assert.equal(device.present, true)
assert.equal(device.access, true)
assert.equal(device.held, false)
assert.equal(device.busy, true)

// rigctld without -r cannot be tied to a device file.
assert.equal(R.catDeviceFacts("", "").known, false)
assert.equal(R.catDeviceFacts("", "").path, "")

// A device that is not there ends the device report early.
const deviceMissingReport = R.catDeviceFacts("present=0", "/dev/ttyUSB1")
assert.equal(deviceMissingReport.known, true)
assert.equal(deviceMissingReport.present, false)
assert.equal(deviceMissingReport.held, false)
assert.equal(deviceMissingReport.busy, false)

// The command line rigctld was started with: device and port come from -r/-t.
const launched = R.rigctldFacts("4242 rigctld -m 3073 -r /dev/ttyUSB0 -t 4533")
assert.equal(launched.pid, 4242)
assert.equal(launched.device, "/dev/ttyUSB0")
assert.equal(launched.port, 4533)

// Long options and the defaults are understood too.
const launchedLong = R.rigctldFacts("/usr/bin/rigctld --rig-file=/dev/ttyACM0 --port=4534")
assert.equal(launchedLong.device, "/dev/ttyACM0")
assert.equal(launchedLong.port, 4534)

const launchedBare = R.rigctldFacts("77 rigctld")
assert.equal(launchedBare.pid, 77)
assert.equal(launchedBare.device, "")
assert.equal(launchedBare.port, 4532)

// Attached short-option values are still the daemon's device and port.
const launchedAttached = R.rigctldFacts("88 rigctld -r/dev/ttyUSB2 -t4535")
assert.equal(launchedAttached.device, "/dev/ttyUSB2")
assert.equal(launchedAttached.port, 4535)

// -r also takes a network rig, which has no serial device to inspect.
const launchedNetwork = R.rigctldFacts("99 rigctld -r 192.168.1.20:4532 -t 4536")
assert.equal(launchedNetwork.device, "")
assert.equal(launchedNetwork.port, 4536)

// Two daemons: the first is the one reported, and the line is not merged.
const twoDaemons = R.rigctldFacts("11 rigctld -r /dev/ttyUSB0\n22 rigctld -r /dev/ttyUSB1")
assert.equal(twoDaemons.pid, 11)
assert.equal(twoDaemons.device, "/dev/ttyUSB0")

assert.equal(R.rigctldFacts("").pid, 0)
assert.equal(R.rigctldFacts("").port, 4532)

// rigctl prints the value alone on success and "RPRT x" on a Hamlib error.
assert.equal(R.rigFrequency("14074000\n"), 14074000)
assert.equal(R.rigFrequency("RPRT -11\n"), 0)
assert.equal(R.rigFrequency(""), 0)

assert.equal(R.rigMode("USB\n3000\n"), "USB")
assert.equal(R.rigMode("RPRT -4\n"), "")
assert.equal(R.rigMode(""), "")

assert.equal(R.rigPtt("0\n"), 0)
assert.equal(R.rigPtt("1\n"), 1)
assert.equal(R.rigPtt("RPRT -4\n"), -1)
assert.equal(R.rigPtt(""), -1)

// The diagnostic line is shortened to the part worth showing.
assert.equal(R.rigError("rigctl: error = Communication timed out\n"), "Communication timed out")
assert.equal(R.rigError("RPRT -11\n"), "RPRT -11")
assert.equal(R.rigError("14074000\n"), "")
assert.equal(R.rigError(""), "")

// A frequency reads in MHz, and nothing is invented for an absent reading.
assert.equal(R.formatFrequency(14074000), "14.074")
assert.equal(R.formatFrequency(145500000), "145.500")
assert.equal(R.formatFrequency(0), "—")
assert.equal(R.formatFrequency("nonsense"), "—")

// The neutral fact set a probe starts from is "nothing answered yet", and the
// shape the ladders read.
assert.equal(R.timeCheck(R.timeFacts()).state, R.FAIL)
assert.equal(R.timeCheck(R.timeFacts()).detail, "no time source")
assert.equal(R.timeFacts().gps.pps, false)
assert.equal(R.catCheck(R.catFacts()).state, R.FAIL)
assert.equal(R.catCheck(R.catFacts()).detail, "rigctld not running")
assert.equal(R.catFacts().reply.freq, 0)

// The new checks aggregate with the audio one through the same helpers the bar
// and panel use: one warning, no failure, is amber.
const station = {
  time: R.timeCheck(timeInput({ gpsMode: "optional", gps: { gpsd: true, devices: 1, mode: 0 } })),
  cat: R.check(R.OK, "14.074", "MHz · USB", "rigctld · PTT receive"),
  audio: R.check(R.OK, "USB codec", "Radio RX and TX ready", "TX: USB codec")
}
assert.equal(R.overall(station), R.WARN)
assert.equal(R.verdict(R.WARN), "Needs attention")
assert.match(R.verdictDetail(R.WARN, R.counts(station)), /1 of 3 checks needs attention/)
assert.equal(R.rows(station)[0].detail, "GPS · no fix")
assert.equal(R.rows(station)[0].meta, "GPS lost")
assert.match(R.tooltip(station), /Time sync: Check — GPS · no fix/)

console.log("readiness tests passed")
