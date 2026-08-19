# Obsidian Graph View in VSCode

Explore Markdown note connections without leaving VS Code. This extension turns notes and their links into an interactive, force-directed graph.

## Features

- Visualize wiki links and standard Markdown links across a folder or from a single note.
- Open a note by selecting its node in the graph.
- Navigate `[[WikiLinks]]` directly in Markdown editors with Ctrl/Cmd-click.
- Search the graph; hide unresolved notes or orphans; toggle labels and directional arrows.
- Pan, zoom, drag nodes, and use `+`, `-`, arrow keys, or `Home` while the graph is focused.
- Automatically refresh when Markdown files in the selected source change.

## Getting started

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **Obsidian Graph View: Open Graph View**.
3. Choose either:
    - a folder: all Markdown files inside it are used as graph nodes, recursively.
    - a single Markdown file: the graph shows only that note and its first-level outgoing links.

Use **Obsidian Graph View: Choose Vault Folder** to switch source paths and **Obsidian Graph View: Refresh Graph** to refresh on demand. The selected path is stored in the `obsidianVaultGraph.vaultPath` setting.

## How links are resolved

The graph scans Markdown files recursively, excluding `.obsidian`, `.git`, and `node_modules`. It resolves Obsidian-style `[[WikiLinks]]` and standard Markdown links, including relative paths, folder-qualified links, and unqualified note names.

## Privacy

Your vault is read locally by VS Code. The graph webview uses no remote resources, telemetry, or network requests.

## Development

Open this repository in VS Code and press `F5` to launch an Extension Development Host. There is no build step: `extension.js` loads the source directly.

Run `npm run check` to validate JavaScript syntax, or `npm run package` to create a `.vsix` package.

## Author

Gaurav Patidar · [@gaurav7902](https://github.com/gaurav7902) · [Repository](https://github.com/gaurav7902/obsidian-graph-in-vscode)
