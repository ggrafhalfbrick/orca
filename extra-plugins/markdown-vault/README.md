The Markdown Vault plugin for Orca lists the markdown notes in a folder of one of your Orca projects on the
Tasks page. That covers plans, specs, tickets or anything else with YAML frontmatter. Choosing **Start** on a
note opens Create workspace, prefilled from that note.

The notes can live in any Orca project, whether a local folder, a Git project or a Perforce project, and
whether it sits on this computer or on an SSH host.

By default the plugin reads the **latest version on the project's server**, so nobody has to sync before
the list is current. For Git that means the upstream branch after a fetch; for Perforce it means the depot
head. To read the files in the project folder instead, set **Read notes from** to disk.

## Set up

1. In Orca, open **Settings > Plugins** and turn on the plugin system.
2. Install this folder from a local path or from its Git repository, then approve it. It asks for four
   permissions:
   - provide a Tasks list;
   - read its own settings;
   - read your projects' markdown files;
   - keep a cache in its own storage.
3. In the plugin's settings, choose the **Vault project** and the **Notes folder**. To use the Mine
   filter, also fill in **You** with how notes name you as owner.

Those are the only settings each person makes. Everything else about the vault comes from the folder's
config note.

## The config note

A note named `markdown-vault.md` in the notes folder configures the vault for everyone who uses it. Its
frontmatter holds the configuration, and its body can explain the vault to people. It never appears in the
list. Every key is optional, and anything you leave out keeps the default shown here:

```markdown
---
status-fields: [state, status]       # the first one a note sets wins
status-words: |                      # which status words mean which tone
  open: open, todo, ready, draft
  active: active, in progress, doing
  blocked: blocked, waiting
  review: review, in review
  done: done, complete, shipped
  closed: cancelled, superseded, parked
title-field: title                   # else the first heading, then the file name
priority-field: priority             # P0 to P3 sort first
owner-field: owner
labels-field: tags
updated-field: updated               # YYYY-MM-DD; newer first within a priority
filters: []                          # fields to filter by; empty picks them from the notes
work-project: ''                     # a depot path or Git remote; empty means the vault project
base-field: base                     # branch or stream a new workspace starts from
base-prefix: ''                      # put in front of bare names, e.g. //depot
model-field: model
effort-field: effort
agent: claude                        # the agent the model and effort fields are written for
start-without-agent-when: ''         # e.g. mode=manual
agent-message: |
  Work on the note "{{title}}" ({{path}}).

  Read that note first: it is your brief.
link-notes:                          # kept with the workspace's link to the note
  - 'note: {{path}}'
---
```

Some of these keys need a word more:

- **`work-project`** names where work happens rather than naming a project, because project ids differ
  from person to person. Orca matches the value to each person's own project: a depot path matches a
  Perforce workspace on that depot, and a Git remote URL matches a clone of it.
- **Templates** (`agent-message` and `link-notes`) can use these placeholders: `{{title}}`, `{{path}}`,
  `{{slug}}`, `{{status}}`, `{{statusText}}`, `{{owner}}`, `{{priority}}`, `{{labels}}` and `{{base}}`.
  `{{field:NAME}}` inserts any frontmatter field.
- **Filters**: there are always filters for status, priority, owner and label. On top of those come the
  fields in `filters`. If `filters` is empty, the plugin picks up to four fields itself: ones that many
  notes set, with a few short values each.

Done and closed notes can be read but not started. Notes that match `start-without-agent-when` start a
workspace with no agent message.

## Speed

The plugin re-reads the list at most every 30 seconds, and only re-reads notes whose version changed.
It keeps their frontmatter in its own storage, so the next Orca session starts from that copy instead of
reading every file again.

## Development

Run `node --test` in this folder to run the tests. The plugin has no dependencies.
