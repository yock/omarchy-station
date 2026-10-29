# TNC readiness is transport holdership, never a KISS dialogue

The TNC check grades the transport the operator assigned — a USB serial device
or a Bluetooth device — and stops there. It cannot go deeper, for two reasons
that point the same way. KISS has no identification frame, so no generic modem
can be asked whether it is a modem; only vendor firmware answers a version
query, and grading every other modem red would punish the operators who run the
protocol correctly. And opening a serial port that another program already holds
steals inbound frames from it, so a widget that "checks" a modem in use corrupts
the station it is judging.

The ladder, most specific first. A declared TNC path with no transport assigned
reads unknown, with the ranked candidate list, following ADR 0002's rule that an
unassigned role is never a confident green. An assigned path that is missing, is
not a character device, or cannot be opened reads fail, and permission denies
name the `dialout` group. A port held by another process reads **ok** and names
the holder — "in use by `direwolf` (pid 4711)" — and is never opened. A legacy
`/dev/ttyS*` port reads warn, because the device exists and opens whether or not
anything is attached to it, so presence there proves nothing. A free serial port
that opens read-only and closes again reads ok. A Bluetooth device that is not
paired or not connected fails; paired and connected reads ok.

Busy reading green is the rung that looks wrong at first glance, and it is the
point. The check answers whether this station can work a digital mode, and a
process holding the declared modem's port is the strongest evidence available
that it can — the state a working TNC station is actually in while it is being
used. Failing it would turn red on exactly the station that works. The widget
cannot know what the holder is doing, and does not need to: it does not open the
port, and the meta line names the holder so the operator can judge.

No transport proves KISS, so no `ok` claims it on the panel. The caveat appears
here and in the README rather than in every TNC detail line, because a caveat
that is always present distinguishes nothing. Bluetooth is graded at connected
because Quickshell's Bluetooth service exposes adapter and device state without
GATT, and SPP needs an `rfcomm` binding the widget must not install; the same
boundary that keeps CAT from opening its serial device applies to a modem.

Rejected: a read-only KISS identification dialogue (unanswerable for generic
modems, and writing frames to a modem risks transmission); requiring observed
inbound frames (silence is never a readiness signal — ADR 0002 — and a quiet
band would read as a broken modem); opening a held port to confirm it; probing
the device file for a modem signature (a name identifies a chip family, not a
radio); auto-discovering transports (two serial devices and no way to tell which
is the modem); and bridging BLE GATT or SPP in-process, which needs a bridge the
widget should not own and belongs in its own design.
