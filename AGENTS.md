## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `yock/omarchy-station`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Tests

Tests cover behaviour, not prose. Never read `README.md` or other docs from a
test and assert on their content: documentation changes for legitimate editorial
reasons, and a failing test should mean the code is wrong, not that a sentence
moved. Keep docs accurate by review.
