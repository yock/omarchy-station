# Prototype verdict

**Question**: three reaches of the expanded station panel — triage list,
instrument panel, guided flow — over the same snapshot, on the real Omarchy bar.

**Winner**: **B, the instrument panel.** One verdict line over a three-column
readout (source, frequency, rate), with each check's state as a coloured rule.
It answers "what is the station doing right now" without turning the three
peer checks into a checklist, and the rule is the only state marker.

**Losers**:

- **A, triage list** — sorts worst-first, which makes red actionable but
  reorders rows while the panel is open; a poll can move a row under the cursor.
- **C, guided flow** — best at the grey/first-run state, but verbose, and its
  single "next" action is arbitrary when two checks fail at once.

**Model decisions that came out of the prototype**:

- Time readiness is source-based. GPS/PPS or NTP, the most specific GPS rung
  (no device, gpsd down, no fix, no PPS, ready but not selected), and the active
  source. No offset threshold; no FT8 slot.
- CAT readiness is link health. Frequency/mode are read; SWR/ALC/forward power
  are TX-only, model-specific and calibration-dependent, so they never affect
  state. PTT state is read-only; there is no test button and no keying.

Captured 2026-10-26. The winner was folded into `Panel.qml` and `Readiness.js`
on `master`; this branch keeps the full set of variants and their sample data.
