export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  badge: string;
  keyUrl?: string;
  docsUrl: string;
  requiresKey: boolean;
  note: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "9router",
    name: "9router",
    description: "Your local router, including OpenCode free models.",
    baseUrl: "http://localhost:20128/v1",
    defaultModel: "",
    badge: "Local router",
    docsUrl: "https://github.com/decolua/9router",
    requiresKey: false,
    note: "Start 9router, then discover models. Dots also reads the installed router’s full catalog. Models marked Enable in 9router need a connection or model setting there. Add your router key if API authentication is enabled.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "Try models from the NVIDIA API catalog.",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "openai/gpt-oss-20b",
    badge: "Trial access",
    keyUrl: "https://build.nvidia.com",
    docsUrl: "https://docs.api.nvidia.com/nim/docs/introduction",
    requiresKey: true,
    note: "Sign in at NVIDIA, choose a model, and generate its API key. Trial access and limits depend on NVIDIA and your account.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One key for many models, including a free router.",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    badge: "Free models",
    keyUrl: "https://openrouter.ai/settings/keys",
    docsUrl: "https://openrouter.ai/openrouter/free",
    requiresKey: true,
    note: "The free router chooses a compatible free model. Rate limits apply; other models may be paid. Filter discovered models to free only to avoid selecting a paid model.",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Fast inference with a limited free developer tier.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-20b",
    badge: "Free tier",
    keyUrl: "https://console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs/rate-limits",
    requiresKey: true,
    note: "Create a Groq API key. Free-tier model and token limits are set by Groq; use Economy for shorter requests.",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    description: "Connect the Cerebras inference API.",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
    badge: "Hosted API",
    keyUrl: "https://cloud.cerebras.ai",
    docsUrl: "https://inference-docs.cerebras.ai/models/openai-oss",
    requiresKey: true,
    note: "Create an inference API key and discover the models available to your account. Access and pricing depend on your plan.",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Use models running on your own computer.",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "",
    badge: "Local",
    docsUrl: "https://docs.ollama.com/api/openai-compatibility",
    requiresKey: false,
    note: "Start Ollama and pull a tool-capable model. Discover your installed models below. No API key is required for the local server.",
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    description: "Connect the local server in LM Studio.",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "",
    badge: "Local",
    docsUrl: "https://lmstudio.ai/docs/developer/openai-compat",
    requiresKey: false,
    note: "Load a model and start the local server in LM Studio. If server authentication is enabled, enter its key.",
  },
  {
    id: "openai",
    name: "OpenAI API",
    description: "Use your OpenAI API account.",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "",
    badge: "Paid API",
    keyUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    requiresKey: true,
    note: "Create an API key and discover the models your API account can use. ChatGPT subscriptions and API billing are separate.",
  },
  {
    id: "custom",
    name: "Custom router",
    description: "Any compatible hosted router or local endpoint.",
    baseUrl: "",
    defaultModel: "",
    badge: "Custom",
    docsUrl: "https://github.com/ahpah-dev/dots-desktop",
    requiresKey: true,
    note: "Enter your router’s OpenAI-compatible base URL, API key, and model. You can omit the key for a local server that does not require authentication.",
  },
];

export function inferPreset(baseUrl: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(
    (p) => p.baseUrl && baseUrl.replace(/\/+$/, "") === p.baseUrl,
  );
}
