import {describe, it} from "node:test";
import * as assert from "node:assert/strict";
import {replaceFullWidthMarkdownSuffix, toHalfWidthMarkdownPunctuation} from "./fullWidthMarkdown";

describe("toHalfWidthMarkdownPunctuation", () => {
    it("maps markdown trigger punctuation and leaves Chinese sentence punctuation unchanged", () => {
        assert.equal(toHalfWidthMarkdownPunctuation(
            "\uFF5C\uFF1D\uFF5E\u301C\uFF40\uFF03\uFF0A\uFF0D\uFF3F\uFF0B\uFF04\uFF3E\uFF3C\uFF1C\uFF1E\uFF3B\uFF3D\uFF5B\uFF5D\uFF06\uFF0F\uFF0E"),
        "|=~~`#*-_+$^\\<>[]{}&/.");
        assert.equal(toHalfWidthMarkdownPunctuation("你好，世界：结束？！（括号）"), "你好，世界：结束？！（括号）");
        assert.equal(toHalfWidthMarkdownPunctuation("a|b"), "a|b");
        assert.equal(toHalfWidthMarkdownPunctuation(""), "");
    });
});

describe("replaceFullWidthMarkdownSuffix", () => {
    it("rewrites only the just inserted full-width suffix", () => {
        assert.deepEqual(replaceFullWidthMarkdownSuffix("你好｜", 3, "｜"), {text: "你好|", offset: 3});
        assert.deepEqual(replaceFullWidthMarkdownSuffix("＝＝text", 2, "＝＝"), {text: "==text", offset: 2});
        assert.equal(replaceFullWidthMarkdownSuffix("已有｜x", 3, "x"), undefined);
        assert.equal(replaceFullWidthMarkdownSuffix("｜", 1, "＝"), undefined);
        assert.equal(replaceFullWidthMarkdownSuffix("｜", 0, "｜"), undefined);
    });
});
