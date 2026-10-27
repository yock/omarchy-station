pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Readiness.js" as Readiness

// Expanded station readiness: one verdict line over a three-column readout.
//
// The readouts are not all numbers. Time leads with its source (GPS/NTP)
// because a clock's variance is not a readiness signal; CAT leads with the
// frequency; audio leads with the sample rate. Each check's state is the
// coloured rule under its column, so there is no second state marker.
Panel {
  id: root
  moduleName: "myockey.station"
  ipcTarget: "myockey.station"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var readiness: Readiness.emptySnapshot()

  readonly property var barIdentity: hostWidget || root
  readonly property string overallState: Readiness.overall(readiness)
  readonly property var rows: Readiness.rows(readiness)
  readonly property var counts: Readiness.counts(readiness)
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Util.alpha(foreground, 0.64)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // Probe wiring lands here. Until then this is a no-op, so the bar's middle
  // click is harmless while the skeleton is being built.
  function refresh() {}

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(520))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()

      Column {
        id: content
        width: parent.width
        spacing: Style.space(10)

        // ---- Verdict -------------------------------------------------
        RowLayout {
          width: parent.width
          spacing: Style.space(8)

          Column {
            spacing: Style.space(1)

            Text {
              text: Readiness.verdict(root.overallState)
              textFormat: Text.PlainText
              color: Readiness.color(root.overallState)
              font.family: root.fontFamily
              font.pixelSize: Style.font.display
              font.bold: true
            }

            Text {
              text: Readiness.verdictDetail(root.overallState, root.counts)
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }

          Item { Layout.fillWidth: true }

          Text {
            text: "STATION"
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.letterSpacing: 1.4
            font.bold: true
          }
        }

        Rectangle {
          width: parent.width
          height: 1
          color: Util.alpha(root.foreground, 0.14)
        }

        // ---- Readout grid --------------------------------------------
        RowLayout {
          width: parent.width
          spacing: 0

          Repeater {
            model: root.rows

            delegate: ColumnLayout {
              id: column
              required property var modelData

              Layout.fillWidth: true
              Layout.fillHeight: true
              spacing: Style.space(2)

              Text {
                Layout.fillWidth: true
                text: column.modelData.label.toUpperCase()
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.letterSpacing: 1
                font.bold: true
              }

              Text {
                Layout.fillWidth: true
                text: column.modelData.readout
                textFormat: Text.PlainText
                color: column.modelData.state === Readiness.UNKNOWN ? root.dim : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.heading
                font.bold: true
                elide: Text.ElideRight
              }

              Text {
                Layout.fillWidth: true
                text: column.modelData.detail
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }

              Text {
                Layout.fillWidth: true
                text: column.modelData.meta
                textFormat: Text.PlainText
                visible: text !== ""
                color: Util.alpha(root.foreground, 0.44)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }

              Item { Layout.fillHeight: true; implicitHeight: Style.space(2) }

              Rectangle {
                Layout.fillWidth: true
                implicitHeight: Math.max(2, Style.space(2))
                color: Readiness.color(column.modelData.state)
              }
            }
          }
        }

        // ---- Footer --------------------------------------------------
        Rectangle {
          width: parent.width
          height: 1
          color: Util.alpha(root.foreground, 0.14)
        }

        Text {
          width: parent.width
          text: "Bar dot: grey unknown · green ready · amber check · red fault"
          textFormat: Text.PlainText
          color: Util.alpha(root.foreground, 0.44)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
