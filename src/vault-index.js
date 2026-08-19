const path = require("path");
const vscode = require("vscode");

const decoder = new TextDecoder("utf-8");

const DEFAULT_EXCLUDED_DIRECTORIES = [".git", ".obsidian", "node_modules"];

/**
 * Gets the set of directories to exclude from vault scanning.
 * Combines default exclusions with user-configured additional exclusions.
 * @returns {Set<string>} Set of directory names to exclude
 */
function getExcludedDirectories() {
    const config = require("vscode")
        .workspace.getConfiguration("obsidianVaultGraph")
        .get("excludeDirectories");
    if (!config || !Array.isArray(config) || config.length === 0) {
        return new Set(DEFAULT_EXCLUDED_DIRECTORIES);
    }
    return new Set([...DEFAULT_EXCLUDED_DIRECTORIES, ...config]);
}

/**
 * Extracts the target note path from a wiki link value.
 * Strips embed prefix, display text, and heading references.
 * @param {string} value - The raw link text from inside [[...]]
 * @returns {string} The cleaned target path
 * @example
 * targetFromLink("Note Name") // "Note Name"
 * targetFromLink("Note Name|Display") // "Note Name"
 * targetFromLink("Note Name#heading") // "Note Name"
 */
function targetFromLink(value) {
    return value.trim().replace(/^!/, "").split("|")[0].split("#")[0].trim();
}

/**
 * Extracts all link targets from Markdown content.
 * Handles both Obsidian-style [[WikiLinks]] and standard [text](path) links.
 * Skips external URLs, mailto links, and anchor-only links.
 * @param {string} content - The Markdown file content
 * @returns {string[]} Array of target paths/identifiers
 */
function extractTargets(content) {
    const targets = [];
    for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g))
        targets.push(targetFromLink(match[1]));
    for (const match of content.matchAll(
        /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g,
    )) {
        if (/^(?:https?:|mailto:|#)/i.test(match[1])) continue;
        try {
            targets.push(targetFromLink(decodeURIComponent(match[1])));
        } catch {
            targets.push(targetFromLink(match[1]));
        }
    }
    return targets.filter(Boolean);
}

const MAX_FILES_DEFAULT = 10000;

/**
 * Recursively collects all Markdown files in a directory.
 * Respects exclusion rules and file limits from configuration.
 * @param {vscode.Uri} root - The root directory to scan
 * @param {vscode.CancellationToken} [token] - Optional cancellation token
 * @returns {Promise<{files: vscode.Uri[], truncated: boolean}>} Array of file URIs and truncation flag
 */
async function collectMarkdownFiles(root, token) {
    const config =
        require("vscode").workspace.getConfiguration("obsidianVaultGraph");
    const maxFiles = config.get("maxFiles") || MAX_FILES_DEFAULT;
    const excludedDirectories = getExcludedDirectories();
    const result = [];
    let cancelled = false;

    async function visit(folder) {
        if (cancelled || (token && token.isCancellationRequested)) {
            cancelled = true;
            return;
        }
        if (result.length >= maxFiles) {
            return;
        }
        try {
            const entries = await vscode.workspace.fs.readDirectory(folder);
            await Promise.all(
                entries.map(async ([name, type]) => {
                    if (cancelled || result.length >= maxFiles) return;
                    const item = vscode.Uri.joinPath(folder, name);
                    if (
                        type === vscode.FileType.Directory &&
                        !excludedDirectories.has(name)
                    )
                        return visit(item);
                    if (
                        type === vscode.FileType.File &&
                        name.toLowerCase().endsWith(".md")
                    )
                        result.push(item);
                }),
            );
        } catch (error) {
            console.error(
                `Could not read directory ${folder.fsPath}: ${error.message}`,
            );
        }
    }
    await visit(root);
    return {files: result, truncated: result.length >= maxFiles};
}

/**
 * Computes the relative path of a note from the vault root.
 * @param {vscode.Uri} root - The vault root URI
 * @param {vscode.Uri} uri - The note file URI
 * @returns {string} Relative path with forward slashes
 */
function notePath(root, uri) {
    return path.relative(root.fsPath, uri.fsPath).replace(/\\/g, "/");
}

/**
 * Creates a graph node representation for a note.
 * @param {{path: string}} note - The note object with path property
 * @returns {{id: string, label: string, folder: string, missing: boolean}} Node object
 */
function nodeForNote(note) {
    return {
        id: note.path,
        label: path.posix.basename(note.path).replace(/\.md$/i, ""),
        folder: path.posix.dirname(note.path.replace(/\\/g, "/")),
        missing: false,
    };
}

const contentCache = new Map();
const CACHE_MAX_SIZE = 500;

/**
 * Retrieves cached file content if available.
 * @param {vscode.Uri} uri - The file URI
 * @returns {string|undefined} Cached content or undefined
 */
function getCachedContent(uri) {
    const key = uri.toString();
    return contentCache.get(key);
}

/**
 * Caches file content with LRU eviction.
 * @param {vscode.Uri} uri - The file URI
 * @param {string} content - The file content to cache
 */
function setCachedContent(uri, content) {
    const key = uri.toString();
    if (contentCache.size >= CACHE_MAX_SIZE) {
        const firstKey = contentCache.keys().next().value;
        contentCache.delete(firstKey);
    }
    contentCache.set(key, content);
}

/**
 * Clears the content cache.
 */
function clearCache() {
    contentCache.clear();
}

/**
 * Index of a vault's notes and their link relationships.
 * Provides methods to resolve links and generate graph data.
 */
class VaultIndex {
    /**
     * Loads a vault index from a folder or single Markdown file.
     * @param {vscode.Uri} target - Folder URI or Markdown file URI
     * @returns {Promise<VaultIndex>} The loaded index
     * @throws {Error} If target is not a valid Markdown file
     */
    static async load(target) {
        const stat = await vscode.workspace.fs.stat(target);
        if (stat.type === vscode.FileType.File) {
            if (!target.fsPath.toLowerCase().endsWith(".md"))
                throw new Error("Please choose a Markdown file (.md).");
            return VaultIndex.loadFocused(target);
        }

        const root = target;
        const {files, truncated} = await collectMarkdownFiles(root);
        if (truncated) {
            console.warn(`Vault truncated at file limit`);
        }
        const notes = await Promise.all(
            files.map(async (uri) => {
                let content = getCachedContent(uri);
                if (!content) {
                    content = decoder.decode(
                        await vscode.workspace.fs.readFile(uri),
                    );
                    setCachedContent(uri, content);
                }
                return {
                    uri,
                    path: notePath(root, uri),
                    content,
                };
            }),
        );
        return new VaultIndex(root, notes);
    }

    /**
     * Loads a focused graph centered on a single note.
     * Shows the note, its outgoing links, and incoming backlinks.
     * @param {vscode.Uri} fileUri - The Markdown file to focus on
     * @returns {Promise<VaultIndex>} The loaded index with focusedPath set
     */
    static async loadFocused(fileUri) {
        const workspaceFolder =
            vscode.workspace.getWorkspaceFolder(fileUri)?.uri;
        const root =
            workspaceFolder || vscode.Uri.file(path.dirname(fileUri.fsPath));
        const {files} = await collectMarkdownFiles(root);
        const notes = await Promise.all(
            files.map(async (uri) => {
                let content = getCachedContent(uri);
                if (!content) {
                    content = decoder.decode(
                        await vscode.workspace.fs.readFile(uri),
                    );
                    setCachedContent(uri, content);
                }
                return {
                    uri,
                    path: notePath(root, uri),
                    content,
                };
            }),
        );
        return new VaultIndex(root, notes, {
            focusedPath: notePath(root, fileUri),
        });
    }

    /**
     * Creates a new VaultIndex.
     * @param {vscode.Uri} root - The vault root URI
     * @param {Array<{uri: vscode.Uri, path: string, content: string}>} notes - Array of note objects
     * @param {{focusedPath?: string}} [options] - Optional configuration
     */
    constructor(root, notes, options = {}) {
        this.root = root;
        this.notes = notes;
        this.focusedPath = options.focusedPath;
        this.byPath = new Map();
        this.byBasename = new Map();
        for (const note of notes) {
            const withoutExtension = note.path.replace(/\.md$/i, "");
            this.byPath.set(note.path.toLowerCase(), note);
            this.byPath.set(withoutExtension.toLowerCase(), note);
            const basename = path.posix
                .basename(withoutExtension)
                .toLowerCase();
            if (!this.byBasename.has(basename))
                this.byBasename.set(basename, note);
        }
    }

    /**
     * Checks if a URI is within this vault.
     * @param {vscode.Uri} uri - The URI to check
     * @returns {boolean} True if the URI is inside the vault
     */
    contains(uri) {
        const relative = path.relative(this.root.fsPath, uri.fsPath);
        return !relative.startsWith("..") && !path.isAbsolute(relative);
    }

    /**
     * Resolves a link target to its corresponding note.
     * Handles relative paths, folder-qualified links, and unqualified note names.
     * @param {vscode.Uri} sourceUri - The URI of the note containing the link
     * @param {string} target - The link target text
     * @returns {{uri: vscode.Uri, path: string}|undefined} The resolved note or undefined
     */
    resolve(sourceUri, target) {
        if (!this.contains(sourceUri)) return undefined;
        const source = path
            .relative(this.root.fsPath, sourceUri.fsPath)
            .replace(/\\/g, "/");
        const cleaned = targetFromLink(target);
        const directory = path.posix.dirname(source);
        const relativeTarget = path.posix
            .normalize(
                path.posix.join(directory === "." ? "" : directory, cleaned),
            )
            .replace(/^\.\//, "");
        return (
            this.byPath.get(relativeTarget.toLowerCase()) ||
            this.byPath.get(cleaned.toLowerCase()) ||
            this.byBasename.get(
                path.posix
                    .basename(cleaned)
                    .replace(/\.md$/i, "")
                    .toLowerCase(),
            )
        );
    }

    /**
     * Generates graph data with nodes and edges.
     * If focusedPath is set, returns a focused graph; otherwise full vault graph.
     * @returns {{nodes: Array, edges: Array}} Graph data structure
     */
    graph() {
        if (this.focusedPath) return this.focusedGraph();

        const nodes = new Map(
            this.notes.map((note) => [note.path, nodeForNote(note)]),
        );
        const edges = new Map();
        for (const note of this.notes)
            for (const target of extractTargets(note.content)) {
                const resolved = this.resolve(note.uri, target);
                const id = resolved ? resolved.path : `missing:${target}`;
                if (!nodes.has(id))
                    nodes.set(id, {
                        id,
                        label: target,
                        missing: true,
                        folder: ".",
                    });
                edges.set(`${note.path}\u0000${id}`, {
                    source: note.path,
                    target: id,
                });
            }
        return {nodes: [...nodes.values()], edges: [...edges.values()]};
    }

    /**
     * Generates a focused graph for a single note.
     * Includes the note, its outgoing links, and backlinks.
     * @returns {{nodes: Array, edges: Array}} Graph data structure
     */
    focusedGraph() {
        const source = this.noteForId(this.focusedPath);
        if (!source) return {nodes: [], edges: []};

        const nodes = new Map([[source.path, nodeForNote(source)]]);
        const edges = new Map();

        for (const target of extractTargets(source.content)) {
            const resolved = this.resolve(source.uri, target);
            const id = resolved ? resolved.path : `missing:${target}`;
            if (!nodes.has(id)) {
                nodes.set(
                    id,
                    resolved
                        ? nodeForNote(resolved)
                        : {
                              id,
                              label: target,
                              missing: true,
                              folder: ".",
                          },
                );
            }
            edges.set(`${source.path}\u0000${id}`, {
                source: source.path,
                target: id,
            });
        }

        for (const note of this.notes) {
            if (note.path === source.path) continue;
            for (const target of extractTargets(note.content)) {
                const resolved = this.resolve(note.uri, target);
                if (resolved && resolved.path === source.path) {
                    if (!nodes.has(note.path)) {
                        nodes.set(note.path, nodeForNote(note));
                    }
                    edges.set(`${note.path}\u0000${source.path}`, {
                        source: note.path,
                        target: source.path,
                    });
                    break;
                }
            }
        }

        return {nodes: [...nodes.values()], edges: [...edges.values()]};
    }

    /**
     * Retrieves a note by its path identifier.
     * @param {string} id - The note path (with or without .md extension)
     * @returns {{uri: vscode.Uri, path: string, content: string}|undefined} The note or undefined
     */
    noteForId(id) {
        return this.byPath.get(id.toLowerCase());
    }
}

module.exports = {VaultIndex, clearCache, targetFromLink, extractTargets};
