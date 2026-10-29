import QtQuick
import Quickshell.Io
import "Readiness.js" as Readiness

// Time probe: which source is disciplining the clock, and how far a configured
// GPS source has got. ADR 0001 — the offset is never read, let alone graded.
//
// Chrony answers first because a GPS/PPS refclock lives there; stock Omarchy's
// systemd-timesyncd is the fallback. When GPS is configured, gpsd supplies the
// receiver, fix and satellite facts, and chrony's source list says whether a
// PPS refclock exists and whether it is the selected reference. A missing
// chrony package is a fact of its own, because without it a GPS refclock
// cannot discipline the clock.
//
// Every fact lands in `pending` and is committed in one assignment, so the bar
// never paints an answer assembled from two different polls.
ProbedCheck {
  id: root

  // "Off" | "Optional" | "Required", from this widget's shell.json entry.
  property string gpsMode: "Off"

  // The setting normalised once, so the ladder and the probe agree on it.
  readonly property string gpsSetting: Readiness.gpsModeOf(root.gpsMode)

  readonly property var check: root.probed
    ? Readiness.timeCheck({
        gpsMode: root.gpsSetting,
        // Every top-level fact timeCheck reads must be forwarded here; a fact
        // left out reads as absent and its rung silently disappears.
        daemon: root.facts.daemon,
        synced: root.facts.synced,
        server: root.facts.server,
        chronyInstalled: root.facts.chronyInstalled,
        gps: root.facts.gps
      })
    : Readiness.notProbed()

  function blankFacts() { return Readiness.timeFacts() }

  function startPoll() { chronyProc.running = true }

  // GPS facts only change a committed answer, so a run that is already known
  // to fail (no daemon, clock not synchronised) does not need them.
  function probeGpsIfNeeded() {
    var gpsConfigured = root.gpsSetting !== Readiness.GPS_OFF
    if (root.pending.synced && gpsConfigured) gpsConfigProc.running = true
    else root.finish()
  }

  function applyChrony(value) {
    var parsed = Readiness.chronyTrackingFacts(value)
    root.pending.daemon = "chrony"
    root.pending.synced = parsed.synced
    root.pending.server = parsed.server
  }

  function applyTimesync(value) {
    root.pending.daemon = "timesyncd"
    root.pending.server = Readiness.timesyncStatusFacts(value).server
  }

  function applySources(value) {
    var parsed = Readiness.chronySourcesFacts(value)
    root.pending.gps.pps = parsed.pps
    root.pending.gps.selected = parsed.selected
  }

  function applyGpsConfig(value) {
    root.pending.gps.missing = Readiness.gpsConfigFacts(value).missing
  }

  // 127 is the shell saying gpspipe is not installed: the package is missing,
  // not the daemon. Nothing was observed, so keep the neutral facts.
  function applyGpsReport(value, exitCode) {
    if (exitCode === 127) {
      root.pending.gps.installed = false
      return
    }
    var parsed = Readiness.gpsReportFacts(value)
    root.pending.gps.gpsd = parsed.gpsd
    root.pending.gps.devices = parsed.devices
    root.pending.gps.mode = parsed.mode
    root.pending.gps.satellites = parsed.satellites
  }

  // Cached because the collector's streamFinished and the process exit are
  // separate events: whichever lands second still finds the whole answer.
  property string chronyText: ""
  property string sourcesText: ""
  property string timesyncText: ""
  property string syncText: ""
  property string gpsConfigText: ""
  property string gpsText: ""

  Process {
    id: chronyProc
    command: ["sh", "-c", "exec chronyc -n tracking"]
    stdout: StdioCollector {
      id: chronyOut
      waitForEnd: true
      onStreamFinished: root.chronyText = text
    }
    stderr: StdioCollector { id: chronyErr; waitForEnd: true }
    onExited: function(exitCode) {
      // 127 is the shell saying chronyc is not installed: the package is
      // missing, not the daemon. Recorded because GPS timing cannot be
      // consumed without it; the ladder only reports it when GPS is configured.
      if (exitCode === 127) root.pending.chronyInstalled = false
      if (exitCode !== 0) {
        timesyncProc.running = true
        return
      }
      root.applyChrony(chronyOut.text || root.chronyText)
      // Source and GPS facts only change a committed answer, so a clock that
      // is not being disciplined skips straight to the verdict.
      if (root.pending.synced && root.gpsSetting !== Readiness.GPS_OFF)
        chronySourcesProc.running = true
      else root.probeGpsIfNeeded()
    }
  }

  Process {
    id: chronySourcesProc
    command: ["sh", "-c", "exec chronyc -n sources"]
    stdout: StdioCollector {
      id: sourcesOut
      waitForEnd: true
      onStreamFinished: root.sourcesText = text
    }
    stderr: StdioCollector { id: sourcesErr; waitForEnd: true }
    onExited: function(exitCode) {
      if (exitCode === 0) root.applySources(sourcesOut.text || root.sourcesText)
      root.probeGpsIfNeeded()
    }
  }

  Process {
    id: timesyncProc
    command: ["sh", "-c", "exec timedatectl timesync-status"]
    stdout: StdioCollector {
      id: timesyncOut
      waitForEnd: true
      onStreamFinished: root.timesyncText = text
    }
    stderr: StdioCollector { id: timesyncErr; waitForEnd: true }
    onExited: function(exitCode) {
      // No answer at all means no time daemon is installed or running.
      if (exitCode !== 0) {
        root.finish()
        return
      }
      root.applyTimesync(timesyncOut.text || root.timesyncText)
      ntpSyncProc.running = true
    }
  }

  Process {
    id: ntpSyncProc
    command: ["sh", "-c", "exec timedatectl show -p NTPSynchronized --value"]
    stdout: StdioCollector {
      id: syncOut
      waitForEnd: true
      onStreamFinished: root.syncText = text
    }
    stderr: StdioCollector { id: syncErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.pending.synced = exitCode === 0
        && String(syncOut.text || root.syncText).trim() === "yes"
      root.probeGpsIfNeeded()
    }
  }

  // The receivers gpsd is configured for, so "no device" stays the most
  // specific rung even when gpsd itself is down. USBAUTO setups report
  // nothing here and are answered by gpsd's own list instead.
  readonly property string gpsConfigScript: [
    "set -f",
    ". /etc/default/gpsd 2>/dev/null",
    "for device in $DEVICES; do",
    "  [ -e \"$device\" ] || printf '%s\\n' \"$device\"",
    "done"
  ].join("\n")

  Process {
    id: gpsConfigProc
    command: ["sh", "-c", root.gpsConfigScript]
    stdout: StdioCollector {
      id: gpsConfigOut
      waitForEnd: true
      onStreamFinished: root.gpsConfigText = text
    }
    stderr: StdioCollector { id: gpsConfigErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.applyGpsConfig(gpsConfigOut.text || root.gpsConfigText)
      gpsReportProc.running = true
    }
  }

  Process {
    id: gpsReportProc
    // -n makes gpspipe exit after a handful of messages; the timeout bounds a
    // gpsd that has nothing to say about a silent receiver.
    command: ["sh", "-c", "timeout 2 gpspipe -w -n 8 2>/dev/null"]
    stdout: StdioCollector {
      id: gpsOut
      waitForEnd: true
      onStreamFinished: root.gpsText = text
    }
    stderr: StdioCollector { id: gpsErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.applyGpsReport(gpsOut.text || root.gpsText, exitCode)
      root.finish()
    }
  }
}
