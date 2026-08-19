const vscode = require("vscode");

class GraphPanel {
    constructor(extensionUri, onMessage) {
        this.extensionUri = extensionUri;
        this.onMessage = onMessage;
        this.panel = undefined;
        this.ready = false;
        this.pendingMessages = [];
    }
    flushPending() {
        if (!this.panel || !this.ready) return;
        while (this.pendingMessages.length > 0) {
            const message = this.pendingMessages.shift();
            this.panel.webview.postMessage(message);
        }
    }
    show() {
        if (this.panel) return this.panel.reveal();
        this.panel = vscode.window.createWebviewPanel(
            "obsidianVaultGraph",
            "Obsidian Graph View",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "media"),
                ],
            },
        );
        this.panel.webview.html = this.html(this.panel.webview);
        this.panel.webview.onDidReceiveMessage((message) => {
            if (message.type === "ready") {
                this.ready = true;
                this.flushPending();
            }
            this.onMessage(message);
        });
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.ready = false;
            this.pendingMessages = [];
        });
    }
    postGraph(graph, vaultPath) {
        const message = {type: "graph", graph, vaultPath};
        if (!this.panel) return;
        if (!this.ready) {
            this.pendingMessages.push(message);
            return;
        }
        this.panel.webview.postMessage(message);
    }
    postVaultStatus(vaultPath) {
        const message = {type: "vaultStatus", vaultPath};
        if (!this.panel) return;
        if (!this.ready) {
            this.pendingMessages.push(message);
            return;
        }
        this.panel.webview.postMessage(message);
    }
    html(webview) {
        const nonce = String(Date.now());
        const asset = (name) =>
            webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", name),
            );
        return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'unsafe-eval';"><link rel="stylesheet" href="${asset("graph.css")}"></head><body><header><button id="chooseVault" class="toolbar-btn"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.5 3.5h4l1.2 1.5H14.5v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a.5.5 0 0 1 .5-.5z"/></svg><span>Choose source</span></button><button id="refresh" class="toolbar-btn"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8A5.5 5.5 0 1 1 11.8 4"/><path d="M13.5 2.5v3.5H10"/></svg><span>Refresh</span></button><button id="fit" class="toolbar-btn"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H2v4M10 14h4v-4M2 10v4h4M14 6V2h-4"/></svg><span>Fit graph</span></button><button id="animate" type="button" class="toolbar-btn"><svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" stroke="none"><path d="M4 2.5v11l9-5.5-9-5.5z"/></svg><span>Animate</span></button><span class="toolbar-divider"></span><button id="settingsButton" class="toolbar-btn" aria-expanded="false"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2 4h6M11.6 4H14M2 8h1.6M6.4 8H14M2 12h8M11.6 12H14"/><circle cx="8.4" cy="4" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="9.6" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg><span>Settings</span></button><span id="status" class="status-pill"><span class="status-dot"></span><span id="statusText">No source selected</span></span></header><main><div id="graph" tabindex="0" aria-label="Obsidian vault graph"></div><div id="emptyState"><div class="empty-icon"><svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="32" y1="18" x2="16" y2="34"/><line x1="32" y1="18" x2="48" y2="30"/><line x1="16" y1="34" x2="24" y2="50"/><line x1="48" y1="30" x2="40" y2="48"/><line x1="24" y1="50" x2="40" y2="48"/><circle cx="32" cy="18" r="4" fill="currentColor" stroke="none"/><circle cx="16" cy="34" r="3" fill="currentColor" stroke="none"/><circle cx="48" cy="30" r="3" fill="currentColor" stroke="none"/><circle cx="24" cy="50" r="2.5" fill="currentColor" stroke="none"/><circle cx="40" cy="48" r="2.5" fill="currentColor" stroke="none"/></svg></div><p id="emptyStateText">No source selected. Choose an Obsidian vault folder to render its links.</p><button id="emptyChooseVault" class="primary-btn"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.5 3.5h4l1.2 1.5H14.5v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a.5.5 0 0 1 .5-.5z"/></svg><span>Choose source</span></button></div></main><aside id="settings" class="settings-closed"><div class="settings-header"><strong>Graph settings</strong><button id="closeSettings" class="icon-btn" aria-label="Close settings" title="Close settings"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div><section><h2>Filters</h2><input id="search" type="search" placeholder="Search files"><label><input id="existing" type="checkbox"> Existing files only</label><label><input id="orphans" type="checkbox" checked> Show orphans</label></section><section><h2>Display</h2><label><input id="arrows" type="checkbox"> Arrows</label><label><input id="labels" type="checkbox" checked> Show labels</label><label>Text fade threshold<input id="textFadeThreshold" type="range" min="-3" max="3" step="0.1" value="0"><output id="textFadeThresholdValue" for="textFadeThreshold" class="range-value">0</output></label><label>Node size<input id="nodeSize" type="range" min="50" max="180" value="50"><output id="nodeSizeValue" for="nodeSize" class="range-value">50</output></label><label>Link thickness<input id="linkWidth" type="range" min="50" max="250" value="50"><output id="linkWidthValue" for="linkWidth" class="range-value">50</output></label><label>Highlight color<input id="highlightColor" type="color" value="#ffffff"></label></section><section><h2>Forces</h2><label>Center force<input id="centerForce" type="range" min="0" max="100" value="8"><output id="centerForceValue" for="centerForce" class="range-value">8</output></label><label>Repel force<input id="repelForce" type="range" min="0" max="180" value="100"><output id="repelForceValue" for="repelForce" class="range-value">100</output></label><label>Link force<input id="linkForce" type="range" min="0" max="100" value="30"><output id="linkForceValue" for="linkForce" class="range-value">30</output></label><label>Link distance<input id="linkDistance" type="range" min="40" max="320" value="300"><output id="linkDistanceValue" for="linkDistance" class="range-value">300</output></label><label>Damping<input id="velocityDecay" type="range" min="0.1" max="0.9" step="0.05" value="0.4"><output id="velocityDecayValue" for="velocityDecay" class="range-value">0.4</output></label></section><button id="reset"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.9-4.1"/><path d="M2 2.5v3.5h3.5"/></svg><span>Restore default settings</span></button><p class="help">Scroll to zoom. Drag the background to pan. Drag a note to reposition it. Click a note to open it. Arrows show link direction. Animate replays notes appearing one by one.</p></aside><script nonce="${nonce}" src="${asset("pixi.min.js")}"></script><script nonce="${nonce}" src="${asset("d3.min.js")}"></script><script nonce="${nonce}" src="${asset("graph.js")}"></script></body></html>`;
    }
}

module.exports = {GraphPanel};
