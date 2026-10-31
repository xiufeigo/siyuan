import * as assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {dirname, join} from "node:path";
import {describe, it} from "node:test";
import {fileURLToPath} from "node:url";
import {
    canonicalizeProviderBaseURL,
    findProviderPreset,
    getDefaultProviderProtocol,
    getProviderProtocolBaseURL,
    getResponsesSupport,
    PROVIDER_PRESETS,
    resolveConfiguredProviderBaseURL,
} from "./aiProviderPresets";

describe("AI provider presets", () => {
    it("switches Gemini native and compatible endpoints while preserving the existing default", () => {
        const compatible = "https://generativelanguage.googleapis.com/v1beta/openai";
        const native = "https://generativelanguage.googleapis.com/v1beta";
        assert.equal(getDefaultProviderProtocol("gemini"), "openai");
        assert.equal(getProviderProtocolBaseURL(compatible, "gemini-interactions"), native);
        assert.equal(findProviderPreset(native + "/")?.id, "gemini");
        assert.equal(getProviderProtocolBaseURL(native, "openai"), compatible);
        for (const custom of [native + "?route=custom", "https://gateway.example.com/v1beta"]) {
            assert.equal(getProviderProtocolBaseURL(custom, "gemini-interactions"), custom);
            assert.equal(getProviderProtocolBaseURL(custom, "openai"), custom);
        }
    });

    it("uses the current MiniMax China endpoint for newly created providers", () => {
        const preset = PROVIDER_PRESETS.find((item) => item.id === "minimax-cn");
        assert.equal(preset?.baseURL, "https://api.minimax.cn/v1");
        assert.equal(findProviderPreset("https://api.minimax.cn/v1/")?.id, "minimax-cn");
        assert.equal(findProviderPreset("https://api.minimaxi.com/v1"), undefined);
    });

    it("defaults OpenAI and ChatGPT account presets to Responses", () => {
        assert.equal(getDefaultProviderProtocol("openai"), "openai-responses");
        assert.equal(getDefaultProviderProtocol("chatgpt"), "openai-responses");
        assert.equal(PROVIDER_PRESETS.find(item => item.id === "chatgpt")?.authType, "chatgpt");
        assert.equal(findProviderPreset("https://api.openai.com/v1")?.id, "openai");
        assert.equal(getDefaultProviderProtocol("deepseek"), "openai");
        assert.equal(getDefaultProviderProtocol("custom"), "openai");
    });

    it("selects Messages for the Anthropic preset without changing custom provider defaults", () => {
        assert.equal(getDefaultProviderProtocol("anthropic"), "anthropic-messages");
        assert.equal(findProviderPreset("https://api.anthropic.com/v1/")?.id, "anthropic");
        assert.equal(getResponsesSupport("https://api.anthropic.com/v1"), "unsupported");
        assert.equal(getDefaultProviderProtocol("custom"), "openai");
        assert.equal(getDefaultProviderProtocol("openai"), "openai-responses");
    });

    it("reports known and custom Responses compatibility", () => {
        assert.equal(getResponsesSupport("https://api.deepseek.com"), "supported");
        assert.equal(getResponsesSupport("https://open.bigmodel.cn/api/paas/v4"), "unsupported");
        assert.equal(getResponsesSupport("https://example.com/v1"), "experimental");
    });

    it("switches DeepSeek standard endpoints with the selected protocol", () => {
        for (const baseURL of [
            "https://api.deepseek.com", "https://api.deepseek.com/v1/",
            "https://api.deepseek.com/anthropic", "https://api.deepseek.com/anthropic/v1/",
        ]) {
            assert.equal(findProviderPreset(baseURL)?.id, "deepseek");
            assert.equal(getProviderProtocolBaseURL(baseURL, "anthropic-messages"), "https://api.deepseek.com/anthropic");
            assert.equal(getProviderProtocolBaseURL(baseURL, "openai"), "https://api.deepseek.com");
            assert.equal(getProviderProtocolBaseURL(baseURL, "openai-responses"), "https://api.deepseek.com");
            assert.equal(getProviderProtocolBaseURL(baseURL, "unknown"), baseURL);
        }
    });

    it("round-trips provider protocols without changing regions", () => {
        for (const [id, openai, anthropic] of [
            ["moonshot", "https://api.moonshot.cn/v1", "https://api.moonshot.cn/anthropic"],
            ["minimax", "https://api.minimax.io/v1", "https://api.minimax.io/anthropic"],
            ["minimax-cn", "https://api.minimax.cn/v1", "https://api.minimax.cn/anthropic"],
            ["xiaomi-mimo", "https://api.xiaomimimo.com/v1", "https://api.xiaomimimo.com/anthropic"],
            ["aliyun", "https://dashscope.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com/apps/anthropic"],
            ["aliyun-intl", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "https://dashscope-intl.aliyuncs.com/apps/anthropic"],
        ]) {
            assert.equal(getProviderProtocolBaseURL(openai, "anthropic-messages"), anthropic);
            for (const baseURL of [anthropic, anthropic + "/v1/"]) {
                assert.equal(findProviderPreset(baseURL)?.id, id);
                assert.equal(getProviderProtocolBaseURL(baseURL, "openai"), openai);
                assert.equal(getProviderProtocolBaseURL(baseURL, "openai-responses"), openai);
            }
            for (const baseURL of [anthropic + "?route=custom", anthropic + "/custom"]) {
                assert.equal(getProviderProtocolBaseURL(baseURL, "openai"), baseURL);
            }
        }
    });

    it("preserves custom endpoints and providers without protocol-specific addresses", () => {
        for (const baseURL of [
            "https://gateway.example.com/deepseek/v1", "https://api.deepseek.com/custom",
            "https://api.deepseek.com?route=custom", "https://api.deepseek.com/anthropic?route=custom",
            "https://api.deepseek.com.example.com", "https://api.openai.com/v1",
        ]) {
            assert.equal(getProviderProtocolBaseURL(baseURL, "anthropic-messages"), baseURL);
        }
    });

    it("recognizes token-plan and OpenAI-compatible subscription endpoints", () => {
        const cases: Array<[string, string]> = [
            ["kimi-code", "https://api.kimi.com/coding/v1"],
            ["kimi-code", "https://api.kimi.com/coding/v1/"],
            ["kimi-code", "https://api.kimi.ai/coding/v1"],
            ["kimi-code", "https://api.kimi.com/coding"],
            ["xiaomi-mimo-token-plan", "https://token-plan-cn.xiaomimimo.com/v1"],
            ["xiaomi-mimo-token-plan", "https://token-plan-cn.xiaomimimo.com/anthropic"],
            ["xiaomi-mimo-token-plan", "https://token-plan-sgp.xiaomimimo.com/v1"],
            ["xiaomi-mimo", "https://api.xiaomimimo.com/v1"],
            ["step-plan", "https://api.stepfun.com/step_plan/v1"],
            ["step-plan", "https://api.stepfun.com/step_plan"],
            ["step-plan", "https://api.stepfun.ai/step_plan/v1"],
            ["opencode-go", "https://opencode.ai/zen/go/v1"],
            ["opencode-go", "https://opencode.ai/zen/go/v1/chat/completions"],
            ["opencode-go", "https://opencode.ai/inference/go/v1"],
            ["command-code", "https://api.commandcode.ai/provider/v1"],
            ["command-code", "https://api.commandcode.ai/provider/v1/chat/completions"],
            ["open-design", "https://amr-link.open-design.ai/v1"],
            ["open-design", "https://amr-link.open-design.ai"],
        ];
        for (const [id, baseURL] of cases) {
            assert.equal(findProviderPreset(baseURL)?.id, id, baseURL);
        }
        assert.equal(findProviderPreset("https://api.moonshot.cn/v1")?.id, "moonshot");
        assert.notEqual(findProviderPreset("https://api.kimi.com/coding/v1")?.id, "moonshot");
    });

    it("canonicalizes pasted chat-completions endpoints without changing other bases", () => {
        assert.equal(
            canonicalizeProviderBaseURL("https://opencode.ai/zen/go/v1/chat/completions/"),
            "https://opencode.ai/zen/go/v1",
        );
        assert.equal(
            canonicalizeProviderBaseURL("https://api.commandcode.ai/provider/v1/chat/completions"),
            "https://api.commandcode.ai/provider/v1",
        );
        assert.equal(
            canonicalizeProviderBaseURL("https://api.kimi.com/coding/v1"),
            "https://api.kimi.com/coding/v1",
        );
        assert.equal(
            resolveConfiguredProviderBaseURL("https://opencode.ai/zen/go/v1/chat/completions"),
            "https://opencode.ai/zen/go/v1",
        );
        assert.equal(
            resolveConfiguredProviderBaseURL("https://amr-link.open-design.ai"),
            "https://amr-link.open-design.ai/v1",
        );
        assert.equal(
            resolveConfiguredProviderBaseURL("https://token-plan-sgp.xiaomimimo.com/v1"),
            "https://token-plan-sgp.xiaomimimo.com/v1",
        );
        assert.equal(
            getProviderProtocolBaseURL("https://api.kimi.com/coding/v1", "anthropic-messages"),
            "https://api.kimi.com/coding",
        );
        assert.equal(
            getProviderProtocolBaseURL("https://token-plan-cn.xiaomimimo.com/v1", "anthropic-messages"),
            "https://token-plan-cn.xiaomimimo.com/anthropic",
        );
        assert.equal(
            getProviderProtocolBaseURL("https://opencode.ai/zen/go/v1/chat/completions", "openai"),
            "https://opencode.ai/zen/go/v1",
        );
        assert.equal(
            getProviderProtocolBaseURL("https://api.deepseek.com/v1/", "unknown"),
            "https://api.deepseek.com/v1/",
        );
    });

    it("keeps subscription preset icons and catalog names", () => {
        const expected = {
            "kimi-code": "/stage/images/ai-providers/moonshot.svg",
            "xiaomi-mimo-token-plan": "/stage/images/ai-providers/xiaomi-mimo.png",
            "step-plan": "/stage/images/ai-providers/stepfun.svg",
            "opencode-go": "/stage/images/ai-providers/opencode.svg",
            "command-code": "/stage/images/ai-providers/commandcode.svg",
            "open-design": "/stage/images/ai-providers/open-design.svg",
        };
        for (const [id, icon] of Object.entries(expected)) {
            const preset = PROVIDER_PRESETS.find((item) => item.id === id);
            assert.equal(preset?.icon, icon);
            assert.ok(preset?.name);
            assert.equal(existsSync(join(dirname(fileURLToPath(import.meta.url)), "../../../..", icon.replace(/^\//, ""))), true, icon);
        }
    });
});
