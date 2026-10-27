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

console.log("readiness tests passed")
