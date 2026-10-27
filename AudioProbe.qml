import QtQuick
import Quickshell.Services.Pipewire
import "Readiness.js" as Readiness

// Radio audio probe: presence, mute and default-output facts for the two
// assigned nodes. ADR 0002 keeps this narrow on purpose — node suspend,
// sample rate, levels and signal presence are never readiness signals, and
// the check stops at the station rather than inspecting app routing.
//
// Presence is asymmetric on purpose. A node that appears is reported at once,
// so a shell that starts before enumeration never paints red; a node that
// vanishes is held for a moment first, so a codec re-enumerating on plug-in
// does not flash the bar. Mute and default-output changes are read live.
Item {
  id: root

  // PipeWire node.name for each explicit assignment.
  property string rxName: ""
  property string txName: ""

  // Unknown-before-ready: a fresh shell shows grey. Only a ready-to-not-ready
  // transition can fail, so the dot does not flash red at login.
  property bool everReady: false
  property bool rxPresent: false
  property bool txPresent: false

  readonly property var nodes: Pipewire.nodes ? Pipewire.nodes.values : []

  function nodeByName(name) {
    if (!name) return null
    for (var i = 0; i < root.nodes.length; i++) {
      var node = root.nodes[i]
      if (node && String(node.name) === String(name)) return node
    }
    return null
  }

  readonly property var rxNode: nodeByName(root.rxName)
  readonly property var txNode: nodeByName(root.txName)

  // Bind the assigned nodes so mute stays live while they are held outside the
  // node list. `properties` is deliberately never read: it is only valid once
  // node.ready, and reading it while capture streams appear has destabilised
  // Quickshell's PipeWire service (panels/audio/Panel.qml documents this).
  readonly property var trackedNodes: {
    var list = []
    if (root.rxNode) list.push(root.rxNode)
    if (root.txNode) list.push(root.txNode)
    return list
  }

  PwObjectTracker {
    objects: root.trackedNodes
  }

  function nodeLabel(node) {
    if (!node) return ""
    return String(node.nickname || node.description || node.name || "")
  }

  readonly property string rxLabel: nodeLabel(root.rxNode)
  readonly property string txLabel: nodeLabel(root.txNode)

  readonly property bool rxMuted: !!(root.rxNode && root.rxNode.audio) && root.rxNode.audio.muted
  readonly property bool txMuted: !!(root.txNode && root.txNode.audio) && root.txNode.audio.muted

  readonly property bool txIsDefault: {
    var sink = Pipewire.defaultAudioSink
    return !!sink && root.txName !== "" && String(sink.name) === String(root.txName)
  }

  readonly property var candidates: Readiness.audioCandidates(root.nodes)

  function hasRadioCandidate(role) {
    var list = root.candidates[role] || []
    for (var i = 0; i < list.length; i++)
      if (list[i].tier === Readiness.TIER_RADIO) return true
    return false
  }

  readonly property var check: Readiness.audioCheck({
    pipewireReady: Pipewire.ready === true,
    everReady: root.everReady,
    rx: {
      assigned: root.rxName,
      present: root.rxPresent,
      muted: root.rxMuted,
      nickname: root.rxNode ? root.rxNode.nickname : "",
      description: root.rxNode ? root.rxNode.description : "",
      radioCandidate: root.hasRadioCandidate("rx")
    },
    tx: {
      assigned: root.txName,
      present: root.txPresent,
      muted: root.txMuted,
      nickname: root.txNode ? root.txNode.nickname : "",
      description: root.txNode ? root.txNode.description : "",
      radioCandidate: root.hasRadioCandidate("tx"),
      isDefault: root.txIsDefault
    }
  })

  // A vanished node is only believed after the settle; an appearing node is
  // believed at once. That is what keeps a re-enumerating codec from flashing
  // red without delaying the green that says the replug worked.
  function syncPresence() {
    if (root.rxNode) {
      root.rxPresent = true
      rxAbsence.stop()
    } else {
      rxAbsence.restart()
    }
    if (root.txNode) {
      root.txPresent = true
      txAbsence.stop()
    } else {
      txAbsence.restart()
    }
  }

  onRxNodeChanged: syncPresence()
  onTxNodeChanged: syncPresence()

  Component.onCompleted: {
    if (Pipewire.ready) root.everReady = true
    syncPresence()
  }

  Connections {
    target: Pipewire
    function onReadyChanged() {
      if (Pipewire.ready) root.everReady = true
    }
  }

  Timer {
    id: rxAbsence
    interval: 2000
    repeat: false
    onTriggered: root.rxPresent = false
  }

  Timer {
    id: txAbsence
    interval: 2000
    repeat: false
    onTriggered: root.txPresent = false
  }
}
