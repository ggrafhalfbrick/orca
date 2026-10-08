# Extra plugins

Every folder here is an Orca plugin that ships with builds of this branch, so nobody has to add it in Settings.
Once the plugin system is on (Settings > Plugins), Orca installs each folder whose manifest publisher is
`earlgeorg` as a bundled plugin at startup, and reinstalls it whenever its files change. Each plugin still asks
once for approval of its permissions, like any other plugin.

- Dev runs (`pnpm dev`) install straight from this folder.
- Packaged builds copy it to `Resources/plugins/extra`, leaving out each plugin's `test/` folder.

| Plugin | What it does |
| --- | --- |
| [markdown-vault](markdown-vault/README.md) | Markdown notes from a folder of any project on the Tasks page, with Start |
| [unity](unity/README.md) | Marks Unity projects and opens them in the right Unity Editor |

To add a plugin, put its folder here with publisher `earlgeorg` in `orca-plugin.json`. The publisher list is
`EXTRA_BUNDLED_PLUGIN_PUBLISHERS` in `src/shared/plugins/plugin-extra-bundles.ts`; the startup code is
`src/main/plugins/plugin-extra-bundled-bootstrap.ts`.

To work on a plugin with live reload, still add its folder as a plugin development path; that copy takes
precedence over the bundled one.
