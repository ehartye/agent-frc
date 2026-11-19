# Resume a design investigation

If the same difficulty keeps returning, reopen the design premise before tuning again. Name what must be physically true at the next action, the evidence that would contradict the working explanation, and a different way to achieve the objective. Keep the original failure available to compare designs. [Compare camera coverage with a different retention strategy](camera-reference.md#could-the-premise-be-wrong).

When someone asks what to try next on an existing robot design, recover the decision that led to the current candidate. Use the project in front of you. A conversation may resume through setup, CAD, a saved blockout or a strategy review.

1. **Find the cycle.** Open the latest applicable strategy narrative and follow its references. Identify how the piece enters, moves through the robot and reaches the target. Name the step that currently limits the cycle.
2. **Check what the drawings describe.** Open the current candidate or saved artifact and its revision, then trace any conflicting architecture sketch. Explain project terms by describing where the piece starts, who moves it and where it goes. Label the active experiment, historical designs and options still under comparison. File modification time alone cannot establish which design the team chose.
3. **Recover the owner's decision.** Read the decision log and later corrections, including the conversation. A choice to try one route first establishes the order of investigation. Preserve the owner's uncertainty about why a part exists or what it could support later. Cite the decision separately from evidence that the mechanism works.
4. **Check the applicable constraint and the last experiment.** Open the selected season's rule source and identify its revision and clause. Open the relevant test or observation and identify its configuration, inputs and actual result. Explain which parts of the cycle the fixture exercised. An unloaded or isolated result has a limited scope.
5. **Recommend one next experiment.** Tie it to the selected cycle step. State the starting configuration, what varies, what to observe, and which decision the result would inform. Give a source locator for the narrative, decision, current candidate, rule and prior result, using a path and heading, revision or rule number that another reader can open.

For conflicting records, say which claim each record supports and how its date, revision or authority affects its use. If an essential source is missing, name the gap and keep the recommendation conditional. For a missing rule, leave legality unresolved until the applicable text is available. If a consequential choice is still open after reading the records, explain what work can proceed under either choice and ask the single question that changes the next experiment.

## When the decision is missing from this checkout

Start with the current project and the locators supplied by the team. If a selection is missing or two records materially disagree, look for a relevant local branch or registered worktree of this repository. A plain folder, or a project without Git available, still has its files and any records the owner supplied. Describe what is missing and use the shared-work and priority question above.

In PowerShell, start in the project directory. To enter a path with brackets or other wildcard characters, use `Set-Location -LiteralPath` and the supplied path. First check Git's effective configuration. A partial clone can fetch missing objects during an ordinary read. If a partial-clone or promisor setting is present, or the configuration cannot be checked, end Git discovery here. Use existing files and owner-supplied locators and identify any unavailable decision. The same fallback applies when the directory is outside a Git worktree. The snippets share a helper that reads Git's UTF-8 output and restores the terminal encoding.

```powershell
$project = (Get-Location).Path
function Read-Utf8([scriptblock]$command) {
    $previous = [Console]::OutputEncoding
    try {
        [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
        & $command
    } finally {
        [Console]::OutputEncoding = $previous
    }
}
git -C "$project" rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0) { throw 'Use existing project files and supplied locators.' }
git -C "$project" config --includes --name-only --get-regexp '^(extensions\.partialclone|remote\..*\.(promisor|partialclonefilter))$'
if ($LASTEXITCODE -eq 0) { throw 'Partial or promisor clone. Use existing files and supplied locators.' }
if ($LASTEXITCODE -ne 1) { throw 'Cannot verify the local object configuration. Use existing files.' }
$prefix = [string](Read-Utf8 { git -C "$project" rev-parse --show-prefix })
if ($LASTEXITCODE -ne 0) { throw 'Cannot locate the selected project.' }
Read-Utf8 { git -c core.quotePath=false -C "$project" worktree list --porcelain }
Read-Utf8 { git -C "$project" for-each-ref --count=20 --format="%(refname) %(objectname)" refs/heads/ }
```

In a large repository narrow the final argument to a relevant local ref prefix. Report the refs you actually checked if a decision remains missing. For an unmounted branch, use its full commit ID and search the canonical kickoff folder first. Follow the strategy record’s locators into the current experiment or design. For older projects the second command checks legacy decision locations. Keep the full repository-relative path printed by `ls-tree --full-name`, including any project prefix. [Student project layout](../skills/frc-project-setup/SKILL.md)

```powershell
$revision = '<commit ID>'
Read-Utf8 { git --literal-pathspecs -c core.quotePath=false -C "$project" ls-tree -r --full-name --name-only "$revision" -- kickoff | Select-Object -First 30 }
Read-Utf8 { git --literal-pathspecs -c core.quotePath=false -C "$project" ls-tree -r --full-name --name-only "$revision" -- STRATEGY.md DECISIONS.md notes strategy design | Select-Object -First 30 }
$record = '<full repository-relative path from the listing>'
if ([string]::IsNullOrWhiteSpace($record)) { throw 'Select an exact record before opening it.' }
Read-Utf8 { git --literal-pathspecs -C "$project" show "${revision}:$record" }
```

For a plausible registered worktree, use its root from the worktree listing and keep the selected project's folder prefix. Porcelain v1 status displays repository-relative paths. Read the current file to recover an uncommitted correction. For a different modified or untracked record, set `$record` to its exact repository-relative path.

```powershell
$other = '<registered worktree path>'
Read-Utf8 { git --no-optional-locks --literal-pathspecs -c core.quotePath=false -C "$other" status --porcelain=v1 --untracked-files=all -- "${prefix}kickoff" "${prefix}STRATEGY.md" "${prefix}DECISIONS.md" "${prefix}notes" "${prefix}strategy" "${prefix}design" }
Get-Content -LiteralPath (Join-Path "$other" "$record")
```

Use the filename portion of an ordinary status row. If Git encloses a filename containing spaces in double quotes and it contains no backslash escapes, omit the surrounding display quotes. A C-quoted escape sequence (for example one representing a control character), a decoding error or a rename/copy pair needs an exact path locator from the owner or a supplied project record. Leave that evidence unresolved until you can open the exact file. Guessing a decoded path or splitting on an arrow can select another decision.

Record a committed decision as revision, relative path and heading. For a changed file cite the worktree, relative path, heading and modified or untracked status. Follow an explicit owner correction when choosing the experiment. A newer edit or a named branch alone establishes no priority. When proposals compete without a decision, cite both, prepare the work they share and ask which direction comes first. All discovery is read-only. Keep the current checkout, index and refs intact, use local objects and limit reads to this repository and its registered worktrees.
