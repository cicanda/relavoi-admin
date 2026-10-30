@AGENTS.md

## Before any work in this repo

Before any work in this repo: git fetch origin, then check whether origin/main
has commits you don't have. If it does, list them (author, message, files
touched) in your report before building. Genesis makes UI changes to the
dashboard, admin and site between our sessions. Never overwrite them: rebase
your work onto origin/main, and where a conflict touches their UI work, keep
their version and re-apply our change on top. Fetch again right before you
push, in case something landed while you worked. After a long gap between
sessions, assume something has changed.

If a change of ours would alter a screen Genesis has recently redesigned
(layout, styling, components, not just data wiring), say so in the report so
Kay can give them a heads-up.
