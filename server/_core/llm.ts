/**
 * LLM integration using OpenAI API.
 * Provides chat completion for the customer support chatbot.
 */

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image_url"; image_url: { url: string; detail?: string } };
export type FileContent = { type: "file_url"; file_url: { url: string; mime_type?: string } };
export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
};

export type ToolChoice = "none" | "auto" | "required" | { name: string } | { type: "function"; function: { name: string } };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: any;
  output_schema?: any;
  responseFormat?: any;
  response_format?: any;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export type JsonSchema = { name: string; schema: Record<string, unknown>; strict?: boolean };
export type OutputSchema = JsonSchema;
export type ResponseFormat = { type: "text" } | { type: "json_object" } | { type: "json_schema"; json_schema: JsonSchema };

function normalizeContent(content: MessageContent | MessageContent[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === "string" ? part : "text" in part ? part.text : ""))
      .join("\n");
  }
  if ("text" in content) return content.text;
  return "";
}

async function callGemini(apiKey: string, systemInstruction: string, contents: Array<{ role: string; parts: Array<{ text: string }> }>): Promise<Response> {
  const models = ["gemini-2.0-flash", "gemini-1.5-flash"];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        contents,
        generationConfig: { maxOutputTokens: 512 },
      }),
    });

    if (response.ok) return response;

    // If rate limited, retry with backoff then try next model
    if (response.status === 429) {
      console.warn(`[LLM] ${model} rate limited, trying next...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    // Other errors — throw immediately
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} – ${errorText}`);
  }

  throw new Error("All Gemini models rate limited");
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Build Gemini request
  let systemInstruction = "";
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const msg of params.messages) {
    const text = normalizeContent(msg.content);
    if (msg.role === "system") {
      systemInstruction += text + "\n";
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text }],
      });
    }
  }

  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Hello" }] });
  }

  // Try with retry and model fallback
  let response: Response;
  try {
    response = await callGemini(apiKey, systemInstruction.trim(), contents);
  } catch (e: any) {
    // If all models fail, retry once after 3 seconds
    console.warn("[LLM] First attempt failed, retrying in 3s:", e.message);
    await new Promise(r => setTimeout(r, 3000));
    response = await callGemini(apiKey, systemInstruction.trim(), contents);
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text)
    .join("") || "";

  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "gemini-2.0-flash",
    choices: [{
      index: 0,
      message: { role: "assistant", content: textContent },
      finish_reason: data.candidates?.[0]?.finishReason || "STOP",
    }],
    usage: data.usageMetadata ? {
      prompt_tokens: data.usageMetadata.promptTokenCount || 0,
      completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata.totalTokenCount || 0,
    } : undefined,
  };
}
