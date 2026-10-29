# CAT readiness is link health, not telemetry

CAT control readiness is judged by whether the path to the rig works: `rigctld`
is already running, the serial device it was given is present and permitted, and
the rig answers `get_freq`. Frequency is the readout and what proves the link;
mode and PTT state are read for the readout and the meta line when the backend
reports them. A backend without `get_mode` is not a broken station, so the check
does not turn red over a missing mode.

A link cannot exist without the `hamlib` package, so the first rung names the
package rather than a stopped daemon: `pgrep` cannot tell "not running" from
"never installed", and "not running" would send the operator after a daemon that
was never there. The widget still never installs it.

The widget attaches to an existing `rigctld` and never starts one. A daemon is
where the rig model, serial speed and PTT wiring are configured, and a second
daemon started from a bar widget would compete for the same serial port with the
one the operator already has. For the same reason the widget never opens the
serial device: it reads permission bits and process handles, but the open file
belongs to `rigctld`. A failed reply is explained by the most specific device
fact — no device, permission denied, port busy — because those are the failures
an operator can act on. Device facts are consulted only after the reply failed:
`rigctld` may run as another user, so its own open handle outranks this shell's
permission check.

SWR, ALC, forward power and the other meter readings are excluded entirely
rather than demoted to diagnostics: they exist only while transmitting, most
rigs report them raw and uncalibrated, and the set of supported levels differs
by model. Keying the rig to test the path is excluded too. PTT status is read
only, over CAT, and confirms the keying path rather than RF output; a widget
that can transmit is a widget that can jam a band when it restarts. Rejected:
starting `rigctld` on demand (unknown rig model, competing daemons, and a
configuration surface the widget should not own); grading the link on meter
readings (TX-only and calibration-dependent); a PTT test button (no
watchdog-backed keying path exists); and opening the serial device to probe it
(races the daemon and can only be done once safely).
