/**
 * Pure functions for link parsing - no vscode dependency.
 * These are exported separately for testing.
 */

/**
 * Extracts the target note path from a wiki link value.
 * Strips embed prefix, display text, and heading references.
 * @param {string} value - The raw link text from inside [[...]]
 * @returns {string} The cleaned target path
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

module.exports = {targetFromLink, extractTargets};
