# Readiness states grade whether the station can work a digital mode

A station's state has to answer one question: can it work a digital mode right
now? `fail` therefore means it cannot, and `warn` means it can — either at
reduced capability or after a trivial local change. Readiness is still the worst
of the applicable checks (ADR 0001–0005); what changes is that severity grades
blocking, not how far a link got.

CAT control is the first check graded this way, and the reason the axis is
written down. A station with no CAT link is a real station: a manual-dial
operator with a working audio chain can work every digital mode, tuning by
hand. So every rung of the CAT ladder — `no hamlib`, `rigctld down`, a missing
or unpermitted device, a port held elsewhere, a failed reply — is `warn`, never
`fail`. The readout stays `—` and each rung's message is unchanged, because the
ladder still reports what is true; a manual-dial operator who never installed
hamlib is told exactly that, and it is a statement about their station rather
than a fault. A manual-dial station's dot is permanently amber, which is the
honest colour for a station less capable than a fully equipped one, and
`gpsMode=Required` already sets that precedent: a declared configuration can
settle at amber by design.

This amends ADR 0003's severity, which treated a failed CAT link as a fault, and
it closes ADR 0004's deferral of "a Host-audio station with no CAT at all". The
Host-audio path keeps CAT inside it: what changes is what a missing CAT costs,
not which path owns the check — so no per-check declaration, no new setting, no
picker row and no migration. Rejected: a `catExpected` boolean (a setting to
mutate, explain and migrate, bought to turn one dot green); leaving CAT red
(grades a working station as broken); inferring CAT's absence from attached
hardware (ADR 0004 already refuses to infer intent); and excluding CAT from the
dot's worst-of (needs a severity tier through `overall()` and `counts()`, more
machinery than the setting it replaces — worth adding only if permanent amber
proves intolerable in use).

`warn` also absorbs the existing actionability rungs. A muted Radio RX or TX,
and Radio TX being the system default output, stay `warn` even though a mute
decodes nothing, because one toggle is a trivial local change. That asymmetry is
deliberate and should not be "corrected" into a fault. The state's user-facing
name is **reduced capability**; its identifier stays `warn`, and
`counts().attention` keeps its name, because renaming them touches every probe
and test for no visible gain. The panel's copy follows the vocabulary: the
headline reads "Ready, reduced capability", a path reads "Host audio reduced
capability", and a count reads "1 of 3 checks at reduced capability".

Two consequences worth knowing. A station whose CAT link worked and then died
shows the same amber as one that never had CAT, because the widget is stateless
and does not remember that the link once worked. And "Needs attention" is gone
from the interface: a sentence that asks for action is wrong about a station
with nothing to fix.
