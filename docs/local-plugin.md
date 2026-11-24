# Install Agent FRC

This repository is a plugin marketplace named `agent-frc-marketplace`. It lists one plugin, `agent-frc`, whose source is the repository root. Claude Code reads `.claude-plugin/marketplace.json`. Codex reads `.agents/plugins/marketplace.json`. Both hosts copy the plugin into their own cache, so an installed plugin does not need a checkout.

## Install from GitHub

### Claude Code

```sh
claude plugin marketplace add ehartye/agent-frc
claude plugin install agent-frc@agent-frc-marketplace
```

Inside a session, `/plugin install agent-frc --marketplace ehartye/agent-frc` does both steps. Start a new session, invoke `/agent-frc:frc-setup` and ask for the runtime identity. Then [check the session's plugin root and version](setup-health.md#claude-code-session).

### Codex

```sh
codex plugin marketplace add ehartye/agent-frc
codex plugin add agent-frc@agent-frc-marketplace
codex plugin list --marketplace agent-frc-marketplace --json
```

Start a new Codex session. In the desktop app, restart the app if the marketplace or plugin does not appear. Select **Agent FRC Marketplace** in the plugin directory and confirm Agent FRC is enabled. Ask to use `frc-setup` for a core runtime check, or `frc-strategic-narrative` to begin a season-specific strategy discussion.

To follow a release instead of the default branch, add `--ref TAG` to the Codex marketplace command or use `ehartye/agent-frc#TAG` as the Claude Code source.

## Update an installation

Each host installs the version declared in the plugin manifest. Refresh the marketplace, then install that version and start a new session.

```sh
claude plugin marketplace update agent-frc-marketplace
claude plugin update agent-frc@agent-frc-marketplace

codex plugin marketplace upgrade agent-frc-marketplace
codex plugin add agent-frc@agent-frc-marketplace
```

Do not edit an installed cache. A deferred native job can still be reading the previous copy. Check for a running job before replacing a cache.

An installation from a Git source has no staging receipt. A [deferred native job](native-job.md) freezes its plugin from a staged export, so stage a checkout of the same commit before dispatch.

## Run plugin commands from an installation

The guides write commands such as `npm run kickoff` and `node scripts/design.mjs` relative to the plugin root. That root is the installed copy or a checkout. The scripts use only Node.js built-in modules, so an installed copy needs no `npm install`. Use absolute paths for project files when the project is a different directory.

- **Claude Code:** `frc-setup` reports the root that the running session selected.
- **Codex:** the plugin root is two directories above the `SKILL.md` file that Codex opened. The [runtime resolver](setup-health.md#resolve-the-plugin-used-by-this-check) confirms it against the host inventory.

## Try the commands

These run from the plugin root, installed or checked out. Fill the register and field profile from the team's sources before compiling, and open the generated HTML locally. For a quick trial, run the last command with [the invented training field](../examples/kickoff/training-field.json) as the profile. Outputs use new filenames, so earlier revisions are kept.

```sh
npm run rules -- init ../robot-project/register.json
npm run rules -- compile ../robot-project/register.json ../robot-project/field-profile.json ../robot-project/reviewed-rules.json
npm run kickoff -- --profile ../robot-project/reviewed-rules.json --output ../robot-project/field.html
```

## Develop from a checkout

For one Claude Code session, start `claude --plugin-dir PATH_TO_CHECKOUT` from a separate working project. The session loads the files in the checkout, including uncommitted edits.

To install a checkout through the marketplace, pass its path in place of `ehartye/agent-frc`. A host can copy everything under a local source, including ignored build outputs and private local evidence. Use a clean clone, or stage a clean export and add that directory as the marketplace:

```sh
npm run plugin:stage
codex plugin marketplace add ./artifacts/local-plugin
codex plugin add agent-frc@agent-frc-marketplace
```

Commit tracked changes before staging. The staging command copies tracked files into `artifacts/local-plugin`, excluding project host configuration and repository automation. The export includes both marketplace files, so it is a complete marketplace. It records the source commit and the SHA-256 of every packaged file in `.agent-frc-stage.json`. Git history, untracked files, ignored build outputs and private local evidence are excluded. An existing export is replaced only when it has the staging command's ownership marker. After changing or pulling plugin files, rerun the staging and install commands, then start a new session.

The project configuration in `.codex/config.toml` enables `agent-frc@agent-frc-marketplace` in a trusted checkout. A marketplace name maps to one source at a time. Codex refuses to add the same name from a different source until the configured marketplace is removed. Claude Code repoints the name and updates installed plugins from the new source.

## Check the install files

`npm run validate` compares both host manifests and both marketplace entries with the root `plugin.json`. It fails when a file is missing or malformed, when a name, version or description differs, when a marketplace source is not a committed plugin directory, or when a skill links to a file that a clean clone does not contain. Change the version in `package.json`, `plugin.json`, `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` together. The marketplace entries omit a version so the manifest stays the single declaration.

Run `claude plugin validate . --strict` for the Claude Code schema. Then install into a temporary host configuration to exercise both hosts without changing your own:

```sh
CLAUDE_CONFIG_DIR=EMPTY_DIRECTORY claude plugin marketplace add PATH_TO_CLEAN_CLONE
CLAUDE_CONFIG_DIR=EMPTY_DIRECTORY claude plugin install agent-frc@agent-frc-marketplace
CODEX_HOME=OTHER_EMPTY_DIRECTORY codex plugin marketplace add PATH_TO_CLEAN_CLONE
CODEX_HOME=OTHER_EMPTY_DIRECTORY codex plugin add agent-frc@agent-frc-marketplace
```

In PowerShell, set `$env:CLAUDE_CONFIG_DIR` or `$env:CODEX_HOME` before the command and clear it afterward.

`claude plugin details agent-frc@agent-frc-marketplace` lists the installed skills. Compare the count with the `skills` value printed by `npm run validate`.

A successful plugin installation does not install Java, WPILib, Python physics packages or Fusion. Optional vault grounding remains explicitly configured and is not required for installation. This setup does not publish to a public directory or modify any other marketplace.

For a release-day exercise, ask Agent FRC to open the kickoff field lab. The [kickoff guide](kickoff-field-lab.md) includes the standalone command and student narrative handoff.

See the [Claude Code plugin marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces) and the [OpenAI plugin packaging documentation](https://developers.openai.com/plugins/build/plugins) for current marketplace and cache behavior.
