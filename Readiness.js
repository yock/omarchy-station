// Pure readiness model shared by the bar indicator and the expanded panel.
//
// Time and CAT probes are not wired yet; radio audio is answered by
// AudioProbe.qml. Each check is a small object with a state plus three display
// fields:
//
//   readout  the value the panel leads with: time source, frequency, or the
//            assigned radio node
//   detail   what that readout means
//   meta     a secondary fact, never used to compute state
//
// Replacing the whole snapshot is what makes the bar, tooltip and panel update
// atomically.

var UNKNOWN = "unknown"
var OK = "ok"
var WARN = "warn"
var FAIL = "fail"

var KEYS = ["time", "cat", "audio"]

var LABELS = {
  time: "Time sync",
  cat: "CAT control",
  audio: "Radio audio"
}

var STATES = {
  unknown: {
    label: "Unknown",
    short: "Unknown",
    color: "#8b9198"
  },
  ok: {
    label: "Ready",
    short: "Ready",
    color: "#73c37a"
  },
  warn: {
    label: "Needs attention",
    short: "Check",
    color: "#d9b45f"
  },
  fail: {
    label: "Not ready",
    short: "Fault",
    color: "#d36f6f"
  }
}

var VERDICTS = {
  ok: "Station ready",
  warn: "Needs attention",
  fail: "Not ready",
  unknown: "Not probed yet"
}

function check(state, readout, detail, meta) {
  return {
    state: state || UNKNOWN,
    readout: readout || "—",
    detail: detail || "Not probed yet",
    meta: meta || ""
  }
}

function emptySnapshot() {
  return {
    time: check(UNKNOWN, "—", "Not probed yet", ""),
    cat: check(UNKNOWN, "—", "Not probed yet", ""),
    audio: check(UNKNOWN, "—", "Not probed yet", "")
  }
}

function text(value) {
  return value === undefined || value === null ? "" : String(value)
}

// ---- Radio audio --------------------------------------------------------
//
// ADR 0002: only node presence, mute and Radio TX being the system default
// output drive state. The probe resolves facts; this function owns the
// first-match-wins ladder, the wording and the meta carry-over.
//
// `input` is:
//
//   pipewireReady  Pipewire.ready right now
//   everReady      the PipeWire service has been ready at least once
//   rx, tx         { assigned, present, muted, nickname, description,
//                    radioCandidate, isDefault }
//
// Readout is the assigned Radio RX node's nickname, then its description. A
// missing node is named by its assignment so the operator can see which one
// went away; a missing assignment reads "—".

var AUDIO_BOTH_UNASSIGNED = "Radio RX and TX not assigned"
var AUDIO_CODEC_DETECTED = "USB audio codec detected — assign it"

// Both ends of an assignment must agree on which setting each role writes.
var AUDIO_SETTING_KEYS = {
  rx: "radioRxNode",
  tx: "radioTxNode"
}

function audioSettingKey(role) {
  return AUDIO_SETTING_KEYS[role] || AUDIO_SETTING_KEYS.rx
}

function audioFacts(input, key) {
  var facts = input ? input[key] : null
  return facts || {}
}

function audioNodeLabel(facts) {
  return text(facts.nickname) || text(facts.description) || text(facts.assigned) || "—"
}

function audioCheck(input) {
  var facts = input || {}
  var rx = audioFacts(facts, "rx")
  var tx = audioFacts(facts, "tx")
  var rxName = text(rx.assigned)
  var txName = text(tx.assigned)
  // A present node leads with its nickname, then its description. A missing
  // one can only be named by the assignment, which is the point of keeping
  // the readout on failure.
  var readout = rxName === ""
    ? "—"
    : (rx.present === true ? (text(rx.nickname) || text(rx.description) || "—") : rxName)

  // The check cannot be answered at all before PipeWire has come up once.
  // Unknown is honest there; only a ready-to-not-ready transition is a fault.
  if (facts.pipewireReady !== true) {
    return facts.everReady === true
      ? check(FAIL, "—", "PipeWire is not running", "")
      : check(UNKNOWN, "—", "Waiting for PipeWire", "")
  }

  var problems = []

  if (rxName === "" && txName === "") {
    var detect = rx.radioCandidate === true && tx.radioCandidate === true
    problems.push({ state: UNKNOWN, detail: detect ? AUDIO_CODEC_DETECTED : AUDIO_BOTH_UNASSIGNED })
  } else if (rxName === "") {
    problems.push({ state: UNKNOWN, detail: "Radio RX not assigned" })
  } else if (txName === "") {
    problems.push({ state: UNKNOWN, detail: "Radio TX not assigned" })
  }

  // Absence fails: the configured path is gone. Mutes warn: one toggle from
  // ready. On-air output warns: the station still works a digital mode.
  if (rxName !== "" && rx.present !== true) {
    problems.push({ state: FAIL, detail: 'Radio RX "' + rxName + '" is not present' })
  }
  if (txName !== "" && tx.present !== true) {
    problems.push({ state: FAIL, detail: 'Radio TX "' + txName + '" is not present' })
  }
  if (rxName !== "" && rx.present === true && rx.muted === true) {
    problems.push({ state: WARN, detail: "Radio RX is muted — nothing will decode" })
  }
  if (txName !== "" && tx.present === true && tx.muted === true) {
    problems.push({ state: WARN, detail: "Radio TX is muted — nothing will transmit" })
  }
  if (txName !== "" && tx.present === true && tx.isDefault === true) {
    problems.push({ state: WARN, detail: "Radio TX is the default output — other sounds go on air" })
  }

  if (problems.length === 0) {
    var readyMeta = txName !== "" && txName !== rxName ? "TX: " + audioNodeLabel(tx) : ""
    return check(OK, readout, "Radio RX and TX ready", readyMeta)
  }

  // The highest broken rung sets the state; the rest ride along in meta.
  var first = problems[0]
  var meta = ""
  if (problems.length > 1) {
    var also = []
    for (var i = 1; i < problems.length; i++) also.push(problems[i].detail)
    meta = "also: " + also.join(" · ")
  } else if (txName !== "" && tx.present === true && txName !== rxName) {
    meta = "TX: " + audioNodeLabel(tx)
  }
  return check(first.state, readout, first.detail, meta)
}

// ---- Radio audio: candidate ranking -------------------------------------
//
// Node identity is the PipeWire node name, but a name identifies a chip family
// rather than a radio. Candidates are ranked by codec family — radio-class,
// then other USB audio, then onboard analog — and never by model. A Digirig,
// an IC-7300 and a SignaLink are the same string.

var TIER_RADIO = 0
var TIER_USB = 1
var TIER_ONBOARD = 2

// Observed node-name prefixes that mark a radio-class codec. Matching is
// case-insensitive and anchored nowhere in particular: ALSA exposes these
// inside `alsa_input.` / `alsa_output.` names.
var CMEDIA_REASON = "radio-class codec — C-Media CM108/CM119 family, also used by generic USB audio devices"

var RADIO_CODEC_PREFIXES = [
  {
    prefix: "usb-C-Media_Electronics_Inc._USB_PnP_Sound_Device",
    reason: CMEDIA_REASON
  },
  {
    prefix: "usb-C-Media_Electronics_Inc._USB_Audio_Device",
    reason: CMEDIA_REASON
  },
  {
    prefix: "usb-Burr-Brown_from_TI_USB_Audio_CODEC",
    reason: "radio-class codec — TI PCM290x family, also used by generic USB audio devices"
  },
  {
    prefix: "usb-West_Mountain_Radio_RIGblaster_Advantage_Audio",
    reason: "radio-class codec — West Mountain Radio family"
  }
]

var USB_AUDIO_REASON = "other USB audio — may be a headset, webcam or generic interface"
var ONBOARD_AUDIO_REASON = "onboard analog — the host's built-in audio"
var OTHER_AUDIO_REASON = "other system audio — not a USB codec"

function radioCodecReason(name) {
  var lowered = text(name).toLowerCase()
  for (var i = 0; i < RADIO_CODEC_PREFIXES.length; i++) {
    if (lowered.indexOf(RADIO_CODEC_PREFIXES[i].prefix.toLowerCase()) !== -1)
      return RADIO_CODEC_PREFIXES[i].reason
  }
  return ""
}

function audioCodecTier(node) {
  var radio = radioCodecReason(node.name)
  if (radio !== "") return { tier: TIER_RADIO, reason: radio }

  var blob = (text(node.name) + " " + text(node.description)).toLowerCase()
  if (blob.indexOf("usb") !== -1) return { tier: TIER_USB, reason: USB_AUDIO_REASON }

  // The third tier is "everything not USB", but only a PCI/platform node is
  // honestly the host's built-in audio. A Bluetooth or virtual node shares the
  // tier without claiming to be onboard hardware.
  if (blob.indexOf("pci-") !== -1 || blob.indexOf("platform-") !== -1
      || blob.indexOf("built-in") !== -1 || blob.indexOf("sof-") !== -1)
    return { tier: TIER_ONBOARD, reason: ONBOARD_AUDIO_REASON }
  return { tier: TIER_ONBOARD, reason: OTHER_AUDIO_REASON }
}

// Streams, sink monitors, HDMI/DisplayPort outputs and anything that is not
// audio are not radio audio, however they announce themselves.
function audioCandidateExcluded(node) {
  if (!node || node.isStream === true || !node.audio) return true
  var name = text(node.name).toLowerCase()
  var description = text(node.description).toLowerCase()
  if (name.indexOf(".monitor") !== -1) return true
  if (description.indexOf("monitor of") === 0) return true
  var blob = name + " " + description
  return blob.indexOf("hdmi") !== -1
    || blob.indexOf("displayport") !== -1
    || blob.indexOf("display port") !== -1
}

function audioCandidate(node, role) {
  var placed = audioCodecTier(node)
  var nickname = text(node.nickname)
  var description = text(node.description)
  var name = text(node.name)
  return {
    role: role,
    name: name,
    description: description,
    nickname: nickname,
    label: nickname || description || name,
    tier: placed.tier,
    reason: placed.reason
  }
}

// Deterministic within a tier: description, then node name. Plain string
// comparison, not localeCompare, so two shells on the same nodes agree.
function compareAudioCandidates(left, right) {
  if (left.tier !== right.tier) return left.tier - right.tier
  if (left.description !== right.description) return left.description < right.description ? -1 : 1
  if (left.name !== right.name) return left.name < right.name ? -1 : 1
  return 0
}

function audioCandidates(nodes) {
  var result = { rx: [], tx: [] }
  var list = nodes && nodes.length ? nodes : []
  for (var i = 0; i < list.length; i++) {
    var node = list[i]
    if (audioCandidateExcluded(node)) continue
    if (node.isSink === true) result.tx.push(audioCandidate(node, "tx"))
    else result.rx.push(audioCandidate(node, "rx"))
  }
  result.rx.sort(compareAudioCandidates)
  result.tx.sort(compareAudioCandidates)
  return result
}

function stateOf(snapshot, key) {
  var item = snapshot ? snapshot[key] : null
  return item && item.state ? item.state : UNKNOWN
}

function readoutOf(snapshot, key) {
  var item = snapshot ? snapshot[key] : null
  return item && item.readout ? String(item.readout) : "—"
}

function detailOf(snapshot, key) {
  var item = snapshot ? snapshot[key] : null
  return item && item.detail ? String(item.detail) : "Not probed yet"
}

function metaOf(snapshot, key) {
  var item = snapshot ? snapshot[key] : null
  return item && item.meta ? String(item.meta) : ""
}

function overall(snapshot) {
  var anyWarn = false
  var allOk = true

  for (var i = 0; i < KEYS.length; i++) {
    var state = stateOf(snapshot, KEYS[i])
    if (state === FAIL) return FAIL
    if (state === WARN) anyWarn = true
    if (state !== OK) allOk = false
  }

  if (anyWarn) return WARN
  return allOk ? OK : UNKNOWN
}

function counts(snapshot) {
  var result = { ready: 0, attention: 0, blocked: 0, unknown: 0 }
  for (var i = 0; i < KEYS.length; i++) {
    var state = stateOf(snapshot, KEYS[i])
    if (state === OK) result.ready++
    else if (state === WARN) result.attention++
    else if (state === FAIL) result.blocked++
    else result.unknown++
  }
  return result
}

function rows(snapshot) {
  var result = []
  for (var i = 0; i < KEYS.length; i++) {
    var key = KEYS[i]
    result.push({
      key: key,
      label: LABELS[key],
      state: stateOf(snapshot, key),
      readout: readoutOf(snapshot, key),
      detail: detailOf(snapshot, key),
      meta: metaOf(snapshot, key)
    })
  }
  return result
}

function label(state) {
  return STATES[state] ? STATES[state].label : STATES.unknown.label
}

function shortLabel(state) {
  return STATES[state] ? STATES[state].short : STATES.unknown.short
}

function color(state) {
  return STATES[state] ? STATES[state].color : STATES.unknown.color
}

function verdict(state) {
  return VERDICTS[state] || VERDICTS.unknown
}

function verdictDetail(state, counts) {
  if (state === OK) return "All three checks are green."
  if (state === FAIL) {
    var attention = counts.attention > 0
      ? " · " + counts.attention + (counts.attention === 1 ? " needs attention" : " need attention")
      : ""
    return counts.blocked + (counts.blocked === 1 ? " check failed" : " checks failed") + attention
  }
  if (state === WARN) {
    return counts.attention + " of 3 checks "
      + (counts.attention === 1 ? "needs" : "need") + " attention."
  }
  return "One or more checks cannot be answered yet."
}

function tooltip(snapshot) {
  var lines = ["Station: " + label(overall(snapshot))]
  var items = rows(snapshot)
  for (var i = 0; i < items.length; i++) {
    lines.push(items[i].label + ": " + shortLabel(items[i].state) + " — " + items[i].detail)
  }
  return lines.join("\n")
}
