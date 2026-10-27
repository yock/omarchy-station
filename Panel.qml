pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Readiness.js" as Readiness

// Expanded station readiness: one verdict line over a three-column readout.
//
// The readouts are not all numbers. Time leads with its source (GPS/NTP)
// because a clock's variance is not a readiness signal; CAT leads with the
// frequency; audio leads with the assigned Radio RX node, so a failure still
// names the node that went missing. Each check's state is the coloured rule
// under its column, so there is no second state marker.
Panel {
  id: root
  moduleName: "myockey.station"
  ipcTarget: "myockey.station"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var readiness: Readiness.emptySnapshot()
  property var audioCandidates: ({ rx: [], tx: [] })

  // The picker edits node assignments; it never opens by itself and it also
  // opens over a green check so either role can be replaced.
  property bool pickerOpen: false
  property int pickerIndex: 0

  readonly property var barIdentity: hostWidget || root
  readonly property string overallState: Readiness.overall(readiness)
  readonly property var rows: Readiness.rows(readiness)
  readonly property var counts: Readiness.counts(readiness)
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Util.alpha(foreground, 0.64)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // The bar widget owns the time and CAT poll; the panel only renders the
  // snapshot it is handed, so there is nothing to start here.
  function refresh() {}

  function assignedNode(role) {
    return String(root.setting(Readiness.audioSettingKey(role), ""))
  }

  // Assignment goes back through the bar widget, which owns the whole
  // shell.json entry: updateEntryInline replaces it, and the entry also holds
  // refreshIntervalSec and the other role.
  function assignAudio(role, name) {
    if (root.hostWidget && typeof root.hostWidget.assignAudio === "function")
      root.hostWidget.assignAudio(role, name)
  }

  function assignmentRow(candidate, role) {
    return {
      kind: "assign",
      selectable: true,
      role: role,
      name: String(candidate.name || ""),
      label: String(candidate.label || candidate.name || ""),
      description: String(candidate.description || ""),
      reason: String(candidate.reason || ""),
      assigned: assignedNode(role) === String(candidate.name || "")
    }
  }

  function pickerSection(candidates, role, heading, emptyText) {
    var rows = [{ kind: "header", selectable: false, text: heading }]
    for (var i = 0; i < candidates.length; i++)
      rows.push(root.assignmentRow(candidates[i], role))
    if (candidates.length === 0)
      rows.push({ kind: "empty", selectable: false, text: emptyText })
    rows.push({
      kind: "clear",
      selectable: true,
      role: role,
      label: role === "rx" ? "Clear Radio RX" : "Clear Radio TX"
    })
    return rows
  }

  // One flat display list so headers, rows and the Done row render in order,
  // while only `selectable` entries take a cursor slot.
  readonly property var pickerModel: {
    var rx = root.audioCandidates && root.audioCandidates.rx ? root.audioCandidates.rx : []
    var tx = root.audioCandidates && root.audioCandidates.tx ? root.audioCandidates.tx : []
    var list = root.pickerSection(rx, "rx", "Radio RX · sources", "No audio sources present")
      .concat(root.pickerSection(tx, "tx", "Radio TX · sinks", "No audio sinks present"))
    list.push({ kind: "done", selectable: true, label: "Done" })

    var slot = 0
    for (var i = 0; i < list.length; i++)
      if (list[i].selectable === true) list[i].slot = slot++
    return list
  }

  readonly property var pickerRows: {
    var list = []
    for (var i = 0; i < root.pickerModel.length; i++)
      if (root.pickerModel[i].selectable === true) list.push(root.pickerModel[i])
    return list
  }

  function togglePicker() {
    if (root.pickerOpen) {
      root.closePicker()
      return
    }
    root.pickerIndex = 0
    root.pickerOpen = true
    Qt.callLater(root.resetPickerScroll)
  }

  function closePicker() {
    root.pickerOpen = false
    root.pickerIndex = 0
  }

  function clampPickerIndex() {
    root.pickerIndex = Math.max(0, Math.min(root.pickerRows.length - 1, root.pickerIndex))
  }

  function movePickerCursor(delta) {
    if (!root.pickerOpen || root.pickerRows.length === 0) return
    root.pickerIndex += delta
    root.clampPickerIndex()
  }

  // A node can vanish while the picker is open; keep the cursor on a row.
  onPickerModelChanged: {
    if (root.pickerIndex >= root.pickerRows.length) root.clampPickerIndex()
  }

  function activatePickerRow(row) {
    if (!row) return
    if (row.kind === "done") {
      root.closePicker()
      return
    }
    if (row.kind === "clear") {
      root.assignAudio(row.role, "")
      return
    }
    root.assignAudio(row.role, row.name)
  }

  function activatePickerSlot(slot) {
    if (root.pickerRows.length === 0) return
    root.pickerIndex = slot
    root.clampPickerIndex()
    root.activatePickerRow(root.pickerRows[root.pickerIndex])
  }

  // The picker is capped so a long node list cannot outgrow the panel. Keep
  // the keyboard cursor inside the visible part of it.
  function ensurePickerVisible(item) {
    if (!item || !pickerScroll) return
    var flick = pickerScroll.contentItem
    if (!flick || flick.contentY === undefined) return
    var margin = Style.space(6)
    var maxY = Math.max(0, (flick.contentHeight || 0) - flick.height)
    var point = item.mapToItem(flick, 0, 0)
    var top = point.y
    var bottom = top + (item.height || 0)
    var viewTop = flick.contentY
    var viewBottom = viewTop + flick.height
    if (top < viewTop + margin) flick.contentY = Math.max(0, top - margin)
    else if (bottom > viewBottom - margin)
      flick.contentY = Math.min(maxY, bottom + margin - flick.height)
  }

  function resetPickerScroll() {
    if (!pickerScroll) return
    var flick = pickerScroll.contentItem
    if (flick && flick.contentY !== undefined) flick.contentY = 0
  }

  onOpenedChanged: if (!opened) root.closePicker()

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
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.movePickerCursor(dy)
      }
      onActivateRequested: if (root.pickerOpen) root.activatePickerRow(root.pickerRows[root.pickerIndex])
      onTextKey: function(t) {
        if (t === "a" || t === "A") root.togglePicker()
      }
      onCloseRequested: {
        // Escape collapses the picker before it closes the panel.
        if (root.pickerOpen) root.closePicker()
        else root.close()
      }

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

              // Only the radio column edits assignments. A handler rather than
              // an Item so the layout does not see a second child.
              TapHandler {
                enabled: column.modelData.key === "audio"
                cursorShape: Qt.PointingHandCursor
                onTapped: root.togglePicker()
              }
            }
          }
        }

        // ---- Assignment picker ---------------------------------------
        // Inline under the readout grid, never auto-opened. Two role
        // sections, a Clear row each, and Done to collapse. Only nodes
        // present right now are listed; nothing binds without a click.
        ScrollView {
          id: pickerScroll
          visible: root.pickerOpen
          width: parent.width
          // Capped so a long node list cannot outgrow the panel; the list
          // scrolls, and the keyboard cursor is kept in view.
          height: Math.min(pickerContent.implicitHeight, Style.space(260))
          clip: true
          ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
          ScrollBar.vertical.policy: pickerContent.implicitHeight > height
            ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff

          Column {
            id: pickerContent
            width: pickerScroll.availableWidth
            spacing: Style.space(4)

            Repeater {
              model: root.pickerOpen ? root.pickerModel : []

              delegate: Column {
                id: pickerEntry
                required property var modelData

                width: parent ? parent.width : 0
                spacing: Style.space(1)

                PanelSectionHeader {
                  visible: pickerEntry.modelData.kind === "header"
                  text: pickerEntry.modelData.text || ""
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                }

                Text {
                  visible: pickerEntry.modelData.kind === "empty"
                  width: parent.width
                  text: pickerEntry.modelData.text || ""
                  textFormat: Text.PlainText
                  color: Util.alpha(root.foreground, 0.44)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }

                CursorSurface {
                  visible: pickerEntry.modelData.selectable === true
                  width: parent.width
                  hasCursor: pickerEntry.modelData.selectable === true
                    && pickerEntry.modelData.slot === root.pickerIndex
                  onHasCursorChanged: if (hasCursor) root.ensurePickerVisible(pickerEntry)
                  current: pickerEntry.modelData.assigned === true
                  foreground: root.foreground
                  implicitHeight: pickerRowContent.implicitHeight + Style.spacing.xl

                  Column {
                    id: pickerRowContent
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: Style.space(6)
                    anchors.rightMargin: Style.space(6)
                    spacing: Style.space(1)

                    Text {
                      width: parent.width
                      text: pickerEntry.modelData.label || ""
                      textFormat: Text.PlainText
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      font.bold: pickerEntry.modelData.assigned === true
                      elide: Text.ElideRight
                    }

                    Text {
                      width: parent.width
                      visible: text !== "" && text !== pickerEntry.modelData.label
                      text: pickerEntry.modelData.description || ""
                      textFormat: Text.PlainText
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                    }

                    Text {
                      width: parent.width
                      visible: text !== ""
                      text: pickerEntry.modelData.reason || ""
                      textFormat: Text.PlainText
                      color: Util.alpha(root.foreground, 0.44)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      wrapMode: Text.WordWrap
                    }
                  }

                  MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onContainsMouseChanged: if (containsMouse)
                      root.pickerIndex = pickerEntry.modelData.slot
                    onClicked: root.activatePickerSlot(pickerEntry.modelData.slot)
                  }
                }
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
          text: "Click Radio audio or press a to assign Radio RX and Radio TX · Middle-click the bar to re-probe · Bar dot: grey unknown · green ready · amber check · red fault"
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
