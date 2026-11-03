export interface LlmMessage { role: 'user' | 'assistant'; content: string }
export interface LlmTool { name: string; description: string; input_schema: Record<string, unknown> }
export interface LlmResult { text: string; toolInput?: unknown }

export interface LlmClient {
  complete(opts: { system: string; messages: LlmMessage[]; tools?: LlmTool[]; forceTool?: string; maxTokens: number }): Promise<LlmResult>;
}
