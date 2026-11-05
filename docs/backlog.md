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

### Screens that still count our own workspaces

`PUT /admin/tenants/:id/internal` marks a workspace as ours, twenty of the
twenty-five in production are, and the Workspaces page and the overview now
leave them out of their totals. Three places still do not, none of them a
total a customer or an owner would read:

- **Sessions** (`/console/sessions`) lists every session with no internal
  filter. The backend accepts `?internal=exclude` and returns
  `counts: { customer, internal }` on that endpoint already, so this is a
  chip row and a subtitle, the same shape as the Workspaces page.
- **Audit** (`/console/audit`) is deliberately unfiltered and should stay
  that way. What an operator did to a probe is as much a record as what they
  did to a customer.
- **Fleet** (`/console/fleet`) counts numbers rather than workspaces. A proxy
  number held by a probe is still a number out of the pool, so the figure is
  correct as it stands. It would only need splitting if we wanted to know how
  much of the pool our own testing holds.

The backend side needs nothing for any of these.
