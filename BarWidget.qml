import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Readiness.js" as Readiness

// Station readiness in the bar: one station glyph plus a small status dot.
// The dot is always present; grey means "not probed yet", green means all
// checks are ready, amber means attention, red means the station is not ready.
//
// The probe layer will replace `readiness` as a whole. Keeping one snapshot
// object means the bar, tooltip and panel cannot disagree mid-update.
BarWidget {
  id: root
  moduleName: "myockey.station"

  property var readiness: Readiness.emptySnapshot()

  readonly property string overallState: Readiness.overall(readiness)
  readonly property color overallColor: Readiness.color(overallState)

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
  }

  function refresh() {
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
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
    function refresh(): void { root.refresh() }
    function status(): string { return JSON.stringify(root.readiness) }
  }
}
