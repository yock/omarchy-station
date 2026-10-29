import QtQuick
import Quickshell.Io
import Quickshell.Bluetooth
import "Readiness.js" as Readiness

// TNC probe: the declared transport's shape and the facts around it. ADR 0005
// — readiness is transport holdership, never a KISS dialogue.
//
// Serial: filesystem tests answer existence, character-device-ness and our
// read permission. A scan of /proc names the process holding the port; a held
// port is never opened. A free port is opened read-only and closed again, and
// nothing is ever written to it.
//
// Bluetooth: graded at paired and connected, because Quickshell's service
// exposes adapter and device state without GATT, and SPP needs an rfcomm
// binding the widget must not install.
//
// The same poll also scans serial devices and paired Bluetooth devices for the
// picker and for the one-line hint an undeclared TNC path earns. Candidate
// names suggest rather than identify, so the ranking never claims a modem.
ProbedCheck {
  id: root

  // The tncTransport setting: an absolute device path or a Bluetooth address.
  property string transport: ""

  readonly property string kind: Readiness.tncTransportKind(root.transport)

  // The scan's last raw output. Candidates update as soon as the scan answers;
  // the check waits for finish() so it commits one whole answer.
  property string reportText: ""

  readonly property var bluetoothDevices: Bluetooth.devices ? Bluetooth.devices.values : []

  readonly property var assignedBluetooth: {
    var wanted = String(root.transport || "").trim().toLowerCase()
    if (wanted === "" || root.kind !== "bluetooth") return null
    var devices = root.bluetoothDevices
    for (var i = 0; i < devices.length; i++) {
      var device = devices[i]
      if (device && String(device.address || "").toLowerCase() === wanted) return device
    }
    return null
  }

  readonly property var bluetoothFacts: {
    var device = root.assignedBluetooth
    if (!device) {
      return {
        missing: true,
        paired: false,
        connected: false,
        name: "",
        address: String(root.transport || "")
      }
    }
    return {
      missing: false,
      paired: device.paired === true || device.bonded === true,
      connected: device.connected === true,
      name: String(device.deviceName || device.name || ""),
      address: String(device.address || root.transport)
    }
  }

  readonly property var check: root.probed
    ? Readiness.tncCheck({
        assigned: root.transport,
        serial: root.facts.serial,
        bluetooth: root.bluetoothFacts
      })
    : Readiness.notProbed()

  readonly property var candidates: Readiness.tncCandidates(
    root.reportText,
    root.bluetoothDevices
  )

  readonly property string hint: Readiness.tncHint(root.candidates)

  function blankFacts() { return Readiness.tncFacts() }

  // The old report stays until the scan replaces it: an open picker must not
  // empty and reset its cursor every refreshIntervalSec.
  function startPoll() {
    serialProc.running = true
  }

  function applyReport(value) {
    root.reportText = value
    root.pending.serial = Readiness.tncSerialFacts(value, root.transport)
  }

  // Serial candidates come from the glob, with the udev model string as the
  // ranking's only evidence. Legacy ttyS ports are listed only when the kernel
  // reports a real UART behind them; otherwise the picker would show 32 dead
  // rows on every desktop.
  readonly property string serialScript: [
    "path=$1",
    "target=$(readlink -f \"$path\" 2>/dev/null)",
    "[ -n \"$target\" ] || target=$path",
    "for dev in /dev/ttyACM* /dev/ttyUSB*; do",
    "  [ -e \"$dev\" ] || continue",
    "  model=$(udevadm info -q property -n \"$dev\" 2>/dev/null | sed -n 's/^ID_MODEL=//p' | head -n 1)",
    "  printf 'serial|%s|%s\\n' \"$dev\" \"$model\"",
    "done",
    "for dev in /dev/ttyS*; do",
    "  [ -e \"$dev\" ] || continue",
    "  name=${dev##*/}",
    "  type=$(cat \"/sys/class/tty/$name/type\" 2>/dev/null)",
    "  [ -n \"$type\" ] && [ \"$type\" != \"0\" ] || continue",
    "  model=$(udevadm info -q property -n \"$dev\" 2>/dev/null | sed -n 's/^ID_MODEL=//p' | head -n 1)",
    "  printf 'serial|%s|%s\\n' \"$dev\" \"$model\"",
    "done",
    "if [ -z \"$path\" ]; then exit 0; fi",
    "if [ ! -e \"$target\" ]; then echo 'present=0'; exit 0; fi",
    "echo 'present=1'",
    "char=0",
    "if [ -c \"$target\" ]; then char=1; echo 'char=1'; else echo 'char=0'; fi",
    "read=0",
    "if [ -r \"$target\" ]; then read=1; echo 'read=1'; else echo 'read=0'; fi",
    "case \"$target\" in /dev/ttyS*) echo 'onboard=1';; *) echo 'onboard=0';; esac",
    "holder=",
    "for fd in /proc/[0-9]*/fd/*; do",
    "  [ \"$(readlink \"$fd\" 2>/dev/null)\" = \"$target\" ] || continue",
    "  pid=${fd#/proc/}",
    "  pid=${pid%%/*}",
    "  [ \"$pid\" = \"$$\" ] && continue",
    "  holder=$pid",
    "  break",
    "done",
    "if [ -n \"$holder\" ]; then",
    "  echo \"holder=$holder\"",
    "  echo \"holder_name=$(ps -p \"$holder\" -o comm= 2>/dev/null)\"",
    "elif [ \"$char\" = 1 ] && [ \"$read\" = 1 ]; then",
    "  if timeout 1 dd if=\"$target\" of=/dev/null bs=1 count=0 iflag=nonblock 2>/dev/null; then",
    "    echo 'opens=1'",
    "  else",
    "    echo 'opens=0'",
    "  fi",
    "fi"
  ].join("\n")

  Process {
    id: serialProc
    command: ["sh", "-c", root.serialScript, "tnc-transport", root.transport]
    stdout: StdioCollector {
      id: serialOut
      waitForEnd: true
      onStreamFinished: root.reportText = text
    }
    stderr: StdioCollector { id: serialErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.applyReport(serialOut.text || root.reportText)
      root.finish()
    }
  }
}
