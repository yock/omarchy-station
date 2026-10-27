pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import qs.Commons
import "Model.js" as Model

// PROTOTYPE B — instrument panel.
// The panel answers "what is the station doing right now?". One verdict line
// over a three-column readout grid; the state of each check is a coloured edge.
// The readouts are not all numbers: time leads with its source (GPS/NTP),
// because the clock's variance is not a readiness signal.
Item {
  id: root

  property var snapshot: Model.snapshot("red")
  property color foreground: Color.foreground
  property color dim: Util.alpha(foreground, 0.62)
  property string fontFamily: Style.font.family
  property string variantKey: "B"
  property string sampleName: "red"

  readonly property var rows: Model.inFlow(snapshot)
  readonly property string overallState: Model.overall(snapshot)
  readonly property var counts: Model.counts(snapshot)

  implicitHeight: content.implicitHeight
  width: parent ? parent.width : 0

  Column {
    id: content
    width: parent.width
    spacing: Style.space(10)

    // ---- Verdict -----------------------------------------------------
    RowLayout {
      width: parent.width
      spacing: Style.space(8)

      Column {
        spacing: Style.space(1)

        Text {
          text: Model.verdict(root.overallState)
          textFormat: Text.PlainText
          color: Model.color(root.overallState)
          font.family: root.fontFamily
          font.pixelSize: Style.font.display
          font.bold: true
        }

        Text {
          text: Model.verdictDetail(root.overallState, root.counts)
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

    // ---- Readout grid -------------------------------------------------
    RowLayout {
      width: parent.width
      spacing: 0

      Repeater {
        model: root.rows

        delegate: ColumnLayout {
          id: column
          required property var modelData
          required property int index

          Layout.fillWidth: true
          Layout.fillHeight: true
          spacing: Style.space(2)

          Text {
            Layout.fillWidth: true
            text: column.modelData.title.toUpperCase()
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
            color: column.modelData.state === "unknown" ? root.dim : root.foreground
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
            color: Model.color(column.modelData.state)
          }
        }
      }
    }

    // ---- Prototype marker --------------------------------------------
    RowLayout {
      width: parent.width

      Text {
        text: "PROTOTYPE B · instrument panel · " + root.sampleName
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
