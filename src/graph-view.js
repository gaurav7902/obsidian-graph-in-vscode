const {GraphWebviewController} = require("./graph-webview");

class GraphView {
    constructor(extensionUri, onMessage) {
        this.controller = new GraphWebviewController(extensionUri, onMessage);
        this.disposables = [];
    }

    resolveWebviewView(webviewView) {
        this.controller.resolve(webviewView.webview, this.disposables);
        webviewView.onDidDispose(() => {
            this.controller.webview = undefined;
            this.controller.ready = false;
            this.controller.pendingMessages = [];
            this.disposables.forEach((d) => d.dispose());
            this.disposables = [];
        });
    }

    postGraph(graph, vaultPath) {
        this.controller.postGraph(graph, vaultPath);
    }

    postVaultStatus(vaultPath) {
        this.controller.postVaultStatus(vaultPath);
    }
}

module.exports = {GraphView};
