// Pure readiness model shared by the bar indicator and the expanded panel.
//
// The probe layer is intentionally not wired yet. Each check is a small object
// with a state and a human-readable detail string; replacing the whole snapshot
// is what makes the bar and panel update atomically.

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

function check(state, detail) {
  return {
    state: state || UNKNOWN,
    detail: detail || "Not probed yet"
  }
}

function emptySnapshot() {
  return {
    time: check(UNKNOWN, "Not probed yet"),
    cat: check(UNKNOWN, "Not probed yet"),
    audio: check(UNKNOWN, "Not probed yet")
  }
}

function stateOf(snapshot, key) {
  var item = snapshot ? snapshot[key] : null
  return item && item.state ? item.state : UNKNOWN
}

function detailOf(snapshot, key) {
  var item = snapshot ? snapshot[key] : null
  return item && item.detail ? String(item.detail) : "Not probed yet"
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

function rows(snapshot) {
  var result = []
  for (var i = 0; i < KEYS.length; i++) {
    var key = KEYS[i]
    result.push({
      key: key,
      label: LABELS[key],
      state: stateOf(snapshot, key),
      detail: detailOf(snapshot, key)
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

function tooltip(snapshot) {
  var lines = ["Station: " + label(overall(snapshot))]
  var items = rows(snapshot)
  for (var i = 0; i < items.length; i++) {
    lines.push(items[i].label + ": " + shortLabel(items[i].state) + " — " + items[i].detail)
  }
  return lines.join("\n")
}
