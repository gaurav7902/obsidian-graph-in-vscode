const vscode = require("vscode");

class GraphPanel {
    constructor(extensionUri, onMessage) {
        this.extensionUri = extensionUri;
        this.onMessage = onMessage;
        this.panel = undefined;
    }
    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(
            "obsidianVaultGraph",
            "Obsidian Vault Graph",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "media"),
                ],
            },
        );
        this.panel.webview.html = this.html(this.panel.webview);
        this.panel.webview.onDidReceiveMessage((message) =>
            this.onMessage(message),
        );
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }
    postGraph(graph, vaultPath) {
        this.panel?.webview.postMessage({type: "graph", graph, vaultPath});
    }
    html(webview) {
        const nonce = String(Date.now());
        const asset = (name) =>
            webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", name),
            );
        return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset("graph.css")}"></head><body><header><button id="chooseVault">Choose vault</button><button id="refresh">Refresh</button><button id="fit">Fit graph</button><button id="settingsButton" aria-expanded="false">Settings</button><span id="status">Choose an Obsidian vault to begin</span></header><main><canvas id="graph" tabindex="0" aria-label="Obsidian vault graph"></canvas><p id="emptyState">Select a vault folder to render its links</p></main><aside id="settings" hidden><div class="settings-header"><strong>Graph settings</strong><button id="closeSettings">← Back to graph</button></div><section><h2>Filters</h2><input id="search" type="search" placeholder="Search files"><label><input id="existing" type="checkbox"> Existing files only</label><label><input id="orphans" type="checkbox" checked> Show orphans</label></section><section><h2>Display</h2><label><input id="labels" type="checkbox" checked> Show labels</label><label><input id="arrows" type="checkbox"> Show arrows</label><label>Node size<input id="nodeSize" type="range" min="50" max="180" value="100"></label><label>Link thickness<input id="linkWidth" type="range" min="50" max="250" value="100"></label></section><section><h2>Forces</h2><label>Center force<input id="centerForce" type="range" min="0" max="100" value="28"></label><label>Repel force<input id="repelForce" type="range" min="20" max="180" value="85"></label><label>Link force<input id="linkForce" type="range" min="10" max="120" value="45"></label><label>Link distance<input id="linkDistance" type="range" min="40" max="220" value="100"></label></section><button id="reset">Restore default settings</button><p class="help">Scroll to zoom. Drag the background to pan. Drag a note to reposition it. Click a note to open it.</p></aside><script nonce="${nonce}" src="${asset("d3.min.js")}"></script><script nonce="${nonce}" src="${asset("graph.js")}"></script></body></html>`;
    }
}

module.exports = {GraphPanel};
