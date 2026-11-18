# Resume a design investigation

When someone asks what to try next on an existing robot design, recover the decision that led to the current candidate. Use the project in front of you. A conversation may resume through setup, CAD, a saved blockout or a strategy review.

1. **Find the cycle.** Open the latest applicable strategy narrative and follow its references. Identify how the piece enters, moves through the robot and reaches the target. Name the step that currently limits the cycle.
2. **Check what the drawings describe.** Open the current candidate or saved artifact and its revision, then trace any conflicting architecture sketch. Explain project terms by describing where the piece starts, who moves it and where it goes. Label the active experiment, historical designs and options still under comparison. File modification time alone cannot establish which design the team chose.
3. **Recover the owner's decision.** Read the decision log and later corrections, including the conversation. A choice to try one route first establishes the order of investigation. Preserve the owner's uncertainty about why a part exists or what it could support later. Cite the decision separately from evidence that the mechanism works.
4. **Check the applicable constraint and the last experiment.** Open the selected season's rule source and identify its revision and clause. Open the relevant test or observation and identify its configuration, inputs and actual result. Explain which parts of the cycle the fixture exercised. An unloaded or isolated result has a limited scope.
5. **Recommend one next experiment.** Tie it to the selected cycle step. State the starting configuration, what varies, what to observe, and which decision the result would inform. Give a source locator for the narrative, decision, current candidate, rule and prior result, using a path and heading, revision or rule number that another reader can open.

For conflicting records, say which claim each record supports and how its date, revision or authority affects its use. If an essential source is missing, name the gap and keep the recommendation conditional. For a missing rule, leave legality unresolved until the applicable text is available. If a consequential choice is still open after reading the records, explain what work can proceed under either choice and ask the single question that changes the next experiment.

## When the decision is missing from this checkout

Start with the current project and the locators supplied by the team. If a selection is missing or two records materially disagree, look for a relevant local branch or registered worktree of this repository. A plain folder, or a project without Git available, still has its files and any records the owner supplied. Describe what is missing and use the shared-work and priority question above.

In PowerShell, start in the project directory. First inspect the names and paths. Limit the search to plausible review branches, decision files and their directly related records.

```powershell
$project = (Get-Location).Path
git -C "$project" rev-parse --show-toplevel
git -C "$project" worktree list --porcelain
git -C "$project" for-each-ref --count=20 --format="%(refname) %(objectname)" refs/heads/
```

In a large repository narrow the final argument to a relevant local ref prefix. Report the refs you actually checked if a decision remains missing. To read a committed choice on a branch with no mounted worktree, use its full commit ID from the listing. Substitute the selected commit, the relevant folders and the exact path discovered there.

```powershell
$revision = '<commit ID>'
git -C "$project" ls-tree -r --name-only "$revision" -- notes strategy design | Select-Object -First 30
$record = 'notes/owner review.md'
git -C "$project" show "${revision}:$record"
```

For a plausible registered worktree, use the path from the worktree listing. Inspect the current file itself to recover an uncommitted correction. Paths below are relative to that worktree's root.

```powershell
$other = '<registered worktree path>'
git --no-optional-locks -C "$other" status --short --untracked-files=all -- notes strategy design
Get-Content -LiteralPath (Join-Path "$other" "$record")
```

Record a committed decision as revision, relative path and heading. For a changed file cite the worktree, relative path, heading and modified or untracked status. Follow an explicit owner correction when choosing the experiment. A newer edit or a named branch alone establishes no priority. When proposals compete without a decision, cite both, prepare the work they share and ask which direction comes first. All discovery is read-only. Keep the current checkout, index and refs intact, use local objects and limit reads to this repository and its registered worktrees.
