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
// A check no declared station path needs. It is neither a pass nor a failure:
// aggregation skips it, the verdict's counts exclude it, and the panel never
// draws it. See ADR 0004.
var NA = "na"

var KEYS = ["time", "cat", "audio", "tnc"]

var LABELS = {
  time: "Time sync",
  cat: "CAT control",
  audio: "Radio audio",
  tnc: "TNC transport"
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
  },
  na: {
    label: "Not applicable",
    short: "N/A",
    color: "#8b9198"
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
  return { time: notProbed(), cat: notProbed(), audio: notProbed(), tnc: notProbed() }
}

function text(value) {
  return value === undefined || value === null ? "" : String(value)
}

// A check that has not been asked yet. Probes start here so the bar is grey
// rather than red while the first answer is still in flight.
function notProbed() {
  return check(UNKNOWN, "—", "Not probed yet", "")
}

// A check no declared path needs. The state exists in the fixed snapshot shape
// so every probe can keep writing its own key; the panel and aggregation are
// the places that drop it.
function notApplicable() {
  return check(NA, "—", "Not applicable", "")
}

function applicable(state) {
  return state !== NA
}

// ---- Station paths ------------------------------------------------------
//
// ADR 0004: a station declares the paths it expects, never inferred from what
// is plugged in. Host audio needs CAT and radio audio; TNC needs the modem
// transport. Time sync serves the station as a whole, so both paths include it
// exactly once.

var STATION_PATH_KEY = "stationPaths"

var PATH_HOST = "host"
var PATH_TNC = "tnc"
var PATH_BOTH = "both"

// The manifest's values, in its order. The consequence of each lives in the
// manifest description; the model only needs the values.
var STATION_PATH_DEFAULT = "Host audio"

var STATION_PATH_OPTIONS = [
  { value: STATION_PATH_DEFAULT },
  { value: "TNC" },
  { value: "Both" }
]

function stationPathSettingKey() {
  return STATION_PATH_KEY
}

// The setting is case-insensitive and tolerant of the manifest's label; an
// unrecognised value is the default, Host audio.
function stationPathsOf(value) {
  var raw = text(value).trim().toLowerCase().replace(/[-\s]/g, "")
  if (raw === PATH_TNC) return PATH_TNC
  if (raw === PATH_BOTH) return PATH_BOTH
  return PATH_HOST
}

function declares(value, path) {
  var declared = stationPathsOf(value)
  return declared === PATH_BOTH || declared === path
}

// The declaration's label for the panel's control and picker. Whatever casing
// or alias shell.json holds, the manifest's label is what the operator sees.
function stationPathLabel(value) {
  var path = stationPathsOf(value)
  if (path === PATH_TNC) return "TNC"
  if (path === PATH_BOTH) return "Both"
  return STATION_PATH_DEFAULT
}

function stationPathConsequence(path) {
  if (path === PATH_TNC)
    return "a modem carries the audio and keys the rig; only its transport is graded"
  if (path === PATH_BOTH) return "every declared path must be ready"
  return "CAT control and radio audio over the host's soundcard"
}

// The picker's rows: the manifest's values, in its order, with the consequence
// that value has for readiness. The panel is where the declaration is made, so
// a station can switch between Host audio, TNC and Both without the CLI.
function stationPathRows(current) {
  var active = stationPathsOf(current)
  var rows = []
  for (var i = 0; i < STATION_PATH_OPTIONS.length; i++) {
    var value = STATION_PATH_OPTIONS[i].value
    var path = stationPathsOf(value)
    rows.push({
      kind: "paths",
      selectable: true,
      value: value,
      label: value,
      description: stationPathConsequence(path),
      assigned: path === active
    })
  }
  return rows
}

// The cursor opens on the declaration the station is set to.
function stationPathCursor(current) {
  var rows = stationPathRows(current)
  for (var i = 0; i < rows.length; i++)
    if (rows[i].assigned === true) return i
  return 0
}

function pathChecks(path) {
  return path === PATH_TNC ? ["time", "tnc"] : ["time", "cat", "audio"]
}

function worstState(states) {
  var found = false
  var anyWarn = false
  var anyUnknown = false
  for (var i = 0; i < states.length; i++) {
    var state = states[i]
    if (!applicable(state)) continue
    found = true
    if (state === FAIL) return FAIL
    if (state === WARN) anyWarn = true
    else if (state !== OK) anyUnknown = true
  }
  if (anyWarn) return WARN
  if (anyUnknown) return UNKNOWN
  return found ? OK : UNKNOWN
}

function pathState(snapshot, path) {
  var keys = pathChecks(path)
  var states = []
  for (var i = 0; i < keys.length; i++) states.push(stateOf(snapshot, keys[i]))
  return worstState(states)
}

function pathTitle(path) {
  return path === PATH_TNC ? "TNC" : "Host audio"
}

function pathWord(state) {
  if (state === OK) return "ready"
  if (state === WARN) return "needs attention"
  if (state === FAIL) return "not ready"
  if (state === NA) return "not applicable"
  return "not probed"
}

function pathPhrase(path, state) {
  return pathTitle(path) + " " + pathWord(state)
}

function capitalizeFirst(value) {
  var raw = text(value)
  return raw === "" ? raw : raw.charAt(0).toUpperCase() + raw.slice(1)
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

// The setting's key and its manifest values. The ladder normalises casing;
// the picker writes and displays the manifest's casing, so the stored value
// is always one of these.
var GPS_MODE_KEY = "gpsMode"

var GPS_MODE_OPTIONS = [
  { value: "Off", consequence: "NTP is enough" },
  { value: "Optional", consequence: "warn when GPS is lost" },
  { value: "Required", consequence: "warn when GPS is lost, has no PPS, or is not selected" }
]

function gpsModeSettingKey() {
  return GPS_MODE_KEY
}

// The picker's rows: the consequence is the one-line reason under the label,
// and `assigned` marks the value the station is set to. Order is the
// manifest's, least to most strict.
function gpsModeRows(current) {
  var active = gpsModeOf(current)
  var rows = []
  for (var i = 0; i < GPS_MODE_OPTIONS.length; i++) {
    var option = GPS_MODE_OPTIONS[i]
    rows.push({
      kind: "gps",
      selectable: true,
      value: option.value,
      label: option.value,
      description: option.consequence,
      assigned: gpsModeOf(option.value) === active
    })
  }
  return rows
}

// The cursor opens on the current mode's row.
function gpsModeCursor(current) {
  var rows = gpsModeRows(current)
  for (var i = 0; i < rows.length; i++)
    if (rows[i].assigned === true) return i
  return 0
}

// The detail names the setting rather than the absent hardware: with the mode
// off there is nothing missing, only a configuration choice.
var TIME_GPS_OFF = "GPS mode off"
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
    return check(OK, "NTP", TIME_GPS_OFF, TIME_DISCIPLINED)

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
// ADR 0003: readiness is link health. rigctld from the hamlib package must
// already be running; the widget never starts one and never opens the serial
// device. The rig must answer frequency and mode. Meter readings and PTT tests
// are never signals; PTT state is read only.
//
// `input` is:
//
//   installed   the hamlib package is present, so rigctld can run at all
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
    installed: true,
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

  // A missing hamlib package outranks every other rung: rigctld cannot run if
  // it was never installed, and "not running" would send the operator after a
  // daemon that is not there. The package is what they have to add.
  if (facts.installed === false)
    return check(FAIL, "—", "hamlib is not installed", "install hamlib")

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

// ---- TNC transport ------------------------------------------------------
//
// ADR 0005: readiness is transport holdership, never a KISS dialogue. The
// widget grades the transport the operator assigned and stops there: no
// identification frame proves a generic modem, and opening a port another
// process holds would steal inbound frames from the station being judged.
//
// `input` is:
//
//   assigned    the tncTransport setting: an absolute device path or a
//               Bluetooth address, classified by shape
//   serial      { present, charDevice, readable, opens, holderPid,
//                 holderName, onboard }
//   bluetooth   { paired, connected, name, address }
//
// A held port reads ok and names the holder. That is the state a working TNC
// station is in while it is being used, so failing it would turn red on
// exactly the station that works.

var TNC_SETTING_KEY = "tncTransport"

function tncSettingKey() {
  return TNC_SETTING_KEY
}

// The neutral fact set a probe starts from, and the shape tncCheck reads.
function tncFacts() {
  return {
    assigned: "",
    serial: {
      present: false,
      charDevice: false,
      readable: false,
      opens: false,
      holderPid: 0,
      holderName: "",
      onboard: false
    },
    bluetooth: {
      missing: false,
      paired: false,
      connected: false,
      name: "",
      address: ""
    }
  }
}

// The setting holds either an absolute device path or a Bluetooth address.
// Shape is the only classifier: an unrecognised string is a configuration
// fault, never a guess.
function tncTransportKind(value) {
  var raw = text(value).trim()
  if (raw === "") return ""
  if (raw.charAt(0) === "/") return "serial"
  if (/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(raw)) return "bluetooth"
  return ""
}

// Meta names the transport kind, never a modem model: a path identifies a
// chip family and a USB CDC port says nothing about KISS.
function tncSerialKind(path) {
  var raw = text(path)
  if (raw.indexOf("/dev/ttyACM") === 0) return "USB CDC"
  if (raw.indexOf("/dev/ttyUSB") === 0) return "USB serial"
  if (raw.indexOf("/dev/ttyS") === 0) return "onboard serial"
  return "serial"
}

function tncCheck(input) {
  var facts = input || {}
  var assigned = text(facts.assigned).trim()
  var kind = tncTransportKind(assigned)

  if (assigned === "")
    return check(UNKNOWN, "—", "No TNC transport assigned", "choose a transport")

  if (kind === "bluetooth") {
    var bluetooth = facts.bluetooth || {}
    var address = text(bluetooth.address) || assigned
    var name = text(bluetooth.name)
    var readout = name === "" ? address : name
    // The address is assigned but the device is not in BlueZ's list: saying it
    // is unpaired would be a factual claim the probe cannot make.
    if (bluetooth.missing === true)
      return check(FAIL, readout, "Bluetooth device not found", address)
    if (bluetooth.paired !== true)
      return check(FAIL, readout, "Bluetooth device is not paired", address)
    if (bluetooth.connected !== true)
      return check(FAIL, readout, "Bluetooth device is not connected", address)
    return check(OK, readout, "connected over Bluetooth", address)
  }

  if (kind !== "serial")
    return check(FAIL, assigned, "not a device path or Bluetooth address", "")

  var serial = facts.serial || {}
  var transport = tncSerialKind(assigned)

  if (serial.present !== true)
    return check(FAIL, assigned, "serial device " + assigned + " not present", transport)

  if (serial.charDevice !== true)
    return check(FAIL, assigned, assigned + " is not a character device", transport)

  // Held outranks permission and the onboard warning: another process using
  // the port is the strongest evidence the station works, and the port must
  // not be opened. The holder is visible in /proc even when we cannot read it.
  var holderPid = Number(serial.holderPid) || 0
  if (holderPid > 0) {
    var holderName = text(serial.holderName)
    var holder = holderName === ""
      ? "in use by pid " + holderPid
      : "in use by " + holderName + " (pid " + holderPid + ")"
    return check(OK, assigned, holder, "pid " + holderPid)
  }

  if (serial.readable !== true)
    return check(FAIL, assigned, "permission denied on " + assigned, "add your user to the dialout group")

  if (serial.onboard === true)
    return check(WARN, assigned,
      "onboard serial port — cannot tell whether a modem is attached", "onboard serial")

  if (serial.opens !== true)
    return check(FAIL, assigned, "cannot open " + assigned + " read-only", transport)

  return check(OK, assigned, "no program is using it", transport)
}

// The serial report is the small shell probe in TncProbe.qml: presence,
// character-device-ness, our own read permission, the holding pid, and whether
// the free port opened read-only and closed again.
function tncSerialFacts(value, path) {
  var facts = tncFacts().serial
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var split = rows[i].indexOf("=")
    if (split < 0) continue
    var key = rows[i].slice(0, split).trim()
    var raw = rows[i].slice(split + 1).trim()

    if (key === "present") facts.present = raw === "1"
    else if (key === "char") facts.charDevice = raw === "1"
    else if (key === "read") facts.readable = raw === "1"
    else if (key === "opens") facts.opens = raw === "1"
    else if (key === "onboard") facts.onboard = raw === "1"
    else if (key === "holder") facts.holderPid = Number(raw) || 0
    else if (key === "holder_name") facts.holderName = raw
  }
  // An onboard port is known from the path even if the report stopped early.
  if (text(path).indexOf("/dev/ttyS") === 0) facts.onboard = true
  return facts
}

// ---- TNC transport: candidate ranking ----------------------------------
//
// A candidate name identifies a chip family or a product string, never a
// modem: a Mobilinkd product string suggests a TNC, and so does any name
// carrying "TNC", but neither proves KISS. Recognised names lead, then paired
// Bluetooth devices, then the rest. Every reason says "suggests rather than
// identifies".

var TNC_TIER_RECOGNISED = 0
var TNC_TIER_PAIRED = 1
var TNC_TIER_OTHER = 2

var TNC_RECOGNISED_NAMES = ["mobilinkd", "tnc"]

var TNC_RECOGNISED_REASON = "recognised modem name — suggests rather than identifies"
var TNC_PAIRED_REASON = "paired Bluetooth device — suggests rather than identifies"

function tncRecognisedName(value) {
  var lowered = text(value).toLowerCase()
  for (var i = 0; i < TNC_RECOGNISED_NAMES.length; i++)
    if (lowered.indexOf(TNC_RECOGNISED_NAMES[i]) !== -1) return true
  return false
}

function tncPrettyModel(value) {
  return text(value).replace(/_/g, " ").trim()
}

function tncSerialCandidates(value) {
  var result = []
  var rows = splitLines(value)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].trim()
    if (row.indexOf("serial|") !== 0) continue
    var rest = row.slice(7)
    var split = rest.indexOf("|")
    var path = text(split < 0 ? rest : rest.slice(0, split)).trim()
    if (path === "") continue
    var model = tncPrettyModel(split < 0 ? "" : rest.slice(split + 1))
    var label = model === "" ? path : model
    var recognised = tncRecognisedName(label) || tncRecognisedName(path)
    result.push({
      kind: "serial",
      value: path,
      label: label,
      description: model === "" ? "" : path,
      reason: recognised ? TNC_RECOGNISED_REASON
        : tncSerialKind(path) + " — suggests rather than identifies",
      tier: recognised ? TNC_TIER_RECOGNISED : TNC_TIER_OTHER
    })
  }
  return result
}

function tncBluetoothCandidates(devices) {
  var result = []
  var list = devices && devices.length ? devices : []
  for (var i = 0; i < list.length; i++) {
    var device = list[i] || {}
    // Trusted is not paired: BlueZ lets an operator trust a device without
    // bonding it, and trusting it does not make it a transport.
    var paired = device.paired === true || device.bonded === true
    if (!paired) continue
    var address = text(device.address).trim()
    if (address === "") continue
    var name = text(device.name) || text(device.deviceName) || address
    var recognised = tncRecognisedName(name)
    result.push({
      kind: "bluetooth",
      value: address,
      label: name,
      description: address,
      reason: recognised ? TNC_RECOGNISED_REASON : TNC_PAIRED_REASON,
      tier: recognised ? TNC_TIER_RECOGNISED : TNC_TIER_PAIRED,
      paired: true,
      connected: device.connected === true
    })
  }
  return result
}

// Deterministic within a tier: label, then value. Plain string comparison, not
// localeCompare, so two shells on the same devices agree.
function compareTncCandidates(left, right) {
  if (left.tier !== right.tier) return left.tier - right.tier
  if (left.label !== right.label) return left.label < right.label ? -1 : 1
  if (left.value !== right.value) return left.value < right.value ? -1 : 1
  return 0
}

function tncCandidates(serialText, bluetoothDevices) {
  var result = tncSerialCandidates(serialText).concat(tncBluetoothCandidates(bluetoothDevices))
  result.sort(compareTncCandidates)
  return result
}

// Evidence of an undeclared path is a line of verdict text, never a state. A
// serial candidate is preferred because the hint can name a device path.
function tncHint(candidates) {
  var list = candidates && candidates.length ? candidates : []
  var fallback = null
  for (var i = 0; i < list.length; i++) {
    if (list[i].tier !== TNC_TIER_RECOGNISED) continue
    if (list[i].kind === "serial") return tncHintLine(list[i])
    if (!fallback) fallback = list[i]
  }
  return fallback ? tncHintLine(fallback) : ""
}

function tncHintLine(candidate) {
  return "KISS modem on `" + text(candidate.value) + "` — declare a TNC path"
}

function sameTncTransport(left, right) {
  var first = text(left).trim()
  var second = text(right).trim()
  if (first === "" || second === "") return first === second
  if (tncTransportKind(first) === "bluetooth" && tncTransportKind(second) === "bluetooth")
    return first.toLowerCase() === second.toLowerCase()
  return first === second
}

// The picker's rows: a header, one row per candidate carrying the reason the
// name only suggests a modem, and a Clear row when something is assigned.
function tncTransportRows(candidates, current) {
  var list = candidates && candidates.length ? candidates : []
  var rows = [{ kind: "header", selectable: false, text: "TNC transport" }]
  for (var i = 0; i < list.length; i++) {
    var candidate = list[i]
    rows.push({
      kind: "tnc",
      selectable: true,
      value: text(candidate.value),
      label: text(candidate.label) || text(candidate.value),
      description: text(candidate.description),
      reason: text(candidate.reason),
      assigned: sameTncTransport(candidate.value, current)
    })
  }
  if (list.length === 0)
    rows.push({
      kind: "empty",
      selectable: false,
      text: "No serial or paired Bluetooth devices present"
    })
  if (text(current).trim() !== "")
    rows.push({
      kind: "clear",
      selectable: true,
      role: "tnc",
      label: "Clear TNC transport"
    })
  return rows
}

// The cursor opens on the assigned transport's row.
function tncTransportCursor(candidates, current) {
  var rows = tncTransportRows(candidates, current)
  var slot = 0
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].selectable !== true) continue
    if (rows[i].assigned === true) return slot
    slot++
  }
  return 0
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
  var states = []
  for (var i = 0; i < KEYS.length; i++) states.push(stateOf(snapshot, KEYS[i]))
  return worstState(states)
}

function counts(snapshot) {
  var result = { ready: 0, attention: 0, blocked: 0, unknown: 0 }
  for (var i = 0; i < KEYS.length; i++) {
    var state = stateOf(snapshot, KEYS[i])
    if (!applicable(state)) continue
    if (state === OK) result.ready++
    else if (state === WARN) result.attention++
    else if (state === FAIL) result.blocked++
    else result.unknown++
  }
  return result
}

function totalCount(counts) {
  return counts.ready + counts.attention + counts.blocked + counts.unknown
}

// Only applicable checks reach the panel: a row that is na is not drawn at all
// rather than drawn greyed out.
function rows(snapshot) {
  var result = []
  for (var i = 0; i < KEYS.length; i++) {
    var key = KEYS[i]
    var state = stateOf(snapshot, key)
    if (!applicable(state)) continue
    result.push({
      key: key,
      label: LABELS[key],
      state: state,
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

// The verdict always names every declared path. With both declared, the two
// path phrases keep the working half visible ("Host audio ready · TNC needs
// attention"); with one declared, the path is named and the counts explain the
// state. An undeclared-path hint rides along as text, never as a state.
function verdictDetail(state, counts, snapshot, stationPaths, hint) {
  var declaration = stationPaths === undefined ? STATION_PATH_DEFAULT : stationPaths
  var hostDeclared = declares(declaration, PATH_HOST)
  var tncDeclared = declares(declaration, PATH_TNC)
  var suffix = !tncDeclared && text(hint) !== "" ? " · " + text(hint) : ""

  if (hostDeclared && tncDeclared) {
    if (state === OK) return "Ready for host audio and TNC" + suffix
    var host = snapshot ? pathState(snapshot, PATH_HOST) : state
    var tnc = snapshot ? pathState(snapshot, PATH_TNC) : state
    return capitalizeFirst(pathPhrase(PATH_HOST, host) + " · " + pathPhrase(PATH_TNC, tnc)) + suffix
  }

  var path = tncDeclared ? PATH_TNC : PATH_HOST
  if (state === OK) return (path === PATH_TNC ? "Ready for TNC" : "Ready for host audio") + suffix

  var total = totalCount(counts)
  if (state === FAIL) {
    var attention = counts.attention > 0
      ? " · " + counts.attention + (counts.attention === 1 ? " needs attention" : " need attention")
      : ""
    return pathTitle(path) + " not ready · "
      + counts.blocked + (counts.blocked === 1 ? " check failed" : " checks failed")
      + attention + suffix
  }
  if (state === WARN) {
    return pathTitle(path) + ": " + counts.attention + " of " + total + " checks "
      + (counts.attention === 1 ? "needs" : "need") + " attention" + suffix
  }
  return pathTitle(path) + " not probed yet" + suffix
}

function tooltip(snapshot, stationPaths, hint) {
  var declaration = stationPaths === undefined ? STATION_PATH_DEFAULT : stationPaths
  var lines = ["Station: " + label(overall(snapshot))]
  if (declares(declaration, PATH_HOST))
    lines.push("Host audio: " + pathWord(pathState(snapshot, PATH_HOST)))
  if (declares(declaration, PATH_TNC))
    lines.push("TNC: " + pathWord(pathState(snapshot, PATH_TNC)))
  var items = rows(snapshot)
  for (var i = 0; i < items.length; i++) {
    lines.push(items[i].label + ": " + shortLabel(items[i].state) + " — " + items[i].detail)
  }
  if (!declares(declaration, PATH_TNC) && text(hint) !== "") lines.push(text(hint))
  return lines.join("\n")
}
