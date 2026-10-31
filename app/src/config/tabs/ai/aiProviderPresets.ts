export type AIProviderCategory = "official" | "aggregator" | "local" | "custom";
export type AIResponsesSupport = "supported" | "experimental" | "unsupported";

export interface IProviderPreset {
    id: string;
    name: string;
    baseURL: string;
    protocolBaseURLs?: Record<string, string>;
    aliasBaseURLs?: string[];
    category: AIProviderCategory;
    responsesSupport: AIResponsesSupport;
    region?: "china" | "international";
    icon?: string;
    authType?: "chatgpt";
}

export const PROVIDER_PRESETS: IProviderPreset[] = [
    {id: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1", category: "official", responsesSupport: "supported", icon: "/stage/images/ai-providers/openai.svg"},
    {id: "chatgpt", name: "ChatGPT", baseURL: "https://api.openai.com/v1", authType: "chatgpt", category: "official", responsesSupport: "supported", icon: "/stage/images/ai-providers/openai.svg"},
    {id: "anthropic", name: "Anthropic", baseURL: "https://api.anthropic.com/v1", category: "official", responsesSupport: "unsupported", icon: "/stage/images/ai-providers/anthropic.svg"},
    {
        id: "deepseek", name: "DeepSeek", baseURL: "https://api.deepseek.com", category: "official", responsesSupport: "supported",
        icon: "/stage/images/ai-providers/deepseek.svg",
        protocolBaseURLs: {
            "openai": "https://api.deepseek.com",
            "openai-responses": "https://api.deepseek.com",
            "anthropic-messages": "https://api.deepseek.com/anthropic",
        },
    },
    {
        id: "moonshot", name: "Moonshot AI", baseURL: "https://api.moonshot.cn/v1", category: "official", responsesSupport: "experimental", icon: "/stage/images/ai-providers/moonshot.svg",
        protocolBaseURLs: {"anthropic-messages": "https://api.moonshot.cn/anthropic"},
    },
    {
        id: "kimi-code", name: "Kimi Code", baseURL: "https://api.kimi.com/coding/v1", category: "official", responsesSupport: "experimental",
        icon: "/stage/images/ai-providers/moonshot.svg",
        protocolBaseURLs: {
            "openai": "https://api.kimi.com/coding/v1",
            "openai-responses": "https://api.kimi.com/coding/v1",
            "anthropic-messages": "https://api.kimi.com/coding",
        },
        aliasBaseURLs: ["https://api.kimi.ai/coding/v1", "https://api.kimi.ai/coding"],
    },
    {
        id: "minimax", name: "MiniMax", baseURL: "https://api.minimax.io/v1", category: "official", responsesSupport: "experimental", region: "international", icon: "/stage/images/ai-providers/minimax.svg",
        protocolBaseURLs: {"anthropic-messages": "https://api.minimax.io/anthropic"},
    },
    {
        id: "minimax-cn", name: "MiniMax", baseURL: "https://api.minimax.cn/v1", category: "official", responsesSupport: "experimental", region: "china", icon: "/stage/images/ai-providers/minimax.svg",
        protocolBaseURLs: {"anthropic-messages": "https://api.minimax.cn/anthropic"},
    },
    {
        id: "aliyun", name: "Alibaba Model Studio", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", category: "official", responsesSupport: "supported", region: "china", icon: "/stage/images/ai-providers/aliyun.svg",
        protocolBaseURLs: {"anthropic-messages": "https://dashscope.aliyuncs.com/apps/anthropic"},
    },
    {
        id: "aliyun-intl", name: "Alibaba Model Studio", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", category: "official", responsesSupport: "supported", region: "international", icon: "/stage/images/ai-providers/aliyun.svg",
        protocolBaseURLs: {"anthropic-messages": "https://dashscope-intl.aliyuncs.com/apps/anthropic"},
    },
    {id: "volcengine", name: "Volcengine Ark", baseURL: "https://ark.cn-beijing.volces.com/api/v3", category: "official", responsesSupport: "experimental", icon: "/stage/images/ai-providers/volcengine.svg"},
    {id: "zhipu", name: "Zhipu AI", baseURL: "https://open.bigmodel.cn/api/paas/v4", category: "official", responsesSupport: "unsupported", icon: "/stage/images/ai-providers/zhipu.svg"},
    {
        id: "gemini", name: "Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", category: "official", responsesSupport: "unsupported", icon: "/stage/images/ai-providers/gemini.svg",
        protocolBaseURLs: {"gemini-interactions": "https://generativelanguage.googleapis.com/v1beta"},
    },
    {id: "mistral", name: "Mistral AI", baseURL: "https://api.mistral.ai/v1", category: "official", responsesSupport: "unsupported", icon: "/stage/images/ai-providers/mistral.svg"},
    {
        id: "xiaomi-mimo", name: "Xiaomi MiMo", baseURL: "https://api.xiaomimimo.com/v1", category: "official", responsesSupport: "supported", icon: "/stage/images/ai-providers/xiaomi-mimo.png",
        protocolBaseURLs: {"anthropic-messages": "https://api.xiaomimimo.com/anthropic"},
    },
    {
        id: "xiaomi-mimo-token-plan", name: "Xiaomi MiMo Token Plan", baseURL: "https://token-plan-cn.xiaomimimo.com/v1",
        category: "official", responsesSupport: "supported", region: "china", icon: "/stage/images/ai-providers/xiaomi-mimo.png",
        protocolBaseURLs: {
            "openai": "https://token-plan-cn.xiaomimimo.com/v1",
            "openai-responses": "https://token-plan-cn.xiaomimimo.com/v1",
            "anthropic-messages": "https://token-plan-cn.xiaomimimo.com/anthropic",
        },
        aliasBaseURLs: [
            "https://token-plan-sgp.xiaomimimo.com/v1", "https://token-plan-sgp.xiaomimimo.com/anthropic",
            "https://token-plan-ams.xiaomimimo.com/v1", "https://token-plan-ams.xiaomimimo.com/anthropic",
        ],
    },
    {
        id: "step-plan", name: "Step Plan", baseURL: "https://api.stepfun.com/step_plan/v1", category: "official", responsesSupport: "experimental",
        icon: "/stage/images/ai-providers/stepfun.svg",
        protocolBaseURLs: {
            "openai": "https://api.stepfun.com/step_plan/v1",
            "openai-responses": "https://api.stepfun.com/step_plan/v1",
            "anthropic-messages": "https://api.stepfun.com/step_plan",
        },
        aliasBaseURLs: ["https://api.stepfun.ai/step_plan/v1", "https://api.stepfun.ai/step_plan"],
    },
    {id: "opencode-go", name: "OpenCode Go", baseURL: "https://opencode.ai/zen/go/v1", category: "aggregator", responsesSupport: "experimental", icon: "/stage/images/ai-providers/opencode.svg", aliasBaseURLs: ["https://opencode.ai/inference/go/v1"]},
    {id: "command-code", name: "Command Code", baseURL: "https://api.commandcode.ai/provider/v1", category: "aggregator", responsesSupport: "experimental", icon: "/stage/images/ai-providers/commandcode.svg"},
    {id: "open-design", name: "Open Design", baseURL: "https://amr-link.open-design.ai/v1", category: "aggregator", responsesSupport: "supported", icon: "/stage/images/ai-providers/open-design.svg", aliasBaseURLs: ["https://amr-link.open-design.ai"]},
    {id: "siliconflow", name: "SiliconFlow", baseURL: "https://api.siliconflow.cn/v1", category: "aggregator", responsesSupport: "unsupported", icon: "/stage/images/ai-providers/siliconflow.svg"},
    {id: "openrouter", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", category: "aggregator", responsesSupport: "supported", icon: "/stage/images/ai-providers/openrouter.svg"},
    {id: "groq", name: "Groq", baseURL: "https://api.groq.com/openai/v1", category: "aggregator", responsesSupport: "experimental", icon: "/stage/images/ai-providers/groq.svg"},
    {id: "ollama", name: "Ollama", baseURL: "http://localhost:11434/v1", category: "local", responsesSupport: "supported", icon: "/stage/images/ai-providers/ollama.svg"},
    {id: "lmstudio", name: "LM Studio", baseURL: "http://localhost:1234/v1", category: "local", responsesSupport: "supported", icon: "/stage/images/ai-providers/lmstudio.svg"},
    {id: "custom", name: "", baseURL: "", category: "custom", responsesSupport: "experimental"},
];

export const normalizeProviderBaseURL = (value: string) => value.trim().replace(/\/+$/, "").toLowerCase();

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";

export const canonicalizeProviderBaseURL = (value: string) => {
    let url = value.trim().replace(/\/+$/, "");
    if (url.toLowerCase().endsWith(CHAT_COMPLETIONS_SUFFIX)) {
        url = url.slice(0, -CHAT_COMPLETIONS_SUFFIX.length).replace(/\/+$/, "");
    }
    return url;
};

const normalizePresetBaseURL = (value: string) =>
    canonicalizeProviderBaseURL(value).toLowerCase().replace(/\/v1$/, "");

export const listProviderPresetURLs = (preset: IProviderPreset) =>
    [preset.baseURL, ...Object.values(preset.protocolBaseURLs || {}), ...(preset.aliasBaseURLs || [])]
        .filter((value) => value.trim() !== "");

export const findProviderPreset = (baseURL: string) =>
    PROVIDER_PRESETS.find((preset) => preset.baseURL &&
        listProviderPresetURLs(preset).some((value) =>
            normalizePresetBaseURL(value) === normalizePresetBaseURL(baseURL)));

export const resolveConfiguredProviderBaseURL = (value: string, protocol?: string) => {
    const canonical = canonicalizeProviderBaseURL(value);
    const preset = findProviderPreset(canonical);
    if (!preset?.baseURL) {
        return canonical;
    }
    if (normalizePresetBaseURL(canonical) === normalizePresetBaseURL(preset.baseURL)) {
        return protocol ? getProviderProtocolBaseURL(preset.baseURL, protocol) : preset.baseURL;
    }
    return canonical;
};

// 只切换预设的标准地址，保留用户自行配置的网关和查询参数。
export const getProviderProtocolBaseURL = (baseURL: string, protocol: string): string => {
    const canonical = canonicalizeProviderBaseURL(baseURL);
    const preset = findProviderPreset(canonical);
    if (!preset?.protocolBaseURLs) {
        return canonical;
    }
    return preset.protocolBaseURLs[protocol] ||
        (["openai", "openai-responses"].includes(protocol) ? preset.baseURL : baseURL);
};

export const getResponsesSupport = (baseURL: string): AIResponsesSupport =>
    findProviderPreset(baseURL)?.responsesSupport || "experimental";

export const getDefaultProviderProtocol = (presetId: string) =>
    presetId === "anthropic" ? "anthropic-messages" : ["openai", "chatgpt"].includes(presetId) ? "openai-responses" : "openai";
