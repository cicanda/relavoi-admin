# Backlog

Work that was found, understood and deliberately not done, with enough detail
that picking it up does not mean rediscovering it. Dated entries, newest first.
Delete an entry when it ships; do not leave it here marked done.

## 2026-11-02

### Four react-hooks findings, downgraded to warnings when linting landed

This repo had no ESLint until today. Adding it produced no errors and 18
warnings; four of those are `react-hooks/set-state-in-effect`, held as
warnings deliberately rather than left to fail the build.

- `src/app/console/audit/page.tsx:47` and `:69`
- `src/app/console/fleet/page.tsx:30`
- `src/app/console/tenants/[id]/page.tsx:122`

All four are the same shape: an effect watching a query result and copying it
into component state. React can render the intermediate state, so a console
screen can show an empty table for a frame before the data lands. The fix is
to read from the query cache directly, or to key the component on the record
id, rather than mirroring fetched data into `useState`. All four are ours, not
Genesis's.

Not done now because it changes what those screens do and wants its own
review. Any new instance still shows up, and every other rule fails the build.
