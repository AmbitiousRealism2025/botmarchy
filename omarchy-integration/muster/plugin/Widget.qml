import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Botmarchy Muster — the court's roll call in the bar.
//
// Layer 1 (glance): "⚔ 4" / "⚔ 4 · 2 ⚙" (dimmed when stale; "⚔ ⚠" unconfigured)
// Layer 2 (peek):   hover tooltip — per-bot status + last message
// Layer 3 (decide): click opens the roster window (botmarchy-muster:
//                   fuzzel/wofi dmenu, keyboard-first; Enter engages
//                   Botmarchy). Right-click refreshes now.
//
// Configuration resolution (Omarchy convention: QML fallbacks must be
// usable from a bare layout entry — manifest defaults feed the settings
// UI, not the widget):
//   sshTarget:  shell.json entry  →  ~/.config/botmarchy/muster.json
//               (written by the roster's first-run onboarding)  →  ""
//   intervalSec: shell.json entry → muster.json → 10
// The widget never hides itself; unconfigured shows "⚔ ⚠" with setup help.
//
// Data: ssh to the Botmarchy gateway box runs botmarchy-muster-snapshot
// (one JSON line; reads profile state.db's read-only — no dashboard, no
// session token). Last good snapshot stays on screen when unreachable;
// staleness dims the label.

BarWidget {
  id: root
  moduleName: "dev.botmarchy.muster"

  // --- configuration chain -------------------------------------------------
  property var musterConfig: ({})   // parsed ~/.config/botmarchy/muster.json

  readonly property string configuredTarget: String(setting("sshTarget", "")).trim()
  readonly property string fileTarget: String(musterConfig.ssh || "").trim()
  readonly property string sshTarget: configuredTarget || fileTarget

  readonly property int configuredInterval: Number(setting("intervalSec", 0)) || 0
  readonly property int fileInterval: Number(musterConfig.interval) || 0
  readonly property int intervalSec: Math.max(2, configuredInterval || fileInterval || 10)

  // --- data ------------------------------------------------------------------
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
    sshTarget === "" ? "⚔ ⚠"
    : bots.length === 0 ? "⚔ –"
    : workingCount > 0 ? `⚔ ${bots.length} · ${workingCount} ⚙`
    : `⚔ ${bots.length}`

  readonly property string tooltipText: {
    if (sshTarget === "") {
      return ["Botmarchy Muster — not configured", "",
        "Set sshTarget here in shell.json, or run the roster",
        "once (Super+Alt+B) to answer the setup questions."].join("\n")
    }
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

  FileView {
    path: Quickshell.env("HOME") + "/.config/botmarchy/muster.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try {
        root.musterConfig = JSON.parse(String(text || "{}")) || {}
      } catch (e) {
        root.musterConfig = ({})
      }
    }
    onLoadFailed: root.musterConfig = ({})
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

    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: if (text && text.trim().length > 0)
        console.warn("muster", "snapshot ssh stderr:", text.trim())
    }
  }

  Timer {
    interval: root.intervalSec * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  WidgetButton {
    id: button

    anchors.fill: parent
    bar: root.bar
    text: root.labelText
    fontSize: Style.font.caption
    horizontalMargin: 6
    dimmed: root.sshTarget !== "" && (root.stale || root.workingCount === 0)
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
