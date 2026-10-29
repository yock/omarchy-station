import QtQuick
import Quickshell.Io
import "Readiness.js" as Readiness

// CAT probe: link health for an existing rigctld from the hamlib package. ADR
// 0003 — the widget never starts rigctld and never opens the serial device. It
// finds the daemon, notes the device it was told to use, then asks it over TCP
// for frequency and mode and reads PTT state when the rig reports it.
//
// The device facts only explain a link that failed: rigctld may run as another
// user, so its own open handle outranks this shell's permission check. Nothing
// here keys the rig, and no meter reading is ever requested.
ProbedCheck {
  id: root

  // The rigctld this poll found, and the endpoint the client should use.
  property string devicePath: ""
  property string devicePid: ""
  property string endpoint: Readiness.CAT_ENDPOINT

  // `catFacts()` is the exact shape catCheck reads; hand it over whole so a
  // new fact cannot be collected and then forgotten in this field list.
  readonly property var check: root.probed
    ? Readiness.catCheck(root.facts)
    : Readiness.notProbed()

  function blankFacts() { return Readiness.catFacts() }

  function startPoll() {
    root.devicePath = ""
    root.devicePid = ""
    root.endpoint = Readiness.CAT_ENDPOINT
    pgrepProc.running = true
  }

  function applyRigctld(value) {
    var found = Readiness.rigctldFacts(value)
    if (found.pid === 0) return false
    root.pending.rigctld = true
    root.devicePath = found.device
    root.devicePid = String(found.pid)
    root.endpoint = "127.0.0.1:" + found.port
    root.pending.endpoint = root.endpoint
    return true
  }

  function applyDevice(value) {
    // An empty report means the probe could not answer; claiming the device
    // is missing would be worse than saying nothing about it.
    if (String(value).trim() === "") return
    root.pending.device = Readiness.catDeviceFacts(value, root.devicePath)
  }

  // Every rigctl call goes through this shape so a missing client, a refused
  // connection and a slow rig all end in a bounded answer instead of a stall.
  function rigCommand(name) {
    return ["sh", "-c", "timeout 5 rigctl -m 2 -r \"$1\" " + name, "rigctl", root.endpoint]
  }

  // Cached because the collector's streamFinished and the process exit are
  // separate events: whichever lands second still finds the whole answer.
  property string pgrepText: ""
  property string deviceText: ""
  property string freqText: ""
  property string freqErrorText: ""
  property string modeText: ""
  property string pttText: ""

  Process {
    id: pgrepProc
    command: ["sh", "-c", "exec pgrep -a -x rigctld"]
    stdout: StdioCollector {
      id: pgrepOut
      waitForEnd: true
      onStreamFinished: root.pgrepText = text
    }
    stderr: StdioCollector { id: pgrepErr; waitForEnd: true }
    onExited: function(exitCode) {
      if (exitCode !== 0 || !root.applyRigctld(pgrepOut.text || root.pgrepText)) {
        // Nothing is running. pgrep cannot say whether rigctld was never
        // installed, so ask the shell before blaming the daemon.
        installedProc.running = true
        return
      }
      if (root.devicePath !== "") deviceProc.running = true
      else freqProc.running = true
    }
  }

  // pgrep exits 1 both for a daemon that is stopped and for one that was never
  // installed. command -v tells them apart, so a missing hamlib package is
  // named instead of sending the operator after a daemon that is not there.
  Process {
    id: installedProc
    command: ["sh", "-c", "command -v rigctld >/dev/null 2>&1"]
    onExited: function(exitCode) {
      root.pending.installed = exitCode === 0
      root.finish()
    }
  }

  // Presence, this user's access, whether rigctld holds the file, and whether
  // anything else does. Reading permission bits never opens the device.
  readonly property string deviceScript: [
    "device=$1",
    "pid=$2",
    "if [ ! -e \"$device\" ]; then echo \"present=0\"; exit 0; fi",
    "echo \"present=1\"",
    "if [ -r \"$device\" ] && [ -w \"$device\" ]; then echo \"access=1\"; else echo \"access=0\"; fi",
    "held=0",
    "for fd in /proc/$pid/fd/*; do",
    "  [ \"$(readlink \"$fd\" 2>/dev/null)\" = \"$device\" ] && held=1 && break",
    "done",
    "echo \"holds=$held\"",
    "others=\"\"",
    "for holder in $(fuser \"$device\" 2>/dev/null); do",
    "  [ \"$holder\" = \"$pid\" ] || others=\"$others $holder\"",
    "done",
    "echo \"others=$others\""
  ].join("\n")

  Process {
    id: deviceProc
    command: ["sh", "-c", root.deviceScript, "rigctld-device", root.devicePath, root.devicePid]
    stdout: StdioCollector {
      id: deviceOut
      waitForEnd: true
      onStreamFinished: root.deviceText = text
    }
    stderr: StdioCollector { id: deviceErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.applyDevice(deviceOut.text || root.deviceText)
      freqProc.running = true
    }
  }

  Process {
    id: freqProc
    command: root.rigCommand("f")
    stdout: StdioCollector {
      id: freqOut
      waitForEnd: true
      onStreamFinished: root.freqText = text
    }
    stderr: StdioCollector {
      id: freqErr
      waitForEnd: true
      onStreamFinished: root.freqErrorText = text
    }
    // 127 is the shell saying rigctl is not installed: the link cannot be
    // asked at all, which is unknown rather than broken.
    onExited: function(exitCode) {
      if (exitCode === 127) {
        root.pending.queryable = false
        root.finish()
        return
      }
      var hz = Readiness.rigFrequency(freqOut.text || root.freqText)
      root.pending.reply.freq = hz
      if (hz <= 0) {
        root.pending.reply.error = Readiness.rigError(
          String(freqOut.text || root.freqText) + "\n" + String(freqErr.text || root.freqErrorText))
        root.finish()
        return
      }
      modeProc.running = true
    }
  }

  Process {
    id: modeProc
    command: root.rigCommand("m")
    stdout: StdioCollector {
      id: modeOut
      waitForEnd: true
      onStreamFinished: root.modeText = text
    }
    stderr: StdioCollector { id: modeErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.pending.reply.mode = Readiness.rigMode(modeOut.text || root.modeText)
      pttProc.running = true
    }
  }

  // Read-only. A rig that cannot report PTT is not a problem; the check
  // already has what it needs.
  Process {
    id: pttProc
    command: root.rigCommand("t")
    stdout: StdioCollector {
      id: pttOut
      waitForEnd: true
      onStreamFinished: root.pttText = text
    }
    stderr: StdioCollector { id: pttErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.pending.reply.ptt = Readiness.rigPtt(pttOut.text || root.pttText)
      root.finish()
    }
  }
}
