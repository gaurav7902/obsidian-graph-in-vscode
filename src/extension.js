const vscode = require("vscode");
const path = require("path");
const {GraphPanel} = require("./graph-panel");
const {VaultIndex} = require("./vault-index");
const {createWikiLinkProvider} = require("./wiki-links");

let index;
let panel;
let watcher;
let refreshTimer;
let refreshInFlight = null;
let refreshQueued = false;
let extensionContext;

function configuredVault() {
    const value = vscode.workspace
        .getConfiguration("obsidianVaultGraph")
        .get("vaultPath");
    return value ? vscode.Uri.file(value) : undefined;
}

async function loadVault(uri) {
    const nextIndex = await VaultIndex.load(uri);
    index = nextIndex;
    return nextIndex;
}

async function isDirectory(uri) {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.Directory;
}

function isMarkdownUri(uri) {
    return uri.fsPath.toLowerCase().endsWith(".md");
}

function watchRootFor(target) {
    const folder = vscode.workspace.getWorkspaceFolder(target)?.uri;
    if (folder) return folder;
    return vscode.Uri.file(path.dirname(target.fsPath));
}

function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        refreshGraph();
    }, 250);
}

function watchVault(uri, context) {
    watcher?.dispose();
    watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(uri, "**/*.md"),
    );
    watcher.onDidChange(scheduleRefresh, undefined, context.subscriptions);
    watcher.onDidCreate(scheduleRefresh, undefined, context.subscriptions);
    watcher.onDidDelete(scheduleRefresh, undefined, context.subscriptions);
    context.subscriptions.push(watcher);
}

async function chooseSelectionMode() {
    const mode = await vscode.window.showQuickPick(
        [
            {
                label: "Folder",
                description: "Use all Markdown files recursively",
                value: "folder",
            },
            {
                label: "Markdown file",
                description: "Use only first-level links from one note",
                value: "file",
            },
        ],
        {
            title: "Select Graph Source Type",
            placeHolder: "Choose what to graph",
        },
    );
    return mode?.value;
}

async function refreshGraph() {
    if (refreshInFlight) {
        refreshQueued = true;
        return refreshInFlight;
    }

    const vault = configuredVault();
    if (!vault || !panel) return;

    refreshInFlight = (async () => {
        try {
            const sourceKind = (await isDirectory(vault)) ? "folder" : "file";
            const current = await loadVault(vault);
            if (!panel) return;
            const graph = current.graph();
            console.log(
                `Refreshing graph (${sourceKind}) ${vault.fsPath} with ${graph.nodes.length} nodes`,
            );
            panel.postGraph(graph, vault.fsPath);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Obsidian Graph View could not read this vault: ${error.message}`,
            );
        } finally {
            refreshInFlight = null;
            if (refreshQueued) {
                refreshQueued = false;
                scheduleRefresh();
            }
        }
    })();

    return refreshInFlight;
}

async function chooseVault(context) {
    const selectionMode = await chooseSelectionMode();
    if (!selectionMode) return;

    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: selectionMode === "file",
        canSelectFolders: selectionMode === "folder",
        canSelectMany: false,
        filters:
            selectionMode === "file"
                ? {
                      Markdown: ["md"],
                  }
                : undefined,
        openLabel:
            selectionMode === "file" ? "Use Markdown File" : "Use Folder",
    });
    if (!selected) return;

    const target = selected[0];
    const targetIsDirectory = await isDirectory(target);
    if (!targetIsDirectory && !isMarkdownUri(target)) {
        vscode.window.showErrorMessage(
            "Please choose either a folder or a Markdown file (.md).",
        );
        return;
    }

    await vscode.workspace
        .getConfiguration("obsidianVaultGraph")
        .update("vaultPath", target.fsPath, vscode.ConfigurationTarget.Global);
    watchVault(watchRootFor(target), context);
    panel.show();
    panel.postVaultStatus(target.fsPath);
    await refreshGraph();
}

function activate(context) {
    extensionContext = context;
    panel = new GraphPanel(context.extensionUri, async (message) => {
        if (message.type === "ready" || message.type === "refresh") {
            await refreshGraph();
        } else if (message.type === "chooseVault") {
            await chooseVault(context);
        } else if (message.type === "error") {
            console.error(`Webview error: ${message.message}`);
            vscode.window.showErrorMessage(`Webview error: ${message.message}`);
        } else if (message.type === "openNote") {
            const note = index?.noteForId(message.id);
            if (note)
                await vscode.window.showTextDocument(
                    await vscode.workspace.openTextDocument(note.uri),
                );
        }
    });

    const configured = configuredVault();
    if (configured) {
        watchVault(watchRootFor(configured), context);
        loadVault(configured).catch((error) => {
            console.warn(`Could not load configured vault: ${error.message}`);
        });
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("obsidianVaultGraph.open", async () => {
            panel.show();
            if (configuredVault()) await refreshGraph();
            else await chooseVault(context);
        }),
        vscode.commands.registerCommand("obsidianVaultGraph.chooseVault", () =>
            chooseVault(context),
        ),
        vscode.commands.registerCommand(
            "obsidianVaultGraph.refresh",
            refreshGraph,
        ),
        vscode.languages.registerDocumentLinkProvider(
            {language: "markdown"},
            createWikiLinkProvider(async (uri) => {
                if (index?.contains(uri)) return index;
                const vault = configuredVault();
                if (!vault) return undefined;
                try {
                    return await loadVault(vault);
                } catch {
                    return undefined;
                }
            }),
        ),
    );
}

function deactivate() {
    clearTimeout(refreshTimer);
    watcher?.dispose();
    refreshInFlight = null;
    refreshQueued = false;
    panel = undefined;
    index = undefined;
    extensionContext = undefined;
}

module.exports = {activate, deactivate};
