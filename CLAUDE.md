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

## Commit identity

Author and commit as `admin@cicanda.com`.

It is set per repository, `git config user.email admin@cicanda.com`, and not
globally. The global identity is a personal address, and before this was
pinned three different author identities had already reached this history:
`Kalu Chinecherem <kaluchinecherem8@gmail.com>`,
`Chinecherem Kalu <nechecodes@gmail.com>` and
`Kalu Chinecherem <nechecodes@gmail.com>`. Leave `user.name` as it is and
change only the address. Existing history is not rewritten.

Never add a Claude attribution line, a co-author trailer or a generated-by
note to a commit message or a pull request description. Never add
`Co-Authored-By`, `Generated with` or any other Claude or Anthropic
attribution to a commit or a PR. Named literally so it can be grepped for:
`git log --all --format=%B | grep -i -e co-authored-by -e anthropic` must stay
empty, and it is empty as of 2 November 2026 across every ref of every repo.

## Genesis works through pull requests

Genesis opens a PR; it is merged by Kay or by us. Three rules.

**Merge with a merge commit, never squash and never rebase.** Squashing or
rebasing rewrites Genesis's commits onto whoever pressed the button, which
throws away their authorship of their own work. A merge commit keeps their
commits intact under their name and keeps the review trail readable. Use
"Create a merge commit" in the GitHub UI, or `git merge --no-ff`.

**Check the PR builds locally before merging**, and report anything that fails
rather than merging over it. There is no lint script in this repository, so the
checks are:

```
npm run check:copy     # the em dash guard
npx tsc --noEmit       # typecheck
npm run build
```

**Read an open PR and its comments as part of the fetch-before-work rule**, not
only when about to merge it. If it touches something we have changed, say so
before merging rather than after.
