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

// Not probed: honest grey, not a fake green. The snapshot keeps all four
// checks even when a station declares only one path.
const empty = R.emptySnapshot()
assert.equal(R.NA, "na")
assert.deepEqual(Object.keys(empty).sort(), ["audio", "cat", "time", "tnc"])
assert.equal(R.overall(empty), R.UNKNOWN)
assert.equal(R.verdict(R.UNKNOWN), "Not probed yet")
assert.equal(R.rows(empty)[0].readout, "—")
assert.equal(R.counts(empty).unknown, 4)
assert.equal(R.applicable(R.NA), false)
assert.equal(R.applicable(R.UNKNOWN), true)
assert.equal(R.applicable(R.OK), true)
assert.equal(R.notApplicable().state, R.NA)
assert.equal(R.notApplicable().detail, "Not applicable")
assert.equal(R.label(R.NA), "Not applicable")

const allReady = {
  time: R.check(R.OK, "NTP", "GPS mode off", "disciplined"),
  cat: R.check(R.OK, "14.074", "MHz USB · FT-891", "rigctld · PTT receive"),
  audio: R.check(R.OK, "USB codec", "RX/TX ready", "TX: USB codec"),
  tnc: R.notApplicable()
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
assert.equal(R.verdictDetail(R.OK, R.counts(allReady), allReady, "Host audio"), "Ready for host audio")

const oneWarning = {
  time: R.check(R.OK, "NTP", "GPS mode off", "disciplined"),
  cat: R.check(R.WARN, "—", "rig not responding", ""),
  audio: R.check(R.OK, "USB codec", "RX/TX ready", "TX: USB codec"),
  tnc: R.notApplicable()
}
assert.equal(R.overall(oneWarning), R.WARN)
assert.equal(R.verdict(R.WARN), "Needs attention")
assert.equal(
  R.verdictDetail(R.WARN, R.counts(oneWarning), oneWarning, "Host audio"),
  "Host audio: 1 of 3 checks needs attention"
)

const oneFailure = {
  time: R.check(R.WARN, "NTP", "GPS · no fix", "GPS lost"),
  cat: R.check(R.FAIL, "—", "rigctld down", ""),
  audio: R.check(R.OK, "USB codec", "RX/TX ready", "TX: USB codec"),
  tnc: R.notApplicable()
}
assert.equal(R.overall(oneFailure), R.FAIL)
assert.equal(R.verdict(R.FAIL), "Not ready")
assert.equal(
  R.verdictDetail(R.FAIL, R.counts(oneFailure), oneFailure, "Host audio"),
  "Host audio not ready · 1 check failed · 1 needs attention"
)
assert.match(R.tooltip(oneFailure), /Station: Not ready/)
assert.match(R.tooltip(oneFailure), /CAT control: Fault/)

const partial = {
  time: R.check(R.OK, "NTP", "GPS mode off", "disciplined"),
  cat: R.check(R.UNKNOWN, "—", "Not probed yet", ""),
  audio: R.check(R.OK, "USB codec", "RX/TX ready", "TX: USB codec"),
  tnc: R.notApplicable()
}
assert.equal(R.overall(partial), R.UNKNOWN)
assert.equal(R.counts(partial).unknown, 1)

// ---- Station paths: applicability and verdicts (ADR 0004) --------------
//
// The declaration is a setting, never inferred from hardware. A check no
// declared path needs is `na` in the snapshot, skipped by aggregation, and
// absent from the panel's rows. Worst-of-declared, never best-of-paths.

function stationWith(overrides) {
  const base = {
    time: R.check(R.OK, "NTP", "GPS mode off", "disciplined"),
    cat: R.check(R.OK, "14.074", "MHz · USB", "rigctld · PTT receive"),
    audio: R.check(R.OK, "USB codec", "RX/TX ready", "TX: USB codec"),
    tnc: R.notApplicable()
  }
  for (const key in overrides || {}) base[key] = overrides[key]
  return base
}

assert.equal(R.stationPathsOf("Host audio"), "host")
assert.equal(R.stationPathsOf("TNC"), "tnc")
assert.equal(R.stationPathsOf("Both"), "both")
assert.equal(R.stationPathsOf("host audio"), "host")
assert.equal(R.stationPathsOf(undefined), "host")
assert.equal(R.declares("Both", "host"), true)
assert.equal(R.declares("Both", "tnc"), true)
assert.equal(R.declares("Host audio", "tnc"), false)
assert.equal(R.declares("TNC", "host"), false)
assert.equal(R.stationPathSettingKey(), "stationPaths")
assert.equal(R.stationPathLabel("Host audio"), "Host audio")
assert.equal(R.stationPathLabel("tnc"), "TNC")
assert.equal(R.stationPathLabel("Both"), "Both")
assert.equal(R.stationPathLabel("nonsense"), "Host audio")

// The panel's declaration picker: one row per manifest value, in order, each
// carrying the consequence that value has for readiness. The current value is
// marked and the cursor opens on it.
const pathRows = R.stationPathRows("TNC")
assert.equal(pathRows.map(function(row) { return row.value }).join("|"), "Host audio|TNC|Both")
assert.equal(pathRows[0].assigned, false)
assert.equal(pathRows[1].assigned, true)
assert.equal(pathRows[2].assigned, false)
assert.equal(pathRows[1].kind, "paths")
for (const row of pathRows) assert.notEqual(row.description, "")
assert.equal(R.stationPathCursor("TNC"), 1)
assert.equal(R.stationPathCursor("Both"), 2)
assert.equal(R.stationPathCursor("nonsense"), 0)

// Host-only: the TNC check is na, so it is counted and drawn nowhere.
const hostOnly = stationWith()
assert.equal(R.overall(hostOnly), R.OK)
assert.equal(R.pathState(hostOnly, "host"), R.OK)
assert.equal(R.counts(hostOnly).ready, 3)
assert.equal(R.rows(hostOnly).length, 3)
assert.equal(R.rows(hostOnly).map(function(row) { return row.key }).join("|"), "time|cat|audio")

// TNC-only: two applicable checks, time first.
const tncOnly = stationWith({
  cat: R.notApplicable(),
  audio: R.notApplicable(),
  tnc: R.check(R.OK, "/dev/ttyACM0", "port free", "USB CDC")
})
assert.equal(R.overall(tncOnly), R.OK)
assert.equal(R.pathState(tncOnly, "tnc"), R.OK)
assert.equal(R.counts(tncOnly).ready, 2)
assert.equal(R.rows(tncOnly).map(function(row) { return row.key }).join("|"), "time|tnc")

// Both: all four applicable, worst-of-declared.
const bothReady = stationWith({
  tnc: R.check(R.OK, "/dev/ttyACM0", "port free", "USB CDC")
})
assert.equal(R.overall(bothReady), R.OK)
assert.equal(R.counts(bothReady).ready, 4)
assert.equal(R.rows(bothReady).length, 4)
assert.equal(
  R.verdictDetail(R.OK, R.counts(bothReady), bothReady, "Both"),
  "Ready for host audio and TNC"
)

// A station declaring both is not green when only one path works: declaring a
// path is a promise, and losing it is news even while the other still works.
const bothDegraded = stationWith({
  tnc: R.check(R.WARN, "/dev/ttyS0", "onboard port", "onboard serial")
})
assert.equal(R.overall(bothDegraded), R.WARN)
assert.equal(
  R.verdictDetail(R.WARN, R.counts(bothDegraded), bothDegraded, "Both"),
  "Host audio ready · TNC needs attention"
)

const tncFault = stationWith({
  tnc: R.check(R.FAIL, "/dev/ttyACM0", "device missing", "USB CDC")
})
assert.equal(R.overall(tncFault), R.FAIL)
assert.equal(
  R.verdictDetail(R.FAIL, R.counts(tncFault), tncFault, "Both"),
  "Host audio ready · TNC not ready"
)

// A TNC-only station is green on two checks and says so.
assert.equal(
  R.verdictDetail(R.OK, R.counts(tncOnly), tncOnly, "TNC"),
  "Ready for TNC"
)
assert.equal(
  R.verdictDetail(R.WARN, R.counts(stationWith({
    cat: R.notApplicable(),
    audio: R.notApplicable(),
    tnc: R.check(R.WARN, "/dev/ttyS0", "onboard port", "onboard serial")
  })), stationWith({
    cat: R.notApplicable(),
    audio: R.notApplicable(),
    tnc: R.check(R.WARN, "/dev/ttyS0", "onboard port", "onboard serial")
  }), "TNC"),
  "TNC: 1 of 2 checks needs attention"
)

// A snapshot with every check na is not a green station, and it draws no rows.
const nothingApplicable = {
  time: R.notApplicable(),
  cat: R.notApplicable(),
  audio: R.notApplicable(),
  tnc: R.notApplicable()
}
assert.equal(R.overall(nothingApplicable), R.UNKNOWN)
assert.equal(R.rows(nothingApplicable).length, 0)
const nothingCounts = R.counts(nothingApplicable)
assert.equal(nothingCounts.ready, 0)
assert.equal(nothingCounts.attention, 0)
assert.equal(nothingCounts.blocked, 0)
assert.equal(nothingCounts.unknown, 0)

// No applicable row is ever handed to the panel.
for (const snapshot of [hostOnly, tncOnly, bothReady, bothDegraded, nothingApplicable])
  for (const row of R.rows(snapshot)) assert.notEqual(row.state, R.NA)

// The tooltip gains one line per declared path.
assert.match(R.tooltip(tncOnly, "TNC"), /TNC: ready/)
assert.doesNotMatch(R.tooltip(tncOnly, "TNC"), /Host audio:/)
assert.match(R.tooltip(bothDegraded, "Both"), /Host audio: ready/)
assert.match(R.tooltip(bothDegraded, "Both"), /TNC: needs attention/)

// Evidence of an undeclared path is one line of verdict text, never a state.
const undeclaredHint = "KISS modem on `/dev/ttyACM0` — declare a TNC path"
assert.equal(
  R.verdictDetail(R.OK, R.counts(hostOnly), hostOnly, "Host audio", undeclaredHint),
  "Ready for host audio · " + undeclaredHint
)
assert.match(
  R.tooltip(hostOnly, "Host audio", undeclaredHint),
  new RegExp("KISS modem on `/dev/ttyACM0` — declare a TNC path")
)
assert.equal(
  R.verdictDetail(R.OK, R.counts(tncOnly), tncOnly, "TNC", undeclaredHint),
  "Ready for TNC"
)

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
assert.equal(noRx.detail, "RX unassigned")

const noTx = R.audioCheck(audioInput({ rx: RX }))
assert.equal(noTx.state, R.UNKNOWN)
assert.equal(noTx.readout, "USB codec")
assert.equal(noTx.detail, "TX unassigned")

const unassigned = R.audioCheck(audioInput())
assert.equal(unassigned.state, R.UNKNOWN)
assert.equal(unassigned.detail, "RX/TX unassigned")

// A radio-class codec exists for both roles but nothing binds without the
// operator: the detail invites the assignment and the state stays unknown.
const invite = R.audioCheck(audioInput({
  rx: { radioCandidate: true },
  tx: { radioCandidate: true }
}))
assert.equal(invite.state, R.UNKNOWN)
assert.equal(invite.detail, "codec detected")

// Rung 3: a stale assignment. The operator chose a node that is gone; the
// readout still names it, so the failure says which one disappeared. Nothing
// rebinds it silently.
const staleRx = R.audioCheck(audioInput({ rx: Object.assign({}, RX, { present: false }), tx: TX }))
assert.equal(staleRx.state, R.FAIL)
assert.equal(staleRx.readout, RX.assigned)
assert.equal(staleRx.detail, "RX not present")

// Rung 4: Radio TX vanished while Radio RX is fine.
const staleTx = R.audioCheck(audioInput({ rx: RX, tx: Object.assign({}, TX, { present: false }) }))
assert.equal(staleTx.state, R.FAIL)
assert.equal(staleTx.readout, "USB codec")
assert.equal(staleTx.detail, "TX not present")

// Rung 5: RX muted is a warning — one toggle from ready, not a fault.
const mutedRx = R.audioCheck(audioInput({ rx: Object.assign({}, RX, { muted: true }), tx: TX }))
assert.equal(mutedRx.state, R.WARN)
assert.equal(mutedRx.detail, "RX muted")

// Rung 6: TX muted.
const mutedTx = R.audioCheck(audioInput({ rx: RX, tx: Object.assign({}, TX, { muted: true }) }))
assert.equal(mutedTx.state, R.WARN)
assert.equal(mutedTx.detail, "TX muted")

// Rung 7: Radio TX is the system default output.
const onAir = R.audioCheck(audioInput({ rx: RX, tx: Object.assign({}, TX, { isDefault: true }) }))
assert.equal(onAir.state, R.WARN)
assert.equal(onAir.detail, "TX default output")

// Rung 8: both nodes present, unmuted, and Radio TX is not the default.
const ready = R.audioCheck(audioInput({ rx: RX, tx: TX }))
assert.equal(ready.state, R.OK)
assert.equal(ready.readout, "USB codec")
assert.equal(ready.detail, "RX/TX ready")
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
assert.equal(several.detail, "RX not present")
assert.equal(
  several.meta,
  "also: TX muted · TX default output"
)

// Unassigned outranks mute: an unconfigured check stays unknown, and the
// broken rung below it is still carried.
const unassignedWithMute = R.audioCheck(audioInput({
  tx: Object.assign({}, TX, { muted: true })
}))
assert.equal(unassignedWithMute.state, R.UNKNOWN)
assert.equal(unassignedWithMute.detail, "RX unassigned")
assert.equal(unassignedWithMute.meta, "also: TX muted")

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

// The picker renders one row per manifest option, in the manifest's order,
// with the consequence that value has for the time check. The stored value
// keeps the manifest's casing; the ladder normalises it only for comparison.
assert.equal(R.gpsModeSettingKey(), "gpsMode")

const gpsOptions = R.gpsModeRows("Off")
assert.equal(gpsOptions.map(function(o) { return o.value }).join("|"), "Off|Optional|Required")
assert.equal(gpsOptions[0].description, "NTP is enough")
assert.equal(gpsOptions[1].description, "warn when GPS is lost")
assert.equal(gpsOptions[2].description, "warn when GPS is lost, has no PPS, or is not selected")

// The current value is marked, and the cursor starts on that row.
const optionalRows = R.gpsModeRows("Optional")
assert.equal(optionalRows.length, 3)
assert.equal(optionalRows[0].assigned, false)
assert.equal(optionalRows[1].assigned, true)
assert.equal(optionalRows[1].label, "Optional")
assert.equal(optionalRows[1].description, "warn when GPS is lost")
assert.equal(R.gpsModeCursor("Optional"), 1)
assert.equal(R.gpsModeCursor("OFF"), 0)

// Whatever casing shell.json holds, the manifest's row is the one marked.
assert.equal(R.gpsModeRows("required")[2].assigned, true)
assert.equal(R.gpsModeCursor("required"), 2)
assert.equal(R.gpsModeRows("nonsense")[0].assigned, true)
assert.equal(R.gpsModeCursor("nonsense"), 0)

// No daemon at all: the clock is free-running, and that is a fault.
const noDaemon = R.timeCheck(timeInput({ daemon: "none", synced: false }))
assert.equal(noDaemon.state, R.FAIL)
assert.equal(noDaemon.readout, "None")
assert.equal(noDaemon.detail, "no time source")
assert.equal(noDaemon.meta, "free-running")

// A daemon that is up but not steering the clock is a fault, not "unknown":
// the station has no trustworthy UTC right now.
const unsyncedNtp = R.timeCheck(timeInput({ synced: false }))
assert.equal(unsyncedNtp.state, R.FAIL)
assert.equal(unsyncedNtp.readout, "None")
assert.equal(unsyncedNtp.detail, "clock unsynced")
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
assert.equal(ntpReady.detail, "GPS mode off")
assert.equal(ntpReady.meta, "disciplined")

// GPS configured but lost: the check warns even though NTP still carries the
// clock, because the station's intended source is gone.
const gpsdDown = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: false }
}))
assert.equal(gpsdDown.state, R.WARN)
assert.equal(gpsdDown.readout, "NTP")
assert.equal(gpsdDown.detail, "gpsd down")
assert.equal(gpsdDown.meta, "GPS lost")

// A missing gpspipe is not the same as a stopped daemon: the package is not
// installed, and that is what the operator has to fix.
const gpsdMissing = R.timeCheck(timeInput({
  gpsMode: "optional",
  gps: { gpsd: false, installed: false }
}))
assert.equal(gpsdMissing.state, R.WARN)
assert.equal(gpsdMissing.detail, "gpsd missing")
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
assert.equal(noPps.meta, "disciplined")

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
assert.equal(readyNotSelected.detail, "GPS not selected")
assert.equal(readyNotSelected.meta, "disciplined")

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
assert.equal(disciplining.meta, "disciplined")

// A clock that is not disciplined outranks every GPS rung: no source health
// can be claimed while chrony is not steering the clock.
const unsyncedWithGps = R.timeCheck(timeInput({
  gpsMode: "required",
  synced: false,
  gps: { gpsd: true, devices: 1, mode: 3, pps: true, selected: true }
}))
assert.equal(unsyncedWithGps.state, R.FAIL)
assert.equal(unsyncedWithGps.detail, "clock unsynced")

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
assert.equal(noRigctld.detail, "rigctld down")
assert.equal(noRigctld.meta, "127.0.0.1:4532")

// A missing hamlib package is not a stopped daemon: rigctld cannot run because
// it was never installed, and the package is what the operator has to add.
const noHamlib = R.catCheck(catInput({ installed: false, rigctld: false }))
assert.equal(noHamlib.state, R.FAIL)
assert.equal(noHamlib.detail, "no hamlib")
assert.equal(noHamlib.meta, "install hamlib")

// Installed and stopped keeps the daemon rung.
const stoppedDaemon = R.catCheck(catInput({ installed: true, rigctld: false }))
assert.equal(stoppedDaemon.detail, "rigctld down")

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
assert.match(noClient.detail, /no rigctl/)

// A failed link is explained by the device, most specific rung first.
const deviceMissing = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { present: false }
}))
assert.equal(deviceMissing.state, R.FAIL)
assert.equal(deviceMissing.detail, "missing /dev/ttyUSB0")

const deviceDenied = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { present: true, access: false, held: false }
}))
assert.equal(deviceDenied.state, R.FAIL)
assert.equal(deviceDenied.detail, "permission denied")
assert.match(deviceDenied.meta, /dialout/)

const deviceBusy = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { present: true, access: true, held: false, busy: true }
}))
assert.equal(deviceBusy.state, R.FAIL)
assert.equal(deviceBusy.detail, "in use: /dev/ttyUSB0")
assert.match(deviceBusy.meta, /another program/)

// rigctld holds the device itself, so a failed reply is the rig's silence,
// not a port problem.
const noReply = R.catCheck(catInput({
  reply: { freq: 0, mode: "", ptt: -1, error: "Communication timed out" },
  device: { present: true, access: false, held: true, busy: true }
}))
assert.equal(noReply.state, R.FAIL)
assert.equal(noReply.detail, "no rig reply")
assert.equal(noReply.meta, "Communication timed out")

// A rig that is reached but reports no frequency has not answered the
// question the check asks.
const noFrequency = R.catCheck(catInput({ reply: { freq: 0, mode: "USB" } }))
assert.equal(noFrequency.state, R.FAIL)
assert.equal(noFrequency.detail, "no rig reply")

// rigctld started without -r (a network or config-file rig): no device rung
// can be claimed, so the silence is all we have.
const noDeviceKnown = R.catCheck(catInput({
  reply: { freq: 0 },
  device: { known: false }
}))
assert.equal(noDeviceKnown.state, R.FAIL)
assert.equal(noDeviceKnown.detail, "no rig reply")

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
assert.equal(R.catCheck(R.catFacts()).detail, "rigctld down")
assert.equal(R.catFacts().installed, true)
assert.equal(R.catFacts().reply.freq, 0)

// The new checks aggregate with the audio one through the same helpers the bar
// and panel use: one warning, no failure, is amber.
const station = {
  time: R.timeCheck(timeInput({ gpsMode: "optional", gps: { gpsd: true, devices: 1, mode: 0 } })),
  cat: R.check(R.OK, "14.074", "MHz · USB", "rigctld · PTT receive"),
  audio: R.check(R.OK, "USB codec", "RX/TX ready", "TX: USB codec"),
  tnc: R.notApplicable()
}
assert.equal(R.overall(station), R.WARN)
assert.equal(R.verdict(R.WARN), "Needs attention")
assert.match(R.verdictDetail(R.WARN, R.counts(station), station, "Host audio"), /1 of 3 checks needs attention/)
assert.equal(R.rows(station)[0].detail, "GPS · no fix")
assert.equal(R.rows(station)[0].meta, "GPS lost")
assert.match(R.tooltip(station), /Time sync: Check — GPS · no fix/)

// ---- TNC transport: the holdership ladder (ADR 0005) --------------------
//
// `tncCheck` is the seam: the probe resolves the transport's shape and the
// facts around it, and the ladder owns the rung order and wording. No rung
// opens a held port, writes to a modem, or claims that KISS was proven.

function tncInput(overrides) {
  const base = R.tncFacts()
  const given = overrides || {}
  const merged = Object.assign({}, base, given)
  merged.serial = Object.assign({}, base.serial, given.serial || {})
  merged.bluetooth = Object.assign({}, base.bluetooth, given.bluetooth || {})
  return merged
}

assert.equal(R.tncFacts().assigned, "")
assert.equal(R.tncFacts().serial.present, false)
assert.equal(R.tncFacts().serial.holderPid, 0)
assert.equal(R.tncFacts().bluetooth.connected, false)
assert.equal(R.tncFacts().bluetooth.missing, false)

// The setting is classified by shape, never by guesswork.
assert.equal(R.tncTransportKind("/dev/ttyACM0"), "serial")
assert.equal(R.tncTransportKind("/dev/ttyUSB1"), "serial")
assert.equal(R.tncTransportKind("AA:BB:CC:DD:EE:4F"), "bluetooth")
assert.equal(R.tncTransportKind("aa:bb:cc:dd:ee:4f"), "bluetooth")
assert.equal(R.tncTransportKind("ttyACM0"), "")
assert.equal(R.tncTransportKind(""), "")

// Rung 1: a declared TNC path with nothing assigned is unknown, not green.
const unassignedTnc = R.tncCheck(tncInput())
assert.equal(unassignedTnc.state, R.UNKNOWN)
assert.equal(unassignedTnc.readout, "—")
assert.equal(unassignedTnc.detail, "no transport")
assert.equal(unassignedTnc.meta, "choose one")

// Rung 2: an assigned serial path that is gone fails and names the path.
const missingTnc = R.tncCheck(tncInput({ assigned: "/dev/ttyACM0" }))
assert.equal(missingTnc.state, R.FAIL)
assert.equal(missingTnc.readout, "/dev/ttyACM0")
assert.equal(missingTnc.detail, "device missing")
assert.equal(missingTnc.meta, "USB CDC")

// Rung 3: something exists there, but it is not a character device.
const notTty = R.tncCheck(tncInput({
  assigned: "/dev/ttyACM0",
  serial: { present: true, charDevice: false }
}))
assert.equal(notTty.state, R.FAIL)
assert.equal(notTty.detail, "not a tty")

// Rung 4: permission denied names the group the operator has to join.
const deniedTnc = R.tncCheck(tncInput({
  assigned: "/dev/ttyACM0",
  serial: { present: true, charDevice: true, readable: false }
}))
assert.equal(deniedTnc.state, R.FAIL)
assert.equal(deniedTnc.detail, "permission denied")
assert.equal(deniedTnc.meta, "add to dialout")

// Rung 5: a port held by another process is ok — it is the state a working
// TNC station is in while it is being used — and the holder is named. A held
// port is never opened to confirm it.
const heldTnc = R.tncCheck(tncInput({
  assigned: "/dev/ttyACM0",
  serial: {
    present: true,
    charDevice: true,
    readable: true,
    opens: false,
    holderPid: 4711,
    holderName: "direwolf"
  }
}))
assert.equal(heldTnc.state, R.OK)
assert.equal(heldTnc.readout, "/dev/ttyACM0")
assert.equal(heldTnc.detail, "in use: direwolf")
assert.equal(heldTnc.meta, "pid 4711")

// Holdership outranks our own permission: a port the operator cannot read may
// still be held, and the working station is not failed for it. The holder is
// visible in /proc without opening the port.
const heldWithoutAccess = R.tncCheck(tncInput({
  assigned: "/dev/ttyACM0",
  serial: {
    present: true,
    charDevice: true,
    readable: false,
    holderPid: 4711,
    holderName: "direwolf"
  }
}))
assert.equal(heldWithoutAccess.state, R.OK)
assert.equal(heldWithoutAccess.detail, "in use: direwolf")

// A holder whose name cannot be read is still named by pid.
const anonymousHolder = R.tncCheck(tncInput({
  assigned: "/dev/ttyACM0",
  serial: { present: true, charDevice: true, readable: true, holderPid: 99, holderName: "" }
}))
assert.equal(anonymousHolder.state, R.OK)
assert.equal(anonymousHolder.detail, "in use: pid 99")

// Rung 6: a legacy onboard port exists and opens whether or not a modem is
// attached, so presence there proves nothing and the check warns.
const onboardTnc = R.tncCheck(tncInput({
  assigned: "/dev/ttyS0",
  serial: { present: true, charDevice: true, readable: true, opens: true, onboard: true }
}))
assert.equal(onboardTnc.state, R.WARN)
assert.equal(onboardTnc.readout, "/dev/ttyS0")
assert.equal(onboardTnc.detail, "onboard port")
assert.equal(onboardTnc.meta, "modem unknown")

// Rung 7: a free port that opens read-only and closes is ok. The meta names
// the transport kind, never a modem model.
const freeTnc = R.tncCheck(tncInput({
  assigned: "/dev/ttyACM0",
  serial: { present: true, charDevice: true, readable: true, opens: true }
}))
assert.equal(freeTnc.state, R.OK)
assert.equal(freeTnc.detail, "port free")
assert.equal(freeTnc.meta, "USB CDC")

// A readable free port that will not open is a fault, not a cautious green.
const unopenableTnc = R.tncCheck(tncInput({
  assigned: "/dev/ttyUSB0",
  serial: { present: true, charDevice: true, readable: true, opens: false }
}))
assert.equal(unopenableTnc.state, R.FAIL)
assert.equal(unopenableTnc.detail, "cannot open")
assert.equal(unopenableTnc.meta, "USB serial")

// Rung 8: Bluetooth is graded at paired and connected, never at GATT or SPP.
// An address absent from BlueZ's list is "not found", not a claim that it is
// unpaired.
const missingBluetooth = R.tncCheck(tncInput({
  assigned: "AA:BB:CC:DD:EE:4F",
  bluetooth: { missing: true, address: "AA:BB:CC:DD:EE:4F" }
}))
assert.equal(missingBluetooth.state, R.FAIL)
assert.equal(missingBluetooth.readout, "AA:BB:CC:DD:EE:4F")
assert.equal(missingBluetooth.detail, "BT not found")
assert.equal(missingBluetooth.meta, "AA:BB:CC:DD:EE:4F")

const unpairedTnc = R.tncCheck(tncInput({
  assigned: "AA:BB:CC:DD:EE:4F",
  bluetooth: {
    paired: false,
    connected: false,
    name: "Mobilinkd TNC4",
    address: "AA:BB:CC:DD:EE:4F"
  }
}))
assert.equal(unpairedTnc.state, R.FAIL)
assert.equal(unpairedTnc.readout, "Mobilinkd TNC4")
assert.equal(unpairedTnc.detail, "not paired")
assert.equal(unpairedTnc.meta, "AA:BB:CC:DD:EE:4F")

const unconnectedTnc = R.tncCheck(tncInput({
  assigned: "AA:BB:CC:DD:EE:4F",
  bluetooth: {
    paired: true,
    connected: false,
    name: "Mobilinkd TNC4",
    address: "AA:BB:CC:DD:EE:4F"
  }
}))
assert.equal(unconnectedTnc.state, R.FAIL)
assert.equal(unconnectedTnc.detail, "not connected")

const connectedTnc = R.tncCheck(tncInput({
  assigned: "AA:BB:CC:DD:EE:4F",
  bluetooth: {
    paired: true,
    connected: true,
    name: "Mobilinkd TNC4",
    address: "AA:BB:CC:DD:EE:4F"
  }
}))
assert.equal(connectedTnc.state, R.OK)
assert.equal(connectedTnc.readout, "Mobilinkd TNC4")
assert.equal(connectedTnc.detail, "connected")
assert.equal(connectedTnc.meta, "AA:BB:CC:DD:EE:4F")

const unnamedBluetooth = R.tncCheck(tncInput({
  assigned: "AA:BB:CC:DD:EE:4F",
  bluetooth: { paired: true, connected: true, address: "AA:BB:CC:DD:EE:4F" }
}))
assert.equal(unnamedBluetooth.readout, "AA:BB:CC:DD:EE:4F")

// An assignment that is neither shape is a configuration fault.
const gibberish = R.tncCheck(tncInput({ assigned: "ttyACM0" }))
assert.equal(gibberish.state, R.FAIL)
assert.equal(gibberish.readout, "ttyACM0")
assert.equal(gibberish.detail, "bad transport")

// The serial report parser turns the probe's key=value lines into the shape
// the ladder reads, and leaves neutral facts when it got nothing.
const serialReport = R.tncSerialFacts([
  "present=1",
  "char=1",
  "read=1",
  "opens=1",
  "onboard=0",
  "holder=4711",
  "holder_name=direwolf"
].join("\n"), "/dev/ttyACM0")
assert.equal(serialReport.present, true)
assert.equal(serialReport.charDevice, true)
assert.equal(serialReport.readable, true)
assert.equal(serialReport.opens, true)
assert.equal(serialReport.onboard, false)
assert.equal(serialReport.holderPid, 4711)
assert.equal(serialReport.holderName, "direwolf")

const emptySerialReport = R.tncSerialFacts("", "/dev/ttyACM0")
assert.equal(emptySerialReport.present, false)
assert.equal(emptySerialReport.charDevice, false)
assert.equal(emptySerialReport.holderPid, 0)

// ---- TNC transport: candidate ranking ----------------------------------
//
// The picker lists serial devices and paired Bluetooth devices. A name
// identifies a chip family or a product string, never a modem, so every row
// says it suggests rather than identifies. Recognised modem names lead, then
// paired Bluetooth devices, then everything else.

const TNC_CANDIDATES = R.tncCandidates([
  "serial|/dev/ttyUSB0|FTDI_FT232R_USB_UART",
  "serial|/dev/ttyACM0|Mobilinkd_TNC4",
  "serial|/dev/ttyS4|"
].join("\n"), [
  { address: "AA:BB:CC:DD:EE:02", name: "Mobilinkd TNC3", paired: true, connected: true },
  { address: "AA:BB:CC:DD:EE:01", name: "Headset", paired: true, connected: false },
  { address: "AA:BB:CC:DD:EE:03", name: "Phone", paired: false, connected: false }
])

assert.equal(
  TNC_CANDIDATES.map(function(candidate) { return candidate.label }).join("|"),
  "Mobilinkd TNC3|Mobilinkd TNC4|Headset|/dev/ttyS4|FTDI FT232R USB UART"
)
assert.equal(
  TNC_CANDIDATES.map(function(candidate) { return candidate.tier }).join("|"),
  [R.TNC_TIER_RECOGNISED, R.TNC_TIER_RECOGNISED, R.TNC_TIER_PAIRED,
    R.TNC_TIER_OTHER, R.TNC_TIER_OTHER].join("|")
)
for (const candidate of TNC_CANDIDATES)
  assert.match(candidate.reason, /suggests rather than identifies/)

const recognisedSerial = TNC_CANDIDATES[1]
assert.equal(recognisedSerial.kind, "serial")
assert.equal(recognisedSerial.value, "/dev/ttyACM0")
assert.equal(recognisedSerial.description, "/dev/ttyACM0")
assert.equal(recognisedSerial.reason, "recognised modem name — suggests rather than identifies")
assert.equal(TNC_CANDIDATES[2].reason, "paired Bluetooth device — suggests rather than identifies")
assert.equal(TNC_CANDIDATES[3].reason, "onboard serial — suggests rather than identifies")

// Unpaired Bluetooth devices are not transports the station can use yet.
assert.ok(TNC_CANDIDATES.every(function(candidate) {
  return candidate.value !== "AA:BB:CC:DD:EE:03"
}))

// Trusted is not paired: BlueZ lets an operator trust an unbonded device.
assert.equal(R.tncCandidates("", [
  { address: "AA:BB:CC:DD:EE:05", name: "Trusted", paired: false, bonded: false, trusted: true }
]).length, 0)

// An undeclared TNC path with a recognised modem on a serial port is one line
// of text, never a state. The serial candidate is preferred over a Bluetooth
// one because the hint names a path.
assert.equal(
  R.tncHint(TNC_CANDIDATES),
  "KISS modem on `/dev/ttyACM0` — declare a TNC path"
)
assert.equal(R.tncHint([]), "")
assert.equal(R.tncHint(R.tncCandidates("", [
  { address: "AA:BB:CC:DD:EE:04", name: "Mobilinkd TNC4", paired: true, connected: true }
])), "KISS modem on `AA:BB:CC:DD:EE:04` — declare a TNC path")

assert.equal(R.tncCandidates("", []).length, 0)
assert.equal(R.tncCandidates(undefined, undefined).length, 0)

// The picker's rows mark the assigned transport, offer a Clear row only when
// something is assigned, and open the cursor on the assignment.
const tncRows = R.tncTransportRows(TNC_CANDIDATES, "/dev/ttyACM0")
assert.equal(tncRows[0].kind, "header")
const assignedTncRow = tncRows.filter(function(row) { return row.kind === "tnc" && row.assigned })[0]
assert.equal(assignedTncRow.value, "/dev/ttyACM0")
const clearTncRow = tncRows.filter(function(row) { return row.kind === "clear" })[0]
assert.equal(clearTncRow.role, "tnc")
assert.equal(R.tncTransportCursor(TNC_CANDIDATES, "/dev/ttyACM0"), 1)
assert.equal(R.tncTransportCursor(TNC_CANDIDATES, "AA:BB:CC:DD:EE:01"), 2)
assert.equal(R.tncTransportCursor([], ""), 0)
assert.equal(
  R.tncTransportRows([], "").filter(function(row) { return row.kind === "clear" }).length,
  0
)

// ---- Settings reference: README agrees with the manifest ----------------
//
// manifest.json is the source of truth for every bar-widget setting. The
// README's Settings table is the discovery path for the keys the panel does
// not edit (refreshIntervalSec) and must not drift from the schema.

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"))
const schema = manifest.barWidget.schema

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8")
const settingsSection = /^## Settings[ \t]*\n([\s\S]*?)(?=^## )/m.exec(readme)
assert.ok(settingsSection, "README has a ## Settings section")

function readmeSettingsRows(section) {
  const rows = []
  for (const line of section.split("\n")) {
    if (line.charAt(0) !== "|") continue
    const cells = line.replace(/^\|/, "").replace(/\|\s*$/, "")
      .split("|").map(function(cell) { return cell.trim() })
    if (cells.length !== 5) continue
    const key = /^`([^`]+)`$/.exec(cells[0])
    if (!key) continue
    rows.push({
      key: key[1],
      type: cells[1],
      accepted: cells[2],
      // Backticks keep the table readable; the value is what is inside them.
      default: cells[3].replace(/^`|`$/g, ""),
      effect: cells[4]
    })
  }
  return rows
}

const settingsRows = readmeSettingsRows(settingsSection[1])
const documented = {}
for (const row of settingsRows) documented[row.key] = row

// Every schema key has a row, and no row documents a key the schema does not
// declare.
assert.deepEqual(
  Object.keys(documented).sort(),
  schema.map(function(entry) { return entry.key }).sort()
)

function displayedDefault(value) {
  return String(value) === "" ? "(empty)" : String(value)
}

for (const entry of schema) {
  const row = documented[entry.key]
  assert.equal(row.type, entry.type, entry.key + " type")
  assert.equal(row.default, displayedDefault(entry.defaultValue), entry.key + " default")
  assert.notEqual(row.effect, "", entry.key + " effect")
  if (entry.type === "enum")
    for (const option of entry.options)
      assert.ok(row.accepted.indexOf(option) !== -1, entry.key + " lists " + option)
  if (entry.type === "integer")
    for (const bound of [entry.min, entry.max])
      assert.ok(row.accepted.indexOf(String(bound)) !== -1, entry.key + " lists " + bound)
}

// The picker's rows and the manifest's enum come from the same order and key.
const gpsEntry = schema.filter(function(entry) { return entry.key === "gpsMode" })[0]
assert.equal(gpsEntry.type, "enum")
assert.equal(
  R.gpsModeRows("Off").map(function(option) { return option.value }).join("|"),
  gpsEntry.options.join("|")
)
assert.equal(R.gpsModeSettingKey(), gpsEntry.key)

// The station-path vocabulary and the transport key are pinned the same way.
const pathsEntry = schema.filter(function(entry) { return entry.key === "stationPaths" })[0]
assert.equal(pathsEntry.type, "enum")
assert.equal(pathsEntry.defaultValue, "Host audio")
assert.equal(
  R.STATION_PATH_OPTIONS.map(function(option) { return option.value }).join("|"),
  pathsEntry.options.join("|")
)
assert.equal(
  R.stationPathRows("Host audio").map(function(row) { return row.value }).join("|"),
  pathsEntry.options.join("|")
)
assert.equal(R.stationPathSettingKey(), pathsEntry.key)

const transportEntry = schema.filter(function(entry) { return entry.key === "tncTransport" })[0]
assert.equal(transportEntry.type, "string")
assert.equal(transportEntry.defaultValue, "")
assert.equal(R.tncSettingKey(), transportEntry.key)

// The policy matrix stays in the Time sync section; the settings table points
// at it instead of restating it.
assert.match(readme, /## Time sync[\s\S]*`gpsMode` says what the station expects/)
assert.match(readme, /## Time sync[\s\S]*\| `Off` \(default\) \| `GPS mode off` \| — \|/)

console.log("readiness tests passed")
