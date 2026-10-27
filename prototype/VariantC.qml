pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import qs.Commons
import "Model.js" as Model

// PROTOTYPE C — guided flow.
// The panel answers "what do I do next?". Checks stay in operating order, each
// one explains itself in a sentence, and only the worst check carries a next
// action. Closest to an onboarding surface for the grey state.
Item {
  id: root

  property var snapshot: Model.snapshot("red")
  property color foreground: Color.foreground
  property color dim: Util.alpha(foreground, 0.62)
  property string fontFamily: Style.font.family
  property string variantKey: "C"
  property string sampleName: "red"

  property bool checking: false

  readonly property var rows: Model.inFlow(snapshot)
  readonly property var blocking: Model.blockingCheck(snapshot)
  readonly property string overallState: Model.overall(snapshot)
  readonly property var counts: Model.counts(snapshot)

  implicitHeight: content.implicitHeight
  width: parent ? parent.width : 0

  Timer {
    id: recheckTimer
    interval: 900
    onTriggered: root.checking = false
  }

  Column {
    id: content
    width: parent.width
    spacing: Style.space(9)

    // ---- Headline -----------------------------------------------------
    Column {
      width: parent.width
      spacing: Style.space(2)

      RowLayout {
        width: parent.width
        spacing: Style.space(7)

        Rectangle {
          implicitWidth: Math.max(7, Style.space(7))
          implicitHeight: width
          radius: width / 2
          color: Model.color(root.overallState)
        }

        Text {
          text: "STATION READINESS"
          textFormat: Text.PlainText
          color: root.dim
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
          font.pixelSize: Style.font.caption
          font.bold: true
        }
      }

      Text {
        width: parent.width
        text: Model.headline(root.overallState)
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.title
        font.bold: true
        wrapMode: Text.WordWrap
      }

      Text {
        width: parent.width
        text: Model.verdictDetail(root.overallState, root.counts)
        textFormat: Text.PlainText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.WordWrap
      }
    }

    Rectangle {
      width: parent.width
      height: 1
      color: Util.alpha(root.foreground, 0.14)
    }

    // ---- Steps ---------------------------------------------------------
    Column {
      width: parent.width
      spacing: Style.space(9)

      Repeater {
        model: root.rows

        delegate: Item {
          id: step
          required property var modelData
          required property int index

          readonly property bool hasAction: root.blocking !== null
            && root.blocking.key === modelData.key
            && modelData.next !== ""

          width: parent.width
          height: stepColumn.implicitHeight

          Rectangle {
            width: Math.max(2, Style.space(2))
            height: parent.height
            radius: width / 2
            color: step.modelData.state === "unknown"
              ? Util.alpha(root.foreground, 0.18)
              : Model.color(step.modelData.state)
          }

          Column {
            id: stepColumn
            x: Style.space(11)
            width: parent.width - x
            spacing: Style.space(2)

            RowLayout {
              width: parent.width
              spacing: Style.space(7)

              Text {
                text: "0" + (step.index + 1)
                textFormat: Text.PlainText
                color: Util.alpha(root.foreground, 0.44)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }

              Text {
                text: step.modelData.title
                textFormat: Text.PlainText
                color: step.modelData.state === "unknown" ? root.dim : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                font.bold: true
              }

              Item { Layout.fillWidth: true }

              Text {
                text: Model.shortLabel(step.modelData.state)
                textFormat: Text.PlainText
                color: Model.color(step.modelData.state)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }
            }

            Text {
              width: parent.width
              text: step.modelData.sentence
              textFormat: Text.PlainText
              color: step.modelData.state === "ok" ? root.dim : root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }

            Text {
              width: parent.width
              visible: step.hasAction
              text: "Next: " + step.modelData.next
              textFormat: Text.PlainText
              color: Model.color(step.modelData.state)
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              wrapMode: Text.WordWrap
            }
          }
        }
      }
    }

    Rectangle {
      width: parent.width
      height: 1
      color: Util.alpha(root.foreground, 0.14)
    }

    // ---- Single action --------------------------------------------------
    Rectangle {
      id: recheck
      width: parent.width
      height: Math.max(Style.space(30), recheckLabel.implicitHeight + Style.space(12))
      radius: Style.cornerRadius
      color: recheckArea.containsMouse
        ? Util.alpha(root.foreground, 0.16)
        : Util.alpha(root.foreground, 0.09)
      border.width: 1
      border.color: Util.alpha(root.foreground, 0.22)

      Text {
        id: recheckLabel
        anchors.centerIn: parent
        text: root.checking ? "Re-checking…"
          : (root.overallState === "unknown" ? "Set up probes" : "Re-check now")
        textFormat: Text.PlainText
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
      }

      MouseArea {
        id: recheckArea
        anchors.fill: parent
        hoverEnabled: true
        onClicked: {
          if (root.checking) return
          // Nothing is wired in the grey state, so the button has nothing to
          // run; it would open the probe setup in the real widget.
          if (root.overallState === "unknown") return
          root.checking = true
          recheckTimer.restart()
        }
      }
    }

    // ---- Prototype marker ----------------------------------------------
    RowLayout {
      width: parent.width

      Text {
        text: "PROTOTYPE C · guided flow · " + root.sampleName
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
