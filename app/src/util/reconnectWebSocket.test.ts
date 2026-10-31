import * as assert from "node:assert/strict";
import {test} from "node:test";
import {ScriptTarget} from "typescript";
import {compileModule, evaluateModule} from "../testSupport/loadModule";

const source = compileModule("src/util/reconnectWebSocket.ts", ScriptTarget.ES2021);

const load = (hidden = true) => {
    const visits: string[] = [];
    const listeners: Array<() => void> = [];
    const reconnectable = (name: string) => ({reconnectIfNeeded: () => visits.push(name)});
    const document = {
        hidden,
        addEventListener: (name: string, handler: () => void) => {
            assert.equal(name, "visibilitychange");
            listeners.push(handler);
        },
    };
    const api = evaluateModule<typeof import("./reconnectWebSocket")>(source, {
        require: (name: string) => {
            if (name === "../layout/getAll") {
                return {
                    getAllEditor: () => [{protyle: {ws: reconnectable("editor")}}],
                    getAllModels: () => ({files: [reconnectable("files")]}),
                };
            }
            throw new Error(name);
        },
        window: {
            siyuan: {
                ws: reconnectable("main"),
                mobile: {docks: {file: reconnectable("file")}},
            },
        },
        document,
        console,
    });
    return {api, visits, listeners, document};
};

test("foreground reconnect visits the main, dock and editor sockets", () => {
    const {api, visits} = load();
    api.reconnectKernelWebSockets();
    assert.deepEqual(visits, ["main", "file", "editor", "files"]);
});

test("visibilitychange reconnects after returning from the background", () => {
    const {api, visits, listeners, document} = load(true);
    api.installKernelReconnectOnForeground();
    assert.equal(listeners.length, 1);
    visits.length = 0;
    listeners[0]();
    assert.deepEqual(visits, []);
    document.hidden = false;
    listeners[0]();
    assert.deepEqual(visits, ["main", "file", "editor", "files"]);
});
