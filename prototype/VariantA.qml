pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import qs.Commons
import "Model.js" as Model

// PROTOTYPE A — triage list.
// The panel answers "which check is blocking me?". One flat list, sorted
// worst-first, no cards; the overall verdict is a thin header strip.
Item {
  id: root

  property var snapshot: Model.snapshot("red")
  property color foreground: Color.foreground
  property color dim: Util.alpha(foreground, 0.62)
  property string fontFamily: Style.font.family
  property string variantKey: "A"
  property string sampleName: "red"

  readonly property var rows: Model.worstFirst(snapshot)
  readonly property string overallState: Model.overall(snapshot)
  readonly property var counts: Model.counts(snapshot)

  implicitHeight: content.implicitHeight
  width: parent ? parent.width : 0

  Column {
    id: content
    width: parent.width
    spacing: Style.space(6)

    // ---- Header strip ------------------------------------------------
    RowLayout {
      width: parent.width
      spacing: Style.space(8)

      Rectangle {
        implicitWidth: Math.max(7, Style.space(7))
        implicitHeight: width
        radius: width / 2
        color: Model.color(root.overallState)
      }

      Text {
        text: "STATION"
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.letterSpacing: 1.4
        font.bold: true
      }

      Item { Layout.fillWidth: true }

      Text {
        text: Model.label(root.overallState)
        textFormat: Text.PlainText
        color: Model.color(root.overallState)
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
      }
    }

    Text {
      width: parent.width
      text: root.counts.ready + " of 3 ready"
        + (root.counts.attention > 0 ? " · " + root.counts.attention + " to check" : "")
        + (root.counts.blocked > 0 ? " · " + root.counts.blocked + " failed" : "")
      textFormat: Text.PlainText
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    Rectangle {
      width: parent.width
      height: 1
      color: Util.alpha(root.foreground, 0.14)
    }

    // ---- Ranked rows -------------------------------------------------
    Column {
      width: parent.width
      spacing: 0

      Repeater {
        model: root.rows

        delegate: Item {
          id: row
          required property var modelData

          width: parent.width
          height: rowColumn.implicitHeight + Style.space(16)

          Column {
            id: rowColumn
            y: Style.space(8)
            width: parent.width
            spacing: Style.space(2)

            RowLayout {
              width: parent.width
              spacing: Style.space(8)

              Rectangle {
                implicitWidth: Math.max(6, Style.space(6))
                implicitHeight: width
                radius: width / 2
                color: Model.color(row.modelData.state)
              }

              Text {
                text: row.modelData.title
                textFormat: Text.PlainText
                color: row.modelData.state === "unknown" ? root.dim : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
              }

              Item { Layout.fillWidth: true }

              Text {
                text: Model.shortLabel(row.modelData.state)
                textFormat: Text.PlainText
                color: Model.color(row.modelData.state)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }
            }

            Text {
              x: Style.space(14)
              width: parent.width - x
              text: row.modelData.state === "unknown"
                ? row.modelData.detail
                : row.modelData.readout + "   " + row.modelData.detail
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }

          Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: 1
            color: Util.alpha(root.foreground, 0.08)
          }
        }
      }
    }

    // ---- Prototype marker --------------------------------------------
    Item { width: 1; height: Style.space(2) }

    RowLayout {
      width: parent.width

      Text {
        text: "PROTOTYPE A · triage list · " + root.sampleName
        textFormat: Text.PlainText
        color: Util.alpha(root.foreground, 0.38)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }

      Item { Layout.fillWidth: true }

      Text {
        text: "1 2 3 · s"
        textFormat: Text.PlainText
        color: Util.alpha(root.foreground, 0.38)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
  }
}
