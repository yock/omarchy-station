# Readiness spans declared station paths

A station declares the station paths it expects — Host-audio, TNC, or both — and
readiness is the worst of the checks those declarations make applicable. The
declaration is a setting, never an inference from what is plugged in. Two codecs
do not make a station a radio, and a serial device that looks like a modem does
not make it a TNC station: a half-configured soundcard station would report
itself as a healthy modem station, which is a confident green over a check
nobody configured. The widget grades against what the operator said the station
intends, the same way it does with `gpsMode`. Evidence of an undeclared path is
a line of text — "KISS modem on `/dev/ttyACM0` — declare a TNC path" — never a
state.

Checks belong to paths. Time sync serves the station as a whole; CAT control and
radio audio serve the Host-audio path; TNC transport serves the TNC path. A
check that no declared path needs is not applicable: aggregation skips it, the
verdict's counts exclude it, and the panel never draws it. The state therefore
exists in the model while having no visible form. That is deliberate. Dropping
it in favour of a snapshot that only holds applicable checks would make `KEYS`
dynamic and push the variability into `emptySnapshot`, every probe's wiring and
the tests; keeping four keys and skipping one is the smaller change and keeps
"every key is present" true everywhere.

Worst-of-declared, not best-of-paths: a station that declares both and has lost
its modem is not green, because declaring a path is the same kind of statement
as configuring a GPS source, and ADR 0001 already decided that losing a declared
source is news even while a fallback carries the clock. The verdict always names
each declared path, so "ready for host audio · TNC needs attention" keeps the
working half visible rather than trading one lie for another.

The panel's shape is a function of the declaration alone: one flat row, time
sync first, then the declared paths' checks, two, three or four columns wide.
Hardware state changes colour and wording, never layout. Rejected: expanding
whichever path currently works (the panel rearranges itself when a modem
unplugs, and it compresses the failing path to one line exactly when its readout
is what you need); a second setting naming a primary path (a declaration that
can contradict the first, and the one setting nobody remembers to change);
swapping paths behind a modal switcher (hides half the station behind a click);
grouped path blocks (they spend vertical space to avoid four columns, which fit
at this panel width); and inferring the paths from attached devices, for the
reason above.

A Host-audio station with no CAT at all is a real station and a separate design:
this ADR keeps CAT inside that path rather than making it a per-check
declaration, because the moment applicability is per-check there is no path left
to name in the verdict.
