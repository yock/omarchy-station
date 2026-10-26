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

assert.equal(R.overall(R.emptySnapshot()), R.UNKNOWN)

const allReady = {
  time: R.check(R.OK, "NTP offset 12 ms"),
  cat: R.check(R.OK, "IC-7300 on 14.074 MHz"),
  audio: R.check(R.OK, "USB codec present")
}
assert.equal(R.overall(allReady), R.OK)
assert.equal(R.rows(allReady).length, 3)

const oneWarning = {
  time: R.check(R.OK, "NTP offset 12 ms"),
  cat: R.check(R.WARN, "No CAT response"),
  audio: R.check(R.OK, "USB codec present")
}
assert.equal(R.overall(oneWarning), R.WARN)

const oneFailure = {
  time: R.check(R.WARN, "Clock offset 900 ms"),
  cat: R.check(R.FAIL, "rigctld not running"),
  audio: R.check(R.OK, "USB codec present")
}
assert.equal(R.overall(oneFailure), R.FAIL)

const partial = {
  time: R.check(R.OK, "NTP offset 12 ms"),
  cat: R.check(R.UNKNOWN, "Not probed yet"),
  audio: R.check(R.OK, "USB codec present")
}
assert.equal(R.overall(partial), R.UNKNOWN)
assert.match(R.tooltip(oneFailure), /Station: Not ready/)
assert.match(R.tooltip(oneFailure), /CAT control: Fault/)

console.log("readiness tests passed")
