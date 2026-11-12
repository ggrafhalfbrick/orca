# Useful Commands

- **Typecheck**: `pnpm tc` (or `tc:node` / `tc:cli` / `tc:web`)
- **Test**: `pnpm test [path/to/file.test.ts] --maxWorkers=2`; incremental: `pnpm test:changed [path] --maxWorkers=2` ([details](.github/CONTRIBUTING.md#targeting-local-tests)). Separate rendered UI E2E checks need explicit, reproducible viewport/state.
- **Lint/format**: Basic: `pnpm exec oxlint <files>`; full lint gate: `pnpm lint`; formatting: `pnpm exec oxfmt --check <files>` (fix: `--write`). Applicable gates include `pnpm check:code-quality:changed <base>` and `pnpm check:flaky-test-pattern-ratchet`.

> [!IMPORTANT]
> Run `pnpm check:changed` after your last edit/rebase, right before every push. Never `--no-verify`.

If selection fans out excessively, use scoped checks and report limits. Use the PR base (default `origin/main`; `ORCA_CODE_QUALITY_BASE=<ref>` for stacks). `--base=HEAD` and dirty-only checks provide incremental evidence only.

# Don't Poll the CI

Use `gh run watch <run-id> --compact --exit-status` or `gh pr checks --watch` to prevent token waste

# Repo Rules

- Ensure main is always releasable
- Never break the CI. If it's broken borken, merge fixes.
- **Do not add tests by default.** Low-value tests cost more than they catch. Add one only when it fails if your change is reverted, hardcodes its expected values (never computed by production code, locale files, or mocks), and runs at the single layer that owns the behavior. Never test copy/translations, CSS classes, constants, third-party libraries, private state, timing, or work counts. If you touch a test like that, delete it instead of updating it. See [anti-patterns](./docs/agents-md-refs/test-antipatterns.md).

# Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role.

# Electron UI Validation

- Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
- Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`, `app.focus()`, or OS activation. Use CDP screenshots of hidden renderers.
- Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
- Rebuild modified launch-policy code before running an app (stale build wrappers are not safe).
- Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.
- Screenshot presentational components without Electron: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

# First Class Citizens

Every change must consider these areas:

1. Cross-Platform Support (mac/linux/windows)
   - Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md).
2. Remote hosts
   - Features should work locally and on remote hosts
3. Mobile
4. Folder Workspaces
   - Don't assume every workspace is a git worktree.

# Footguns

## Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md).

# Integration Branch Only: Replace With Upstream When It Lands

This section exists only on the `integration` branch, which combines work while its pull requests wait for upstream. Never carry it, or anything listed here, into a branch meant for upstream.

- **Extra plugins.** `extra-plugins/` and the code that installs it at startup (`src/shared/plugins/plugin-extra-bundles.ts`, `src/main/plugins/plugin-extra-bundled-bootstrap.ts`, `src/main/plugins/plugin-extra-bundled-bootstrap-coordinator.ts` (which `src/main/startup/main-process-plugins.ts` imports in place of the upstream coordinator), and the `extraPluginResources` entry in `config/electron-builder.config.cjs`) ship only with this branch; see [`extra-plugins/README.md`](./extra-plugins/README.md). A plugin feature PR carries its API changes, never these folders.
- **Fork landing README.** `.github/README.md` and `.github/readme/` are what GitHub shows for this fork in place of the root `README.md`; upstream has neither, so merges never touch them.
- **Windows releases of this fork.** `.github/workflows/integration-windows-release.yml` builds the installer from this branch and publishes it as a release of the fork (`gh workflow run integration-windows-release.yml --ref integration`). It sets `ORCA_UPDATE_RELEASE_REPO`, which points the in-app updater at the fork's releases (`src/main/updater/update-release-repo.ts`, its `define` in `electron.vite.config.ts` for main and renderer and declarations in `src/types/build-constants.d.ts` and `src/renderer/src/env.d.ts`) and drops the SignPath publisherName from the unsigned installer (`isWinUnsigned` in `config/electron-builder.config.cjs`). Without it, an official release would update an install onto stablyai/orca and drop this branch's features. Fork builds also link update release notes to the fork's own releases (`src/renderer/src/lib/update-release-notes-url.ts`) and skip upstream's onorca.dev changelog highlights (`fetchChangelog` in `src/main/updater/releases/updater-changelog.ts`).
