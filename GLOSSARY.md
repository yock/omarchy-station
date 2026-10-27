# Omarchy Station

A bar widget that answers one question: can this station work a digital mode
right now?

## Language

**Readiness**:
Whether the station can work a digital mode right now, expressed as the worst of
the three checks. _Avoid_: health, status, green.

**Check**:
One of the three independent readiness questions: time sync, CAT control, radio
audio. _Avoid_: probe, indicator.

**Probe**:
The observation that supplies a check with its state. A check is the product
concept; a probe is how it is answered. _Avoid_: check.

**Verdict**:
The one-line overall readiness statement at the top of the expanded panel.
_Avoid_: headline, status.

**Readout**:
The primary value in a check's panel column: time source, frequency, or sample
rate. _Avoid_: metric, value.

**Time source**:
The reference that disciplines the host clock: GPS/PPS, NTP, or none. A source
can be configured, healthy, selected, or lost. _Avoid_: time sync, clock.

**Clock discipline**:
The host clock being steered by a time source. The clock can be disciplined by a
fallback source while the configured source is lost. _Avoid_: sync, lock.

**GPS fix**:
gpsd has a position/time solution (TPV mode 2 or 3). A connected receiver, or a
serial device that looks present, is not a fix. _Avoid_: GPS lock, GPS presence.

**Source health**:
How far the configured time source has got, reported as the most specific rung:
no device, daemon not running, no fix, fix without PPS, ready but not selected,
or disciplining the clock. _Avoid_: GPS status.

**Offset**:
The residual error between the host clock and a time source it already trusts.
It is a diagnostic, never a readiness signal. _Avoid_: drift, variance, skew.

**CAT link**:
The path from the widget to the rig: `rigctld` reachable, serial device present
and permitted, rig answering frequency and mode. _Avoid_: CAT status.

**Meter reading**:
A TX-only diagnostic such as SWR, ALC or forward power. Many rigs expose raw,
uncalibrated values, and some expose none at all; never a readiness signal.
_Avoid_: SWR, power.

**PTT state**:
Whether the rig reports itself as transmitting, read over CAT. It confirms the
keying path, not RF output. _Avoid_: PTT test, TX check.

**PTT test**:
Keying the rig to see whether it emits RF. Out of scope until a watchdog-backed
keying path exists. _Avoid_: PTT check.
