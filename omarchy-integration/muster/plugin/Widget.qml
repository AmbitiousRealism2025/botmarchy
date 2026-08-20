import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Botmarchy Muster — the court's roll call in the bar.
//
// Layer 1 (glance): "⚔ 4" / "⚔ 4 · 2 ⚙" (dimmed when stale)
// Layer 2 (peek):   hover tooltip — per-bot status + last message
// Layer 3 (decide): click opens the roster window (botmarchy-muster:
//                   fuzzel/wofi dmenu, keyboard-first; Enter engages
//                   Botmarchy). Right-click refreshes now.
//
// Data: ssh to the Botmarchy gateway box runs botmarchy-muster-snapshot
// (one JSON line; reads profile state.db's read-only — no dashboard, no
// session token). The last good snapshot stays on screen when the box is
// unreachable; staleness dims the text.

BarWidget {
  id: root
  moduleName: "dev.botmarchy.muster"

  readonly property int intervalSec: Math.max(2, Number(setting("intervalSec", 10)))
  readonly property string sshTarget: String(setting("sshTarget", ""))
  property var snapshot: ({})

  readonly property var bots: (snapshot && snapshot.bots) || []
  readonly property int workingCount: {
    var n = 0
    for (var i = 0; i < bots.length; i++) if (bots[i].working) n++
    return n
  }
  readonly property double generated: (snapshot && snapshot.generated) || 0
  readonly property bool stale: generated === 0 || Date.now() / 1000 - generated > 900

  readonly property string labelText:
    bots.length === 0 ? "⚔ –"
    : workingCount > 0 ? `⚔ ${bots.length} · ${workingCount} ⚙`
    : `⚔ ${bots.length}`

  readonly property string tooltipText: {
    var lines = ["Botmarchy — roll call"]
    for (var i = 0; i < bots.length; i++) {
      var b = bots[i]
      lines.push(`${b.working ? "▶" : "●"} ${b.name} — ${b.last_message || "no messages"}`)
    }
    if (bots.length === 0) lines.push("(no bots on the gateway yet)")
    lines.push("─")
    lines.push("click: roster · right-click: refresh")
    return lines.join("\n")
  }

  function refresh() {
    if (pollProc.running || sshTarget === "") return
    pollProc.running = true
  }

  Process {
    id: pollProc

    command: ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=2",
      root.sshTarget, "botmarchy-muster-snapshot"]

    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try {
          root.snapshot = JSON.parse(text || "")
        } catch (e) {
          // unreachable or unparsable: keep the previous snapshot; the
          // generated timestamp ages it out to the dimmed stale state.
        }
      }
    }
  }

  Timer {
    interval: root.intervalSec * 1000
    running: root.sshTarget !== ""
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  visible: sshTarget !== ""
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button

    anchors.fill: parent
    bar: root.bar
    text: root.labelText
    fontSize: Style.font.caption
    horizontalMargin: 6
    dimmed: root.stale || root.workingCount === 0
    tooltipText: root.tooltipText
    onPressed: function(button) {
      if (button === Qt.RightButton) {
        root.refresh()
      } else {
        Quickshell.execDetached(["botmarchy-muster"])
      }
    }
  }
}
