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
  audio: R.check(R.OK, "48 kHz", "Radio RX + Radio TX present", "RX −18 dB · TX idle")
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
  audio: R.check(R.OK, "48 kHz", "Radio RX + Radio TX present", "RX −18 dB · TX idle")
}
assert.equal(R.overall(oneWarning), R.WARN)
assert.equal(R.verdict(R.WARN), "Needs attention")
assert.match(R.verdictDetail(R.WARN, R.counts(oneWarning)), /1 of 3 checks needs attention/)

const oneFailure = {
  time: R.check(R.WARN, "NTP", "GPS · no fix", "GPS lost"),
  cat: R.check(R.FAIL, "—", "rigctld not running", ""),
  audio: R.check(R.OK, "48 kHz", "Radio RX + Radio TX present", "RX −18 dB · TX idle")
}
assert.equal(R.overall(oneFailure), R.FAIL)
assert.equal(R.verdict(R.FAIL), "Not ready")
assert.match(R.verdictDetail(R.FAIL, R.counts(oneFailure)), /1 check failed · 1 needs attention/)
assert.match(R.tooltip(oneFailure), /Station: Not ready/)
assert.match(R.tooltip(oneFailure), /CAT control: Fault/)

const partial = {
  time: R.check(R.OK, "NTP", "no GPS configured", "clock disciplined"),
  cat: R.check(R.UNKNOWN, "—", "Not probed yet", ""),
  audio: R.check(R.OK, "48 kHz", "Radio RX + Radio TX present", "RX −18 dB · TX idle")
}
assert.equal(R.overall(partial), R.UNKNOWN)
assert.equal(R.counts(partial).unknown, 1)

console.log("readiness tests passed")
