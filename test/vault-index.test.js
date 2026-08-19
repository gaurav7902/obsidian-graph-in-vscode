const assert = require("assert");
const {targetFromLink, extractTargets} = require("../src/link-parser");

describe("vault-index", () => {
    describe("targetFromLink", () => {
        it("should extract simple wiki link target", () => {
            assert.strictEqual(targetFromLink("Note Name"), "Note Name");
        });

        it("should strip leading ! for embeds", () => {
            assert.strictEqual(targetFromLink("!Note Name"), "Note Name");
        });

        it("should remove display text after |", () => {
            assert.strictEqual(
                targetFromLink("Note Name|Display Text"),
                "Note Name",
            );
        });

        it("should remove heading after #", () => {
            assert.strictEqual(
                targetFromLink("Note Name#heading"),
                "Note Name",
            );
        });

        it("should handle combined | and #", () => {
            assert.strictEqual(
                targetFromLink("Note Name#heading|Display"),
                "Note Name",
            );
        });

        it("should trim whitespace", () => {
            assert.strictEqual(targetFromLink("  Note Name  "), "Note Name");
        });
    });

    describe("extractTargets", () => {
        it("should extract wiki links", () => {
            const content = "See [[Note A]] and [[Note B]] for more.";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, ["Note A", "Note B"]);
        });

        it("should skip embedded wiki links (![[...]])", () => {
            const content = "![[Embedded Image.png]] and [[Real Link]]";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, [
                "Embedded Image.png",
                "Real Link",
            ]);
        });

        it("should extract standard markdown links", () => {
            const content = "See [Link Text](./note.md) for details.";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, ["./note.md"]);
        });

        it("should skip external http/https links", () => {
            const content = "[External](https://example.com) and [[Internal]]";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, ["Internal"]);
        });

        it("should skip mailto links", () => {
            const content = "[Email](mailto:test@example.com) and [[Note]]";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, ["Note"]);
        });

        it("should skip anchor-only links", () => {
            const content = "[Section](#heading) and [[Note]]";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, ["Note"]);
        });

        it("should handle URL-encoded markdown links", () => {
            const content = "[Link](./note%20with%20spaces.md)";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, ["./note with spaces.md"]);
        });

        it("should extract multiple links of different types", () => {
            const content =
                "[[Wiki Link]] and [MD Link](./file.md) and [[Another Wiki]]";
            const targets = extractTargets(content);
            assert.deepStrictEqual(
                targets.sort(),
                ["Another Wiki", "Wiki Link", "./file.md"].sort(),
            );
        });

        it("should skip embedded markdown images", () => {
            const content = "![Image](./image.png) and [Link](./note.md)";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, ["./note.md"]);
        });

        it("should return empty array for no links", () => {
            const content = "Just plain text with no links.";
            const targets = extractTargets(content);
            assert.deepStrictEqual(targets, []);
        });
    });
});
