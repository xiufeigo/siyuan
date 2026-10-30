import {describe, it} from "node:test";
import * as assert from "node:assert/strict";
import {consumeAndroidEscapeBack, isPlainEscapeKey, markAndroidEscapeBack} from "./androidEscape";

const escapeKey = (overrides: Partial<KeyboardEvent> = {}) => ({
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
});

describe("isPlainEscapeKey", () => {
    it("accepts plain Escape from key, code or keyCode", () => {
        assert.equal(isPlainEscapeKey(escapeKey()), true);
        assert.equal(isPlainEscapeKey(escapeKey({key: "Esc"})), true);
        assert.equal(isPlainEscapeKey(escapeKey({key: "Unidentified", code: ""})), true);
        assert.equal(isPlainEscapeKey(escapeKey({key: "Unidentified", code: "", keyCode: 0})), false);
    });

    it("ignores modified and composing Escape", () => {
        for (const overrides of [{ctrlKey: true}, {metaKey: true}, {altKey: true}, {shiftKey: true}, {isComposing: true}]) {
            assert.equal(isPlainEscapeKey(escapeKey(overrides)), false);
        }
    });
});

describe("consumeAndroidEscapeBack", () => {
    it("suppresses back only inside the window opened by Escape", () => {
        markAndroidEscapeBack(1_000);
        assert.equal(consumeAndroidEscapeBack(1_000), true);
        assert.equal(consumeAndroidEscapeBack(1_300), true);
        assert.equal(consumeAndroidEscapeBack(1_301), false);
    });
});
