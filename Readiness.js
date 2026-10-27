// Pure readiness model shared by the bar indicator and the expanded panel.
//
// TimeProbe.qml, CatProbe.qml and AudioProbe.qml resolve facts; the ladders in
// this file own the rung order, the policy and the wording. Each check is a
// small object with a state plus three display fields:
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
  return { time: notProbed(), cat: notProbed(), audio: notProbed() }
}

function text(value) {
  return value === undefined || value === null ? "" : String(value)
}

// A check that has not been asked yet. Probes start here so the bar is grey
// rather than red while the first answer is still in flight.
function notProbed() {
  return check(UNKNOWN, "—", "Not probed yet", "")
}

// ---- Time sync ----------------------------------------------------------
//
// ADR 0001: readiness is source health, never clock variance. The probe
// resolves which daemon answers and how far the configured GPS source got;
// this function owns the rung order, the gpsMode policy and the wording.
//
// `input` is:
//
//   gpsMode     "off" | "optional" | "required"
//   daemon      "chrony" | "timesyncd" | "none"
//   synced      the clock is being disciplined right now
//   server      the reference carrying the clock, "" when there is none
//   gps         { gpsd, installed, missing, devices, mode, satellites, pps,
//                 selected }
//
// Rungs, most specific first: no device, gpsd not running, no fix, fix
// without PPS, ready but not selected, disciplining. A fix never forces the
// clock onto GPS — the daemon's selected reference decides the readout — and
// a healthy NTP fallback is still a ready clock.

var GPS_OFF = "off"
var GPS_OPTIONAL = "optional"
var GPS_REQUIRED = "required"

var TIME_NO_GPS = "no GPS configured"
var TIME_DISCIPLINED = "clock disciplined"
var TIME_GPS_LOST = "GPS lost"

function gpsModeOf(value) {
  var mode = text(value).trim().toLowerCase()
  if (mode === GPS_REQUIRED) return GPS_REQUIRED
  if (mode === GPS_OPTIONAL) return GPS_OPTIONAL
  return GPS_OFF
}

// The neutral fact set a probe starts from, and the shape timeCheck reads.
// Kept here so the probe never invents a field and the tests can assert the
// neutral answer.
function timeFacts() {
  return {
    daemon: "none",
    synced: false,
    server: "",
    gps: {
      gpsd: false,
      installed: true,
      missing: false,
      devices: 0,
      mode: 0,
      satellites: 0,
      pps: false,
      selected: false
    }
  }
}

function daemonLabel(daemon) {
  if (daemon === "chrony") return "chrony"
  if (daemon === "timesyncd") return "systemd-timesyncd"
  return "no NTP daemon"
}

// Mode 2 is a 2D fix and mode 3 a 3D one; both carry UTC. Modes 0 and 1 have
// no position or time solution at all.
function gpsFixLabel(mode) {
  return mode === 3 ? "3D fix" : "2D fix"
}

function satelliteMeta(gps) {
  var used = Number(gps.satellites)
  return isFinite(used) && used > 0 ? " · " + used + " satellites" : ""
}

function timeCheck(input) {
  var facts = input || {}
  var mode = gpsModeOf(facts.gpsMode)
  var gps = facts.gps || {}
  var daemon = text(facts.daemon) || "none"
  var configured = mode !== GPS_OFF
  var required = mode === GPS_REQUIRED

  // Neither daemon answered: nothing is carrying the clock, which outranks
  // every source rung because no rung can be reached without a daemon.
  if (daemon === "none")
    return check(FAIL, "None", "no time source", "clock free-running")

  // A daemon that is up but not steering the clock is a fault, not a "cannot
  // answer": the station has no trustworthy UTC right now.
  if (facts.synced !== true) {
    var label = daemonLabel(daemon)
    var server = text(facts.server)
    return check(FAIL, "None", "clock not synchronised",
      server === "" ? label : label + " · " + server)
  }

  if (!configured)
    return check(OK, "NTP", TIME_NO_GPS, TIME_DISCIPLINED)

  // GPS is the configured source. The readout stays the source the daemon is
  // actually using until GPS is the selected reference.
  var readout = gps.selected === true ? "GPS" : "NTP"
  var lostMeta = TIME_GPS_LOST + satelliteMeta(gps)
  var policy = required ? WARN : OK

  // A missing package outranks every other source rung: nothing else can be
  // reached until it is installed. Then a configured device that is gone is
  // more specific than a daemon that is not running.
  if (gps.gpsd !== true) {
    if (gps.installed === false) return check(WARN, readout, "gpsd is not installed", lostMeta)
    return gps.missing === true
      ? check(WARN, readout, "no GPS device", lostMeta)
      : check(WARN, readout, "gpsd not running", lostMeta)
  }

  // gpsd's own receiver list is authoritative while it is up.
  if (gps.devices === 0)
    return check(WARN, readout, "no GPS device", lostMeta)

  if (!(gps.mode >= 2))
    return check(WARN, readout, "GPS · no fix", lostMeta)

  var fix = gpsFixLabel(gps.mode)

  if (gps.pps !== true)
    return check(policy, readout, fix + " · no PPS",
      required ? "GPS required"
        : (gps.selected === true ? "NMEA timing" : TIME_DISCIPLINED))

  if (gps.selected !== true)
    return check(policy, "NTP", "GPS ready · not selected",
      required ? "GPS required" : TIME_DISCIPLINED)

  return check(OK, "GPS", fix + " · PPS", TIME_DISCIPLINED)
}

// ---- Time probe: reading the tools ------------------------------------
//
// The probe runs the tools; these turn their output into the facts timeCheck
// consumes. Every parser tolerates a truncated or missing answer and returns
// neutral facts for it, so a stopped daemon can never read as healthy.

function splitLines(value) {
  return text(value).split("\n")
}

// `chronyc tracking`: the reference carrying the clock and whether chrony is
// steering it. Reference ID 00000000 means no reference has ever been chosen.
function chronyTrackingFacts(value) {
  var facts = { synced: false, server: "", reference: "" }
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var reference = /^\s*Reference ID\s*:\s*(\S+)\s*(?:\((.*)\))?/.exec(rows[i])
    if (reference) {
      facts.reference = text(reference[1])
      var named = text(reference[2]).trim()
      facts.server = named === "" ? facts.reference : named
      continue
    }
    var leap = /^\s*Leap status\s*:\s*(.+?)\s*$/.exec(rows[i])
    if (leap) facts.synced = text(leap[1]).toLowerCase() === "normal"
  }
  if (facts.reference === "00000000") facts.server = ""
  return facts
}

// `chronyc sources`: '#' marks a local reference clock, '*' the selected
// reference. A selected refclock means a receiver is steering the clock —
// whether that is PPS or NMEA/SHM — and a reachable PPS refclock is what makes
// the timing precise. Within this station model a selected refclock is the GPS
// source; any other local clock is not modelled.
function chronySourcesFacts(value) {
  var facts = { pps: false, selected: false }
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var entry = /^([\^=#])([*+\-?x~])\s+(\S+)/.exec(rows[i])
    if (!entry || entry[1] !== "#") continue
    if (entry[2] === "*") facts.selected = true
    if ((entry[2] === "*" || entry[2] === "+") && /^pps/i.test(entry[3])) facts.pps = true
  }
  return facts
}

// `timedatectl timesync-status`: the server line names the reference. "n/a"
// means timesyncd has not reached one, so there is no name to report.
function timesyncStatusFacts(value) {
  var facts = { server: "" }
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var server = /^\s*Server\s*:\s*(.+?)\s*$/.exec(rows[i])
    if (!server) continue
    var raw = text(server[1])
    var named = /\((.*)\)\s*$/.exec(raw)
    var address = text(raw.replace(/\s*\(.*\)\s*$/, "")).trim()
    if (address === "" || address === "n/a") break
    var name = named ? text(named[1]).trim() : ""
    facts.server = name === "" ? address : name
    break
  }
  return facts
}

// `gpspipe -w`: one JSON message per line. VERSION proves gpsd answered,
// DEVICES lists receivers, TPV carries the fix mode and SKY the satellites.
function gpsReportFacts(value) {
  var facts = { gpsd: false, devices: 0, mode: 0, satellites: 0 }
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].trim()
    if (row.charAt(0) !== "{") continue
    var message = null
    try { message = JSON.parse(row) } catch (error) { continue }
    if (!message || typeof message !== "object") continue
    var kind = text(message["class"])
    if (kind === "") continue
    facts.gpsd = true

    if (kind === "DEVICES")
      facts.devices = message.devices && message.devices.length ? message.devices.length : 0
    else if (kind === "TPV" && typeof message.mode === "number")
      facts.mode = message.mode
    else if (kind === "SKY") {
      if (typeof message.uSat === "number") facts.satellites = message.uSat
      else if (message.satellites && message.satellites.length) {
        var used = 0
        for (var j = 0; j < message.satellites.length; j++)
          if (message.satellites[j] && message.satellites[j].used === true) used++
        facts.satellites = used
      }
    }
  }
  return facts
}

// The gpsd device list from /etc/default/gpsd, with the missing paths printed
// by the probe. Only the absence matters: gpsd's own list answers when it is
// up, and this only sharpens the rung when it is not.
function gpsConfigFacts(value) {
  var rows = splitLines(value)
  var missing = false
  for (var i = 0; i < rows.length; i++)
    if (rows[i].trim() !== "") missing = true
  return { missing: missing }
}

// ---- CAT control --------------------------------------------------------
//
// ADR 0003: readiness is link health. rigctld must already be running — the
// widget never starts one and never opens the serial device — and the rig must
// answer frequency and mode. Meter readings and PTT tests are never signals;
// PTT state is read only.
//
// `input` is:
//
//   rigctld     something is running as rigctld
//   queryable   the rigctl client is installed, so the link can be asked
//   endpoint    host:port the client talks to
//   device      { known, path, present, access, held, busy }
//   reply       { freq, mode, ptt, error }
//
// A reply is what proves the link: device facts only explain a reply that
// failed, because rigctld may hold the device as another user and outrank our
// own permission check.

var CAT_ENDPOINT = "127.0.0.1:4532"

// The neutral fact set a probe starts from, and the shape catCheck reads.
function catFacts() {
  return {
    rigctld: false,
    queryable: true,
    endpoint: CAT_ENDPOINT,
    device: {
      known: false,
      path: "",
      present: false,
      access: false,
      held: false,
      busy: false
    },
    reply: { freq: 0, mode: "", ptt: -1, error: "" }
  }
}

function catCheck(input) {
  var facts = input || {}
  var reply = facts.reply || {}
  var device = facts.device || {}
  var endpoint = text(facts.endpoint) || CAT_ENDPOINT

  if (facts.rigctld !== true)
    return check(FAIL, "—", "rigctld not running", endpoint)

  if (facts.queryable !== true)
    return check(UNKNOWN, "—", "rigctl is not installed — cannot query rigctld", endpoint)

  var hz = Number(reply.freq)
  if (isFinite(hz) && hz > 0) {
    // A frequency proves the link. Mode and PTT are read for the readout when
    // the backend supports them; a rig without get_mode is not a broken link.
    var mode = text(reply.mode)
    var meta = "rigctld"
    if (reply.ptt === 0) meta += " · PTT receive"
    else if (reply.ptt === 1 || reply.ptt === 2 || reply.ptt === 3) meta += " · PTT transmit"
    return check(OK, formatFrequency(hz), mode === "" ? "MHz" : "MHz · " + mode, meta)
  }

  // The link failed. The device says why, most specific rung first.
  if (device.known === true) {
    var path = text(device.path)
    if (device.present !== true)
      return check(FAIL, "—", "serial device " + path + " not present", endpoint)
    if (device.held !== true && device.access !== true)
      return check(FAIL, "—", "permission denied on " + path, "add your user to the dialout group")
    if (device.held !== true && device.busy === true)
      return check(FAIL, "—", "serial port " + path + " is in use", "another program holds it")
  }

  var error = text(reply.error)
  return check(FAIL, "—", "rig is not responding", error === "" ? endpoint : error)
}

function formatFrequency(hz) {
  var value = Number(hz)
  if (!isFinite(value) || value <= 0) return "—"
  return (value / 1000000).toFixed(3)
}

// ---- CAT probe: reading rigctld and rigctl ----------------------------
//
// `pgrep -a` gives the daemon's command line, which says which device it
// opened and which port it serves. The device report is the small shell probe
// in CatProbe.qml: presence, our own access, whether rigctld holds the file,
// and whether any other process does.

function rigctldFacts(value) {
  var facts = { pid: 0, device: "", port: 4532 }
  var rows = splitLines(value)
  var row = ""
  for (var r = 0; r < rows.length; r++) {
    if (rows[r].trim() === "") continue
    row = rows[r].trim()
    break
  }
  if (row === "") return facts

  var words = row.split(/\s+/)
  facts.pid = Number(words[0]) || 0
  for (var i = 1; i < words.length; i++) {
    var word = words[i]
    if (word === "-r" || word === "--rig-file") facts.device = text(words[i + 1])
    else if (word === "-t" || word === "--port") facts.port = Number(words[i + 1]) || 4532
    else if (word.indexOf("--rig-file=") === 0) facts.device = word.slice(11)
    else if (word.indexOf("--port=") === 0) facts.port = Number(word.slice(7)) || 4532
    // getopt also accepts the value attached to the short option.
    else if (word.indexOf("-r") === 0 && word.length > 2) facts.device = word.slice(2)
    else if (word.indexOf("-t") === 0 && word.length > 2) facts.port = Number(word.slice(2)) || 4532
  }
  // -r also takes a network address or "uh-rig": only an absolute path is a
  // serial device, and only a serial device can be checked for presence.
  if (facts.device.charAt(0) !== "/") facts.device = ""
  return facts
}

function catDeviceFacts(value, path) {
  var device = {
    known: text(path) !== "",
    path: text(path),
    present: false,
    access: false,
    held: false,
    busy: false
  }
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var split = rows[i].indexOf("=")
    if (split < 0) continue
    var key = rows[i].slice(0, split).trim()
    var raw = rows[i].slice(split + 1).trim()

    if (key === "present") device.present = raw === "1"
    else if (key === "access") device.access = raw === "1"
    else if (key === "holds") device.held = raw === "1"
    else if (key === "others") device.busy = raw !== ""
  }
  return device
}

// rigctl prints the value alone on success, or "RPRT x" for a Hamlib error.
function rigFrequency(value) {
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].trim()
    if (/^\d+$/.test(row)) return Number(row)
  }
  return 0
}

function rigMode(value) {
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].trim()
    if (/^RPRT/.test(row)) continue
    if (/^[A-Z][A-Z0-9]+$/.test(row)) return row
  }
  return ""
}

// -1 means the rig did not answer the question, not that it is receiving.
function rigPtt(value) {
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].trim()
    if (row === "0") return 0
    if (row === "1" || row === "2" || row === "3") return 1
  }
  return -1
}

function rigError(value) {
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].trim()
    if (row === "") continue
    if (/^RPRT\s*-?\d+/.test(row)) return row
    if (/error\s*=/i.test(row)) return row.replace(/^.*?error\s*=\s*/i, "")
    if (/timed out|not responding|connection refused|no route to host/i.test(row))
      return row.replace(/^rigctl:\s*/i, "")
  }
  return ""
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
