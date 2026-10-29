pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Readiness.js" as Readiness

// Expanded station readiness: one verdict line over one flat readout row.
//
// The row is time sync, then the declared station paths' checks: two, three or
// four columns, decided by the declaration alone and never by hardware state.
// A not-applicable check never reaches this panel — the model's rows() drops
// it — so no column is ever drawn greyed out.
//
// The readouts are not all numbers. Time leads with its source (GPS/NTP)
// because a clock's variance is not a readiness signal; CAT leads with the
// frequency; audio leads with the assigned Radio RX node, so a failure still
// names the node that went missing; TNC leads with the transport. Each check's
// state is the coloured rule under its column, so there is no second state
// marker.
Panel {
  id: root
  moduleName: "yock.station-readiness"
  ipcTarget: "yock.station-readiness"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var readiness: Readiness.emptySnapshot()
  property var audioCandidates: ({ rx: [], tx: [] })
  property var tncCandidates: []
  property string tncHint: ""

  // Which inline picker is open: "" | "audio" | "gps" | "tnc". At most one is
  // open, none opens by itself, and each opens over a green check because it
  // edits configuration rather than remediates a fault.
  property string pickerKind: ""
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

  readonly property string gpsModeSetting: String(root.setting(Readiness.gpsModeSettingKey(), "Off"))
  readonly property string stationPathsSetting: String(
    root.setting(Readiness.stationPathSettingKey(), Readiness.STATION_PATH_DEFAULT))
  readonly property string tncSetting: String(root.setting(Readiness.tncSettingKey(), ""))

  // Every edit goes back through the bar widget, which owns the whole
  // shell.json entry: updateEntryInline replaces it, and the entry also holds
  // refreshIntervalSec and the other settings.
  function assignSetting(key, value) {
    if (root.hostWidget && typeof root.hostWidget.assignSetting === "function")
      root.hostWidget.assignSetting(key, value)
  }

  // Audio goes through the role-aware writer so the role-to-key mapping stays
  // in one place; every other setting writes by key.
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
  function slotPickerRows(list) {
    var slot = 0
    for (var i = 0; i < list.length; i++)
      if (list[i].selectable === true) list[i].slot = slot++
    return list
  }

  readonly property var audioPickerModel: {
    var rx = root.audioCandidates && root.audioCandidates.rx ? root.audioCandidates.rx : []
    var tx = root.audioCandidates && root.audioCandidates.tx ? root.audioCandidates.tx : []
    var list = root.pickerSection(rx, "rx", "Radio RX · sources", "No audio sources present")
      .concat(root.pickerSection(tx, "tx", "Radio TX · sinks", "No audio sinks present"))
    list.push({ kind: "done", selectable: true, label: "Done" })
    return root.slotPickerRows(list)
  }

  // The declaration picker is the panel's station-paths control: choosing a
  // value changes which checks are applicable and therefore how wide the row
  // is. Like GPS mode, it applies on the choice and collapses.
  readonly property var pathsPickerModel: {
    var list = [{ kind: "header", selectable: false, text: "Station paths" }]
    var options = Readiness.stationPathRows(root.stationPathsSetting)
    for (var i = 0; i < options.length; i++) list.push(options[i])
    return root.slotPickerRows(list)
  }

  // The GPS picker edits a setting, not a node: choosing a mode applies it,
  // and Escape collapses the picker, so there is no Clear or Done row.
  readonly property var gpsPickerModel: {
    var list = [{ kind: "header", selectable: false, text: "GPS mode" }]
    var options = Readiness.gpsModeRows(root.gpsModeSetting)
    for (var i = 0; i < options.length; i++) list.push(options[i])
    return root.slotPickerRows(list)
  }

  // The TNC picker edits one setting, like gpsMode: choosing a transport
  // applies it and collapses the picker, and Clear is only offered when
  // something is assigned.
  readonly property var tncPickerModel:
    root.slotPickerRows(Readiness.tncTransportRows(root.tncCandidates, root.tncSetting))

  readonly property var pickerModel: root.pickerKind === "paths" ? root.pathsPickerModel
    : root.pickerKind === "gps" ? root.gpsPickerModel
    : root.pickerKind === "tnc" ? root.tncPickerModel
    : root.pickerKind === "audio" ? root.audioPickerModel : []

  readonly property var pickerRows: {
    var list = []
    for (var i = 0; i < root.pickerModel.length; i++)
      if (root.pickerModel[i].selectable === true) list.push(root.pickerModel[i])
    return list
  }

  // Opening the other picker replaces the open one; a second press of the
  // same shortcut closes it. Neither picker ever opens by itself.
  function openPicker(kind, index) {
    root.pickerKind = kind
    root.pickerIndex = index
    root.clampPickerIndex()
    Qt.callLater(root.resetPickerScroll)
  }

  function toggleAudioPicker() {
    if (root.pickerKind === "audio") root.closePicker()
    else root.openPicker("audio", 0)
  }

  // The cursor opens on the declared value.
  function togglePathsPicker() {
    if (root.pickerKind === "paths") root.closePicker()
    else root.openPicker("paths", Readiness.stationPathCursor(root.stationPathsSetting))
  }

  // The cursor opens on the mode the station is set to.
  function toggleGpsPicker() {
    if (root.pickerKind === "gps") root.closePicker()
    else root.openPicker("gps", Readiness.gpsModeCursor(root.gpsModeSetting))
  }

  // The cursor opens on the assigned transport's row. There is no TNC column
  // to edit on a station that does not declare the path, so `t` is inert
  // there rather than writing a setting the panel cannot show.
  function toggleTncPicker() {
    if (!Readiness.declares(root.stationPathsSetting, Readiness.PATH_TNC)) return
    if (root.pickerKind === "tnc") root.closePicker()
    else root.openPicker("tnc",
      Readiness.tncTransportCursor(root.tncCandidates, root.tncSetting))
  }

  // A column is clickable exactly when it edits a setting.
  function editsSetting(key) {
    return key === "time" || key === "audio" || key === "tnc"
  }

  function toggleColumnPicker(key) {
    if (key === "time") root.toggleGpsPicker()
    else if (key === "audio") root.toggleAudioPicker()
    else if (key === "tnc") root.toggleTncPicker()
  }

  function closePicker() {
    root.pickerKind = ""
    root.pickerIndex = 0
  }

  function clampPickerIndex() {
    root.pickerIndex = Math.max(0, Math.min(root.pickerRows.length - 1, root.pickerIndex))
  }

  function movePickerCursor(delta) {
    if (root.pickerKind === "" || root.pickerRows.length === 0) return
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
      if (row.role === "tnc") root.applyTncTransport("")
      else root.assignAudio(row.role, "")
      return
    }
    if (row.kind === "paths") {
      root.applyStationPaths(row.value)
      return
    }
    if (row.kind === "gps") {
      root.applyGpsMode(row.value)
      return
    }
    if (row.kind === "tnc") {
      root.applyTncTransport(row.value)
      return
    }
    root.assignAudio(row.role, row.name)
  }

  // The declaration is the setting that decides the panel's shape: applying it
  // makes checks applicable or not, and the bar widget's snapshot is rebuilt
  // from the new value immediately.
  function applyStationPaths(value) {
    var samePath = Readiness.stationPathsOf(value) === Readiness.stationPathsOf(root.stationPathsSetting)
    root.closePicker()
    if (samePath) return
    root.assignSetting(Readiness.stationPathSettingKey(), String(value))
  }

  // Applying the mode already set writes nothing; a different one persists,
  // and the bar widget re-polls the time check because the facts it needs
  // changed. Either way the picker collapses on the choice.
  function applyGpsMode(value) {
    var sameMode = Readiness.gpsModeOf(value) === Readiness.gpsModeOf(root.gpsModeSetting)
    root.closePicker()
    if (sameMode) return
    root.assignSetting(Readiness.gpsModeSettingKey(), String(value))
  }

  // The bar widget owns the poll, so it invalidates the old transport's facts
  // and re-scans when this setting changes.
  function applyTncTransport(value) {
    var sameTransport = Readiness.sameTncTransport(value, root.tncSetting)
    root.closePicker()
    if (sameTransport) return
    root.assignSetting(Readiness.tncSettingKey(), String(value))
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
    // Follow the widget icon, not the bar's midpoint: a widget lives in the
    // left, centre or right section, and its panel should read as belonging to
    // that section. On the right the card is clamped to the screen margin, so
    // it sits pinned to the right edge instead of under the clock. Centring on
    // the bar is only right for the centre-section panels (clock, weather).
    centerOnBar: false
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(520))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.movePickerCursor(dy)
      }
      onActivateRequested: if (root.pickerKind !== "") root.activatePickerRow(root.pickerRows[root.pickerIndex])
      onTextKey: function(t) {
        if (t === "a" || t === "A") root.toggleAudioPicker()
        else if (t === "g" || t === "G") root.toggleGpsPicker()
        else if (t === "t" || t === "T") root.toggleTncPicker()
        else if (t === "s" || t === "S") root.togglePathsPicker()
      }
      onCloseRequested: {
        // Escape collapses the picker before it closes the panel.
        if (root.pickerKind !== "") root.closePicker()
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
            Layout.fillWidth: true
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
              width: parent.width
              text: Readiness.verdictDetail(
                root.overallState, root.counts, root.readiness,
                root.stationPathsSetting, root.tncHint)
              textFormat: Text.PlainText
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }
          }

          Item { Layout.fillWidth: true }

          // The declaration is visible here, not inferred from the devices
          // below: click it (or press s) to switch the station between Host
          // audio, TNC and Both.
          Text {
            Layout.alignment: Qt.AlignTop
            text: "STATION PATHS · "
              + Readiness.stationPathLabel(root.stationPathsSetting).toUpperCase()
              + " ▾"
            textFormat: Text.PlainText
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.letterSpacing: 1.2
            font.bold: true
            TapHandler {
              cursorShape: Qt.PointingHandCursor
              onTapped: root.togglePathsPicker()
            }
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

              // The four-column row is narrow by design. Long device paths
              // and error strings wrap rather than truncate; the line cap
              // keeps one pathological answer from growing the panel forever.
              Text {
                Layout.fillWidth: true
                text: column.modelData.detail
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                maximumLineCount: 3
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
                wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                maximumLineCount: 2
                elide: Text.ElideRight
              }

              Item { Layout.fillHeight: true; implicitHeight: Style.space(2) }

              Rectangle {
                Layout.fillWidth: true
                implicitHeight: Math.max(2, Style.space(2))
                color: Readiness.color(column.modelData.state)
              }

              // The time column edits gpsMode; the radio column edits node
              // assignments. A handler rather than an Item so the layout does
              // not see a second child.
              TapHandler {
                enabled: root.editsSetting(column.modelData.key)
                cursorShape: Qt.PointingHandCursor
                onTapped: root.toggleColumnPicker(column.modelData.key)
              }
            }
          }
        }

        // ---- Inline picker -------------------------------------------
        // Inline under the readout grid, never auto-opened, and at most one
        // at a time. The audio picker edits node assignments; the GPS picker
        // edits gpsMode. Only nodes present right now are listed; nothing
        // binds without a click.
        ScrollView {
          id: pickerScroll
          visible: root.pickerKind !== ""
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
              model: root.pickerKind !== "" ? root.pickerModel : []

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
          text: "Click a column · s paths · g GPS · a audio · t TNC · middle-click re-probe"
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
