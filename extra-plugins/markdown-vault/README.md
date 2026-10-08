# Markdown Vault (Orca plugin)

Lists the markdown notes in a folder of one of your Orca projects on the Tasks page: plans, specs,
tickets, anything with YAML frontmatter. **Start** on a note opens Create workspace prefilled from it.

The notes can live in any Orca project: a local folder, a Git or a Perforce project, on this computer or
over SSH. By default the plugin reads the **latest version on the project's server** (Git: the upstream
branch after a fetch; Perforce: the depot head), so nobody needs to sync before the list is current. Set
**Read notes from** to disk to read the files in the project folder instead.

## Install

1. Orca: **Settings > Plugins**, turn on the plugin system.
2. Install this folder from a local path or its Git repository, then approve it. It asks to provide a
   Tasks list, read its own settings, read your projects' markdown files and keep a cache in its storage.
3. Open its settings and pick the **Vault project** and **Notes folder**.

## What a note needs

Nothing but a file name. Everything else is read from frontmatter fields you name in the settings:

```markdown
---
title: Faster level loading
status: In progress since Monday
priority: P1
owner: mia@example.com
tags: [loading, performance]
updated: 2026-10-01
base: release-2
---
```

- **Status**: the first of the status fields a note sets (default `state, status`). Long statuses show
  their leading words; the status words setting maps them to open, active, blocked, review, done and
  closed. Done and closed notes can be read but not started.
- **Filters**: status (open work by default), priority, owner (with Mine once you fill in **You**),
  label, and up to four more fields you list under **Extra filters**.
- **People file** (optional): a markdown table with Email and Name columns (and optional Aliases) so
  owners show by name.

## What Start fills in

- the note's file name as the workspace name (24 characters for Perforce copies),
- the **Work in project** (or the vault project),
- the branch or stream from the **Base field** (bare names get the **Base prefix**),
- a draft first message for the agent from the **Agent message** template, plus the note's model and
  effort fields as launch options; notes matching **Start without an agent when** get neither,
- **Workspace link notes**: `key: template` lines kept with the workspace's link to the note.

Templates take `{{title}}`, `{{path}}`, `{{slug}}`, `{{status}}`, `{{statusText}}`, `{{owner}}`,
`{{ownerEmail}}`, `{{priority}}`, `{{labels}}`, `{{base}}` and `{{field:NAME}}` for any frontmatter field.
You review everything before the workspace is created, and the message is typed as a draft, not sent.

## Speed

The list is re-read at most every 30 seconds, and only notes whose version changed are read again. The
parsed list is saved in the plugin's storage, so the next Orca session starts from it.

## Development

`node --test` in this folder runs the tests; the plugin has no dependencies.
