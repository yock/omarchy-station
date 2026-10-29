# Time readiness is source health, not clock variance

Time sync readiness is judged by whether the configured time source — GPS/PPS or
NTP — is healthy and actually disciplining the host clock. A measured offset
does not warn or fail the check, and the next FT8 slot is not part of readiness
at all. An offset can only be measured against a source we already trust, so it
is a diagnostic residual rather than an independent signal; what digital modes
such as JS8Call need is a trustworthy source of UTC. When GPS is configured but
unavailable — chrony not installed, no device, gpsd not running, no fix — the
check warns even if NTP is still carrying the clock, because the station's
intended source is gone. A fix does not force the clock onto GPS: "ready but not
selected" and "fix without PPS" are reported but stay green unless the station
marks GPS required. Rejected: thresholding the offset (e.g. warn above 50 ms),
which reads as "sync lost" for a clock that is in fact disciplined.
