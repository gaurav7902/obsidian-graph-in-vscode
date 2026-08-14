const path = require("path");
const vscode = require("vscode");
const {GraphPanel} = require("./graph-panel");
const {VaultIndex} = require("./vault-index");
const {createWikiLinkProvider} = require("./wiki-links");

let index;
let panel;
let watcher;
let refreshTimer;

function configuredVault() {
    const value = vscode.workspace
        .getConfiguration("obsidianVaultGraph")
        .get("vaultPath");
    return value ? vscode.Uri.file(value) : undefined;
}

async function loadVault(uri) {
    index = await VaultIndex.load(uri);
    return index;
}

function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshGraph(), 250);
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

async function refreshGraph() {
    const vault = configuredVault();
    if (!vault || !panel) return;
    try {
        const current = await loadVault(vault);
        panel.postGraph(current.graph(), vault.fsPath);
    } catch (error) {
        vscode.window.showErrorMessage(
            `Obsidian Vault Graph could not read this vault: ${error.message}`,
        );
    }
}

async function chooseVault(context) {
    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Use as Obsidian vault",
    });
    if (!selected) return;
    await vscode.workspace
        .getConfiguration("obsidianVaultGraph")
        .update(
            "vaultPath",
            selected[0].fsPath,
            vscode.ConfigurationTarget.Global,
        );
    watchVault(selected[0], context);
    panel.show();
    await refreshGraph();
}

function activate(context) {
    panel = new GraphPanel(context.extensionUri, async (message) => {
        if (message.type === "ready" || message.type === "refresh")
            await refreshGraph();
        if (message.type === "chooseVault") await chooseVault(context);
        if (message.type === "openNote") {
            const note = index?.noteForId(message.id);
            if (note)
                await vscode.window.showTextDocument(
                    await vscode.workspace.openTextDocument(note.uri),
                );
        }
    });
    const configured = configuredVault();
    if (configured) {
        watchVault(configured, context);
        loadVault(configured).catch(() => undefined);
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
                if (!vault || !uri.fsPath.startsWith(vault.fsPath))
                    return undefined;
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
    watcher?.dispose();
}
module.exports = {activate, deactivate};
