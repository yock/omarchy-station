import QtQuick
import QtQuick.Shapes
import qs.Commons

// The station mark: a mast topped by a ball, with two arcs curving outward from
// the ball. Drawn rather than set in an icon font so it stays legible at the
// bar's 18px optical canvas — the Nerd Font tower and antenna glyphs all fuse
// into blobs at that size — and so the icon carries no font dependency.
//
// Geometry is expressed as fractions of the item size, so the drawing survives
// a theme that resizes the bar. Strokes are weighted to sit beside Bluetooth
// and Wi-Fi at 1x, and the whole mark is raised a pixel so the mast foot lands
// level with its neighbours. In the 21px status slot the arc tips stop at x≈13
// and y≈6, clear of the state dot, which owns the slot's top-right corner.
// Keep it that way: the dot alone carries state.
Item {
  id: root

  property real size: 18
  property color color: Color.foreground

  readonly property real ax: width * 0.500
  readonly property real ay: height * 0.333
  readonly property real ballR: width * 0.094
  readonly property real arcR: width * 0.269
  readonly property real arcSpan: 60
  readonly property real arcStroke: Math.max(1, width * 0.078)
  readonly property real mastStroke: Math.max(1, width * 0.106)
  readonly property real mastBottom: height * 0.889

  width: size
  height: size
  implicitWidth: size
  implicitHeight: size

  Shape {
    anchors.fill: parent
    antialiasing: true
    preferredRendererType: Shape.CurveRenderer

    ShapePath {
      strokeColor: root.color
      strokeWidth: root.arcStroke
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathAngleArc {
        centerX: root.ax
        centerY: root.ay
        radiusX: root.arcR
        radiusY: root.arcR
        startAngle: -root.arcSpan
        sweepAngle: root.arcSpan * 2
      }
    }

    ShapePath {
      strokeColor: root.color
      strokeWidth: root.arcStroke
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathAngleArc {
        centerX: root.ax
        centerY: root.ay
        radiusX: root.arcR
        radiusY: root.arcR
        startAngle: 180 - root.arcSpan
        sweepAngle: root.arcSpan * 2
      }
    }

    ShapePath {
      strokeColor: root.color
      strokeWidth: root.mastStroke
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathMove {
        x: root.ax
        y: root.ay + root.ballR
      }
      PathLine {
        x: root.ax
        y: root.mastBottom
      }
    }
  }

  Rectangle {
    x: root.ax - root.ballR
    y: root.ay - root.ballR
    width: root.ballR * 2
    height: width
    radius: width / 2
    color: root.color
  }
}
