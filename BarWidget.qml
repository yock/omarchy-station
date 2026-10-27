import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Readiness.js" as Readiness

// Station readiness in the bar: one station glyph plus a small status dot.
// The dot is always present; grey means "not probed yet", green means all
// checks are ready, amber means attention, red means the station is not ready.
//
// The probe layer replaces `readiness` as a whole. Keeping one snapshot object
// means the bar, tooltip and panel cannot disagree mid-update.
BarWidget {
  id: root
  moduleName: "myockey.station"

  // Time and CAT are polled on one interval; radio audio is event-driven, so
  // the timer says the same thing to both probes that need it.
  readonly property int pollIntervalSec: Math.max(1, Number(root.setting("refreshIntervalSec", 5)) || 5)

  readonly property var readiness: {
    var snapshot = Readiness.emptySnapshot()
    snapshot.time = timeProbe.check
    snapshot.cat = catProbe.check
    snapshot.audio = audioProbe.check
    return snapshot
  }

  readonly property var audioCandidates: audioProbe.candidates

  readonly property string overallState: Readiness.overall(readiness)
  readonly property color overallColor: Readiness.color(overallState)

  // Every setting lives in this widget's bar entry. Rebuild the whole entry:
  // updateEntryInline replaces it, and an omitted key would be a deletion.
  function assignSetting(key, value) {
    var modeChanged = key === Readiness.gpsModeSettingKey()
      && Readiness.gpsModeOf(value) !== Readiness.gpsModeOf(root.setting(key, "Off"))

    var entry = { id: root.moduleName }
    for (var existing in root.settings) if (existing !== "id") entry[existing] = root.settings[existing]
    entry[key] = value

    // Applied locally first so the check changes on the click itself. Without
    // a writable bar entry the choice lives only for this session.
    root.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)

    // The facts collected under one GPS mode are not the facts the next mode
    // asks for: forget the old answer, then poll rather than wait out
    // refreshIntervalSec. A poll already in flight is replayed, not committed.
    if (modeChanged) {
      timeProbe.invalidate()
      timeProbe.refresh()
    }
  }

  // Node assignments are settings too; the single writer keeps the
  // entry-rebuild rule in one place.
  function assignAudio(role, name) {
    root.assignSetting(Readiness.audioSettingKey(role), String(name || ""))
  }

  AudioProbe {
    id: audioProbe
    rxName: root.setting("radioRxNode", "")
    txName: root.setting("radioTxNode", "")
  }

  TimeProbe {
    id: timeProbe
    gpsMode: String(root.setting("gpsMode", "Off"))
  }

  CatProbe {
    id: catProbe
  }

  // The glyph is drawn (StationGlyph.qml), not set in an icon font. 18px is
  // the optical canvas it was tuned on: big enough for the arcs to separate
  // from the ball, still inside the bar's 21px status slot.
  readonly property int glyphSize: 18

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
    if ("readiness" in target) target.readiness = root.readiness
    if ("audioCandidates" in target) target.audioCandidates = root.audioCandidates
  }

  function refresh() {
    timeProbe.refresh()
    catProbe.refresh()
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
  }

  // The bar is the only place the poll lives: the panel renders the snapshot
  // it is handed, and a poll that ran per surface would disagree across
  // monitors.
  Timer {
    interval: root.pollIntervalSec * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Shape contract for shell.summon/hide/toggle routing. The bar tracks the
  // widget mounted in its slot, so these live here and forward to the panel.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onReadinessChanged: injectPanel()
  // Node enumeration can change the picker's rows without changing the check.
  onAudioCandidatesChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    slotSize: Style.bar.statusSlot
    opticalSize: root.glyphSize
    iconComponent: Component {
      StationGlyph {
        anchors.centerIn: parent
        size: root.glyphSize
        color: button.foreground
      }
    }
    tooltipText: Readiness.tooltip(root.readiness)
    onPressed: function(b) {
      if (b === Qt.MiddleButton) root.refresh()
      else root.togglePanel()
    }
  }

  Rectangle {
    id: statusDot
    width: Math.max(6, Style.space(6))
    height: width
    radius: width / 2
    color: root.overallColor
    border.width: 1
    border.color: root.bar ? root.bar.background : Color.background
    anchors.right: button.right
    anchors.top: button.top
    anchors.rightMargin: Style.space(1)
    anchors.topMargin: Style.space(1)
  }

  IpcHandler {
    target: "myockey.station"

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function refresh(): void { root.broadcast("refresh") }
    function status(): string { return JSON.stringify(root.readiness) }
  }
}
