# Run Agent FRC from a local checkout

The repository includes a Codex marketplace named `agent-frc-local`. Its plugin source is a clean export generated inside this checkout, so the setup works wherever the checkout lives. The project configuration enables `agent-frc@agent-frc-local` in trusted checkouts.

From the repository root, use a Codex CLI that supports these commands:

```sh
npm run plugin:stage
codex plugin marketplace add .
codex plugin add agent-frc@agent-frc-local
codex plugin list --marketplace agent-frc-local --json
```

Then start a new Codex session in this checkout. In the desktop app, restart the app if the marketplace or plugin does not appear. Select **Agent FRC Local Checkout** in the plugin directory and confirm Agent FRC is enabled. Ask to use `frc-setup` for a core runtime check, or `frc-strategic-narrative` to begin a season-specific strategy discussion.

Commit tracked changes before staging. The staging command copies tracked files into `artifacts/local-plugin`, excluding repository marketplace and host configuration. It records the source commit and file hashes. Git history, untracked files, ignored build outputs and private local evidence are excluded. An existing export is replaced only when it has the staging command's ownership marker.

Codex installs a cached copy of that export. After changing or pulling plugin files, rerun `npm run plugin:stage` and the install command, then start a new session; do not edit the installed cache. This setup does not publish to a public directory or modify any other marketplace.

For a release-day exercise, ask Agent FRC to open the kickoff field lab. The [kickoff guide](kickoff-field-lab.md) includes the standalone command and student narrative handoff.

Validate the source with `npm test` and `npm run validate`. A successful plugin installation does not install Java, WPILib, Python physics packages or Fusion. Optional vault grounding remains explicitly configured and is not required for installation.

See the [OpenAI local plugin packaging documentation](https://developers.openai.com/plugins/build/plugins) for current marketplace and cache behavior.

For a long native job, [preserve its pinned package on the shared station](native-job.md) before starting. Confirm that active jobs have staged dependencies before refreshing the marketplace or removing a worktree.
