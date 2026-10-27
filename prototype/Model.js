// PROTOTYPE data only. Not wired to any probe.
//
// Time readiness is source-based: which source is supposed to discipline the
// clock, is that source healthy, and is the clock actually on it? There is no
// offset threshold. An offset can only be measured against a source you already
// trust, so it is a diagnostic residual, not an independent readiness signal.
//
// The four checks share one shape so the layouts can render them uniformly:
//   state     unknown | ok | warn | fail
//   readout   the value the instrument panel leads with (source, frequency, rate)
//   detail    what the readout means
//   meta      a secondary fact, never used to compute state
//   sentence  plain language for the guided flow
//   next      the one suggested action, empty when nothing needs doing

var COLORS = {
  unknown: "#8b9198",
  ok: "#73c37a",
  warn: "#d9b45f",
  fail: "#d36f6f"
}

var LABELS = {
  unknown: "Unknown",
  ok: "Ready",
  warn: "Needs attention",
  fail: "Not ready"
}

var SHORT = {
  unknown: "—",
  ok: "Ready",
  warn: "Check",
  fail: "Fault"
}

var TITLES = {
  time: "Time sync",
  cat: "CAT control",
  audio: "Radio audio"
}

var ORDER = ["time", "cat", "audio"]

// Lower sorts first: triage reads top-down.
var SEVERITY = { fail: 0, warn: 1, unknown: 2, ok: 3 }

function check(state, readout, detail, meta, sentence, next) {
  return {
    state: state,
    readout: readout,
    detail: detail,
    meta: meta || "",
    sentence: sentence,
    next: next || ""
  }
}

var UNKNOWN_CHECK = function() {
  return check("unknown", "—", "Not probed yet", "",
    "Not probed yet.", "")
}

// Shared ready checks, so the time-source samples differ only in the time row.
var READY_CAT = check("ok", "14.074", "MHz USB · FT-891", "rigctld · PTT receive",
  "Rig is on 14.074 MHz USB and rigctld is reachable.", "")

var READY_AUDIO = check("ok", "48 kHz", "Radio RX + Radio TX present", "RX −18 dB · TX idle",
  "Both radio audio devices are present and running at 48 kHz.", "")

var FAIL_AUDIO = check("fail", "missing", "Radio RX absent from PipeWire", "TX present",
  "Radio RX is missing from PipeWire, so decoding will fail.",
  "Reconnect the radio's USB audio device.")

// The time-source ladder, most specific rung first. The readout is the source
// chrony is actually using; the detail says how far the GPS source got.
//
// Green assumes GPS is optional. A station with GPS marked required would
// warn on "ready but not selected" and on a fix without PPS.
var TIME = {
  grey: UNKNOWN_CHECK(),

  // No GPS configured. NTP is enough; this is not a warning.
  ntp: check("ok", "NTP", "no GPS configured", "clock disciplined",
    "The clock is disciplined by NTP. No GPS is configured for this station.", ""),

  // GPS is the active source.
  gps: check("ok", "GPS", "3D fix · PPS", "clock disciplined",
    "GPS has a 3D fix and PPS is disciplining the clock.", ""),

  // GPS is healthy but NTP is selected. A fix does not force preference.
  "gps-ready": check("ok", "NTP", "GPS ready · not selected", "clock disciplined",
    "GPS has a 3D fix and PPS, but NTP is disciplining the clock. That is fine for digital modes; GPS is available if NTP drops.", ""),

  // GPS is the active source but without PPS: NMEA time, adequate for FT8.
  "gps-no-pps": check("ok", "GPS", "3D fix · no PPS", "NMEA timing",
    "GPS has a 3D fix but no PPS, so time comes from the NMEA sentence. That is adequate for FT8; PPS is what makes it precise.", ""),

  // GPS is configured but lost; NTP carries the clock.
  "no-fix": check("warn", "NTP", "GPS · no fix", "GPS lost",
    "GPS has no fix. The clock is still disciplined by NTP, but GPS timing is gone.",
    "Check the GPS antenna and sky view."),

  "gpsd-down": check("warn", "NTP", "gpsd not running", "GPS lost",
    "gpsd is not running, so the GPS receiver cannot be read. The clock is on NTP.",
    "Start gpsd or check the GPS service."),

  "no-device": check("warn", "NTP", "no GPS device", "GPS lost",
    "No GPS device is present. The clock is on NTP.",
    "Connect the GPS receiver."),

  none: check("fail", "None", "no time source", "clock free-running",
    "No time source is disciplining the clock, so JS8Call and FT8 will not decode reliably.",
    "Restore GPS or NTP time sync.")
}

var SAMPLES = {
  grey: { time: TIME.grey, cat: UNKNOWN_CHECK(), audio: UNKNOWN_CHECK() },
  green: { time: TIME.ntp, cat: READY_CAT, audio: READY_AUDIO },
  gps: { time: TIME.gps, cat: READY_CAT, audio: READY_AUDIO },
  "gps-ready": { time: TIME["gps-ready"], cat: READY_CAT, audio: READY_AUDIO },
  "gps-no-pps": { time: TIME["gps-no-pps"], cat: READY_CAT, audio: READY_AUDIO },
  "no-fix": { time: TIME["no-fix"], cat: READY_CAT, audio: READY_AUDIO },
  "gpsd-down": { time: TIME["gpsd-down"], cat: READY_CAT, audio: READY_AUDIO },
  "no-device": { time: TIME["no-device"], cat: READY_CAT, audio: READY_AUDIO },
  red: { time: TIME.none, cat: READY_CAT, audio: FAIL_AUDIO }
}

function snapshot(name) {
  return SAMPLES[name] || SAMPLES.red
}

function stateOf(snapshot, key) {
  var item = snapshot ? snapshot[key] : null
  return item && item.state ? item.state : "unknown"
}

function overall(snapshot) {
  var anyWarn = false
  var allOk = true
  for (var i = 0; i < ORDER.length; i++) {
    var state = stateOf(snapshot, ORDER[i])
    if (state === "fail") return "fail"
    if (state === "warn") anyWarn = true
    if (state !== "ok") allOk = false
  }
  if (anyWarn) return "warn"
  return allOk ? "ok" : "unknown"
}

function color(state) {
  return COLORS[state] || COLORS.unknown
}

function label(state) {
  return LABELS[state] || LABELS.unknown
}

function shortLabel(state) {
  return SHORT[state] || SHORT.unknown
}

function title(key) {
  return TITLES[key] || key
}

function counts(snapshot) {
  var result = { ready: 0, attention: 0, blocked: 0, unknown: 0 }
  for (var i = 0; i < ORDER.length; i++) {
    var state = stateOf(snapshot, ORDER[i])
    if (state === "ok") result.ready++
    else if (state === "warn") result.attention++
    else if (state === "fail") result.blocked++
    else result.unknown++
  }
  return result
}

function toRow(key, item) {
  return {
    key: key,
    title: title(key),
    state: item.state,
    readout: item.readout,
    detail: item.detail,
    meta: item.meta,
    sentence: item.sentence,
    next: item.next
  }
}

// Triage order: failed, then warnings, then unprobed, then ready.
function worstFirst(snapshot) {
  var rows = []
  for (var i = 0; i < ORDER.length; i++) {
    var key = ORDER[i]
    rows.push(toRow(key, snapshot[key] || UNKNOWN_CHECK()))
  }
  rows.sort(function(a, b) {
    return (SEVERITY[a.state] === undefined ? 9 : SEVERITY[a.state])
      - (SEVERITY[b.state] === undefined ? 9 : SEVERITY[b.state])
  })
  return rows
}

// Flow order: the order an operator would check the station.
function inFlow(snapshot) {
  var rows = []
  for (var i = 0; i < ORDER.length; i++) {
    var key = ORDER[i]
    rows.push(toRow(key, snapshot[key] || UNKNOWN_CHECK()))
  }
  return rows
}

function verdict(state) {
  if (state === "ok") return "Station ready"
  if (state === "warn") return "Needs attention"
  if (state === "fail") return "Not ready"
  return "Not probed yet"
}

function verdictDetail(state, counts) {
  if (state === "ok") return "All three checks are green."
  if (state === "fail") {
    var attention = counts.attention > 0
      ? " · " + counts.attention + (counts.attention === 1 ? " needs attention" : " need attention")
      : ""
    return counts.blocked + (counts.blocked === 1 ? " check failed" : " checks failed") + attention
  }
  if (state === "warn") {
    return counts.attention + " of 3 checks "
      + (counts.attention === 1 ? "needs" : "need") + " attention."
  }
  return "The probes are not wired yet, so every check reads unknown."
}

// Plain-language line for the guided flow. No widget vocabulary in it: this is
// the variant that has to make sense to someone who just wants to get on air.
function headline(state) {
  if (state === "ok") return "Everything the station needs is ready."
  if (state === "warn") return "The station works, with something to check."
  if (state === "fail") return "This station is not ready for a digital mode."
  return "Nothing is being checked yet."
}

// The guided flow lists checks in operating order but points its "next" prompt
// at the worst one, so a failure outranks an earlier warning.
function blockingCheck(snapshot) {
  var rows = worstFirst(snapshot)
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].state !== "ok") return rows[i]
  }
  return null
}

function tooltip(snapshot) {
  var lines = ["Prototype: " + verdict(overall(snapshot))]
  var rows = inFlow(snapshot)
  for (var i = 0; i < rows.length; i++) {
    lines.push(rows[i].title + ": " + shortLabel(rows[i].state) + " — " + rows[i].detail)
  }
  return lines.join("\n")
}

function cycle(list, current) {
  var index = list.indexOf(current)
  return list[(index + 1) % list.length]
}
