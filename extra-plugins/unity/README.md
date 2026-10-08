# Unity

An Orca plugin for Unity projects. A worktree whose folder is a Unity project (it has
`ProjectSettings/ProjectVersion.txt`) shows a Unity icon beside its name. Click the icon, or
right-click the worktree, and choose **Open in Unity** to open that worktree in the Unity Editor
version the project was saved with. Unity Hub is not involved, so worktrees never need to be added
to Hub or removed from it afterwards.

- If an editor already has the project open, Orca says so instead of starting a second one.
- If the project's editor version is not installed, Orca names the missing version and the
  versions you have. Install it from Unity Hub; the plugin never opens a project with another
  version, which would start an upgrade.
- Only worktrees on this computer get the icon; SSH and Orca-server worktrees do not.

## How it finds the editor

The same places Unity Hub uses, read directly:

1. Editors added to Hub by hand (`editors-v2.json` in Hub's settings folder).
2. `<version>` under Hub's custom install folder (`secondaryInstallPath.json`).
3. `<version>` under Hub's default install folder: `C:\Program Files\Unity\Hub\Editor` on
   Windows, `/Applications/Unity/Hub/Editor` on macOS, `~/Unity/Hub/Editor` on Linux.

It starts the editor with `-projectPath <worktree>`. On Windows it tells whether the project is
open from the editor's lock on `Temp/UnityLockfile`; on macOS and Linux from the running
editors' command lines.

## Requirements

Orca with worktree badges (`contributes.worktreeBadges`, plugin branch `plugin-worktree-badges`).
Orca builds without them reject this manifest. The plugin asks for `workspace:read`, which hands it
the folder of a worktree when you run **Open in Unity** on it.

## Limits

- The project must be the worktree's root folder. A Unity project in a subfolder gets no icon.
- An editor that is already open is not brought to the front.

## Tests

```
node --test "extra-plugins/unity/test/*.test.mjs"
```
