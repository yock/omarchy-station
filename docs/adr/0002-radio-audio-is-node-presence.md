# Radio audio readiness is node presence and mute, not signal condition

Radio audio readiness is judged by whether the two configured nodes exist and are
unmuted — Radio RX and Radio TX, each an explicit operator assignment — plus one
station-level hazard: Radio TX being the system default output. A suspended node
is normal idle behaviour, not a fault: WirePlumber suspends a node five seconds
after it goes idle, so "suspended" is what a healthy radio looks like between
transmissions and could never be a rung. Sample rate is a readout, never state:
44.1 kHz on the radio nodes does not stop a digital mode working, and the graph
resamples anyway. Signal and clipping levels are excluded entirely rather than
demoted to diagnostics, because metering means opening a capture stream in a
long-lived unsandboxed shell for a number that never changes state. Mutes warn
while absence fails, because absence means the configured path is gone while a
mute is one toggle from ready. PipeWire not running fails rather than reading
unknown, since the check cannot be answered at all. An unassigned role reads
unknown rather than ok — deliberately unlike ADR 0001's "GPS mode off is ok"
— because every digital-mode station needs an audio path, and a confident
green over a check nobody configured is a lie. Node identity is the PipeWire
node name, stored after explicit confirmation and never rebound automatically; a
vanished name fails and the operator re-picks, because generic USB codec names
cannot distinguish a radio from a headset — they identify a chip family, not a
radio model — and a wrong binding that flips green is worse than grey. The probe is Quickshell's native PipeWire service rather than
`pw-dump` or `pactl`: it is event-driven, first-party to the environment, and
reports only what this model uses. Rejected: polling `pw-dump` (richer data, but
two of its extra fields are exactly the ones we do not treat as signals, and the
negotiated rate is empty while suspended); `pactl` (a PulseAudio shim that mixes
monitor sources into its source list); property-based auto-binding (silently
binds the wrong one of two identical codecs); and muted RX as a failure (red
should mean gone, not switched off). TNC stations, whose audio path lives inside
the modem so that no host nodes exist at all, are a separate design in issue #4.
