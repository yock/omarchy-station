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

  // Time, CAT and the TNC transport are polled on one interval; radio audio
  // and Bluetooth state are event-driven, so the timer says the same thing to
  // the probes that need it.
  readonly property int pollIntervalSec: Math.max(1, Number(root.setting("refreshIntervalSec", 5)) || 5)

  // The declaration is a setting, never an inference from attached hardware.
  readonly property string stationPathsSetting: String(
    root.setting(Readiness.stationPathSettingKey(), Readiness.STATION_PATH_DEFAULT))

  // A check no declared path needs is na in the snapshot: present in the fixed
  // shape, skipped by aggregation and absent from the panel.
  readonly property var readiness: {
    var snapshot = Readiness.emptySnapshot()
    snapshot.time = timeProbe.check
    snapshot.cat = Readiness.declares(root.stationPathsSetting, Readiness.PATH_HOST)
      ? catProbe.check : Readiness.notApplicable()
    snapshot.audio = Readiness.declares(root.stationPathsSetting, Readiness.PATH_HOST)
      ? audioProbe.check : Readiness.notApplicable()
    snapshot.tnc = Readiness.declares(root.stationPathsSetting, Readiness.PATH_TNC)
      ? tncProbe.check : Readiness.notApplicable()
    return snapshot
  }

  readonly property var audioCandidates: audioProbe.candidates
  readonly property var tncCandidates: tncProbe.candidates
  // Evidence of an undeclared path is text, never a state.
  readonly property string tncHint: Readiness.declares(root.stationPathsSetting, Readiness.PATH_TNC)
    ? "" : tncProbe.hint

  readonly property string overallState: Readiness.overall(readiness)
  readonly property color overallColor: Readiness.color(overallState)

  // Every setting lives in this widget's bar entry. Rebuild the whole entry:
  // updateEntryInline replaces it, and an omitted key would be a deletion.
  function assignSetting(key, value) {
    var modeChanged = key === Readiness.gpsModeSettingKey()
      && Readiness.gpsModeOf(value) !== Readiness.gpsModeOf(root.setting(key, "Off"))
    var transportChanged = key === Readiness.tncSettingKey()
      && !Readiness.sameTncTransport(value, root.setting(key, ""))

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

    // The facts collected for one transport do not answer the next one: drop
    // the old answer, then scan rather than wait out refreshIntervalSec.
    if (transportChanged) {
      tncProbe.invalidate()
      tncProbe.refresh()
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

  TncProbe {
    id: tncProbe
    transport: String(root.setting(Readiness.tncSettingKey(), ""))
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
    if ("tncCandidates" in target) target.tncCandidates = root.tncCandidates
    if ("tncHint" in target) target.tncHint = root.tncHint
  }

  function refresh() {
    timeProbe.refresh()
    catProbe.refresh()
    tncProbe.refresh()
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
  // Device enumeration can change the picker's rows without changing the check.
  onAudioCandidatesChanged: injectPanel()
  onTncCandidatesChanged: injectPanel()
  onTncHintChanged: injectPanel()

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
    tooltipText: Readiness.tooltip(root.readiness, root.stationPathsSetting, root.tncHint)
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
