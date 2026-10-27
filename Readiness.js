// Pure readiness model shared by the bar indicator and the expanded panel.
//
// The probe layer is intentionally not wired yet. Each check is a small object
// with a state plus three display fields:
//
//   readout  the value the panel leads with: time source, frequency, sample rate
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
  return "The probes are not wired yet, so every check reads unknown."
}

function tooltip(snapshot) {
  var lines = ["Station: " + label(overall(snapshot))]
  var items = rows(snapshot)
  for (var i = 0; i < items.length; i++) {
    lines.push(items[i].label + ": " + shortLabel(items[i].state) + " — " + items[i].detail)
  }
  return lines.join("\n")
}
