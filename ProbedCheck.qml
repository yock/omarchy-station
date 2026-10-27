import QtQuick

// Shared poll lifecycle for the checks that cost a process to answer.
//
// A poll assembles its facts in `pending` and commits them in one assignment,
// so the bar never paints an answer stitched together from two polls. A
// refresh asked for while one is running is remembered and replayed once it
// finishes, which keeps the poll interval honest when a tool is slow.
//
// Subclasses supply `blankFacts()` for the neutral fact set, `startPoll()` to
// begin the first process, and their own `check` binding over `facts`.
Item {
  id: root

  // The committed answer. Replaced as a whole at the end of every poll.
  property var facts: ({})
  property bool probed: false

  property bool probing: false
  property bool refreshPending: false
  property var pending: ({})

  function blankFacts() { return ({}) }
  function startPoll() {}

  function refresh() {
    if (root.probing) {
      root.refreshPending = true
      return
    }
    root.probing = true
    root.pending = root.blankFacts()
    root.startPoll()
  }

  function finish() {
    root.facts = root.pending
    root.probed = true
    root.probing = false
    if (!root.refreshPending) return
    root.refreshPending = false
    root.refresh()
  }
}
