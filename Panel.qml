pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Readiness.js" as Readiness

// Expanded station readiness. The three checks are deliberately peers: none of
// them is "the main one", because CAT without audio, or audio without time, is
// still a station that will not work on a digital mode.
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
  readonly property color overallColor: Readiness.color(overallState)
  readonly property var checks: Readiness.rows(readiness)
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
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: column
          width: scroll.width
          spacing: Style.space(12)

          // ---- Header -------------------------------------------------
          Column {
            width: parent.width
            spacing: Style.space(5)

            Row {
              spacing: Style.space(8)

              Rectangle {
                width: Math.max(8, Style.space(8))
                height: width
                radius: width / 2
                color: root.overallColor
                anchors.verticalCenter: parent.verticalCenter
              }

              Text {
                text: "STATION"
                textFormat: Text.PlainText
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.letterSpacing: 1.4
                font.bold: true
                anchors.verticalCenter: parent.verticalCenter
              }
            }

            Text {
              text: Readiness.label(root.overallState)
              textFormat: Text.PlainText
              color: root.overallColor
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
            }

            Text {
              width: parent.width
              text: "Readiness monitor · probes are not wired yet"
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
            }
          }

          // ---- Checks -------------------------------------------------
          Repeater {
            model: root.checks

            delegate: Rectangle {
              id: checkRow
              required property var modelData

              width: parent.width
              height: rowContent.implicitHeight + Style.space(20)
              radius: Style.space(8)
              color: Util.alpha(root.foreground, 0.045)
              border.width: 1
              border.color: Util.alpha(root.foreground, 0.10)

              RowLayout {
                id: rowContent
                anchors.fill: parent
                anchors.margins: Style.space(10)
                spacing: Style.space(10)

                Rectangle {
                  implicitWidth: Math.max(8, Style.space(8))
                  implicitHeight: width
                  radius: width / 2
                  color: Readiness.color(checkRow.modelData.state)
                  Layout.alignment: Qt.AlignTop
                  Layout.topMargin: Style.space(4)
                }

                ColumnLayout {
                  Layout.fillWidth: true
                  spacing: Style.space(2)

                  Text {
                    text: checkRow.modelData.label
                    textFormat: Text.PlainText
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                  }

                  Text {
                    text: checkRow.modelData.detail
                    textFormat: Text.PlainText
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                  }
                }

                Text {
                  text: Readiness.shortLabel(checkRow.modelData.state)
                  textFormat: Text.PlainText
                  color: Readiness.color(checkRow.modelData.state)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  Layout.alignment: Qt.AlignTop
                }
              }
            }
          }

          // ---- Footer -------------------------------------------------
          Text {
            width: parent.width
            text: "Bar dot: grey unknown · green ready · amber check · red fault"
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
        }
      }
    }
  }
}
