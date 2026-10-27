pragma ComponentBehavior: Bound

import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// PROTOTYPE host. Swaps one of three panel layouts over the same snapshot.
// The bar glyph and dot are the real skeleton's; only the expanded panel is
// under test here.
Panel {
  id: root
  moduleName: "myockey.station-prototype"
  ipcTarget: "myockey.station-prototype"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property string variant: "A"
  property string sampleName: "red"

  readonly property var barIdentity: hostWidget || root
  readonly property var snapshot: Model.snapshot(sampleName)
  readonly property string overallState: Model.overall(snapshot)

  function cycleSample() {
    sampleName = Model.cycle(["grey", "green", "gps", "gps-ready", "gps-no-pps", "no-fix", "gpsd-down", "no-device", "red"], sampleName)
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(root.variant === "B" ? 520 : 420))
    contentHeight: panel.fittedContentHeight(loader.item ? loader.item.implicitHeight : Style.space(80))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTextKey: function(t) {
        if (t === "1") root.variant = "A"
        else if (t === "2") root.variant = "B"
        else if (t === "3") root.variant = "C"
        else if (t === "s" || t === "S") root.cycleSample()
      }

      Loader {
        id: loader
        width: parent.width
        sourceComponent: root.variant === "B" ? variantB : (root.variant === "C" ? variantC : variantA)
      }
    }
  }

  Component {
    id: variantA
    VariantA {
      snapshot: root.snapshot
      foreground: root.barForeground
      dim: Util.alpha(root.barForeground, 0.62)
      fontFamily: root.bar ? root.bar.fontFamily : Style.font.family
      sampleName: root.sampleName
    }
  }

  Component {
    id: variantB
    VariantB {
      snapshot: root.snapshot
      foreground: root.barForeground
      dim: Util.alpha(root.barForeground, 0.62)
      fontFamily: root.bar ? root.bar.fontFamily : Style.font.family
      sampleName: root.sampleName
    }
  }

  Component {
    id: variantC
    VariantC {
      snapshot: root.snapshot
      foreground: root.barForeground
      dim: Util.alpha(root.barForeground, 0.62)
      fontFamily: root.bar ? root.bar.fontFamily : Style.font.family
      sampleName: root.sampleName
    }
  }
}
