import {describe, it} from "node:test";
import * as assert from "node:assert/strict";
import {applyAndroidSystemBarInsets} from "./androidSystemBars";

const createRoot = () => {
    const properties: Record<string, string> = {};
    const attributes: Record<string, string> = {};
    return {
        style: {
            getPropertyValue: (name: string) => properties[name] || "",
            setProperty: (name: string, value: string) => {
                properties[name] = value;
            },
        },
        hasAttribute: (name: string) => Object.prototype.hasOwnProperty.call(attributes, name),
        setAttribute: (name: string, value: string) => {
            attributes[name] = value;
        },
        attributes,
        properties,
    };
};

describe("applyAndroidSystemBarInsets", () => {
    it("writes CSS pixels and marks the document for Android system bars", () => {
        const root = createRoot();
        Object.defineProperty(globalThis, "document", {configurable: true, value: {documentElement: root}});

        applyAndroidSystemBarInsets({top: 0, right: 0, bottom: 24, left: 16});

        assert.equal(root.properties["--sy-android-safe-area-inset-bottom"], "24px");
        assert.equal(root.properties["--sy-android-safe-area-inset-left"], "16px");
        assert.equal(root.properties["--sy-android-safe-area-inset-right"], "0px");
        assert.equal(root.properties["--sy-android-safe-area-inset-top"], "0px");
        assert.equal(root.attributes["data-android-system-bars"], "1");
    });

    it("ignores invalid inset payloads", () => {
        const root = createRoot();
        Object.defineProperty(globalThis, "document", {configurable: true, value: {documentElement: root}});

        applyAndroidSystemBarInsets({top: 0, right: 0, bottom: -1, left: 0});
        applyAndroidSystemBarInsets({top: Number.NaN, right: 0, bottom: 12, left: 0});

        assert.equal(Object.keys(root.properties).length, 0);
        assert.equal(root.hasAttribute("data-android-system-bars"), false);
    });
});
