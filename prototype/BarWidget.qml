import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// PROTOTYPE bar entry. Deliberately the same glyph and dot as the real
// skeleton so the panel is the only moving part.
//
// Left click: open/close the panel. Middle click: next variant.
// Right click: next sample state.
BarWidget {
  id: root
  moduleName: "myockey.station-prototype"

  property string variant: "A"
  property string sampleName: "red"

  readonly property var snapshot: Model.snapshot(sampleName)
  readonly property string overallState: Model.overall(snapshot)
  readonly property color overallColor: Model.color(overallState)

  readonly property string glyph: "\uf2db"

  function cycleVariant() {
    variant = Model.cycle(["A", "B", "C"], variant)
  }

  function cycleSample() {
    sampleName = Model.cycle(["grey", "green", "gps", "gps-ready", "gps-no-pps", "no-fix", "gpsd-down", "no-device", "red"], sampleName)
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
    if ("variant" in target) target.variant = root.variant
    if ("sampleName" in target) target.sampleName = root.sampleName
  }

  function refresh() {
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
  }

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
  onVariantChanged: injectPanel()
  onSampleNameChanged: injectPanel()

  Component.onCompleted: {
    root.variant = String(root.setting("variant", "A")).toUpperCase()
    root.sampleName = String(root.setting("sample", "red")).toLowerCase()
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("PrototypePanel.qml")
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
    text: root.glyph
    slotSize: Style.bar.statusSlot
    tooltipText: Model.tooltip(root.snapshot)
    onPressed: function(b) {
      if (b === Qt.MiddleButton) root.cycleVariant()
      else if (b === Qt.RightButton) root.cycleSample()
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
    target: "myockey.station-prototype"

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function refresh(): void { root.refresh() }
    function variant(name: string): void { root.variant = String(name).toUpperCase() }
    function sample(name: string): void { root.sampleName = String(name).toLowerCase() }
    function nextVariant(): void { root.cycleVariant() }
    function nextSample(): void { root.cycleSample() }
    function status(): string {
      return JSON.stringify({
        variant: root.variant,
        sample: root.sampleName,
        overall: root.overallState
      })
    }
  }
}
