# Provider Tool Call Transformations

This document shows how to transform tool call formats from different LLM providers to the vitest-evals format.

## ToolCall Type

```typescript
type ToolCall = {
  // Required fields
  name: string;
  arguments: Record<string, any>;
  
  // Common optional fields
  id?: string;
  result?: any;
  error?: { message: string; code?: string; details?: any };
  status?: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  type?: 'function' | 'retrieval' | 'code_interpreter' | 'web_search' | string;
  timestamp?: number;
  duration_ms?: number;
  parent_id?: string;
  
  // Provider-specific fields allowed
  [key: string]: any;
}
```

## OpenAI

```javascript
function transformOpenAITools(response) {
  const toolCalls = response.choices[0].message.tool_calls?.map(call => ({
    id: call.id,
    name: call.function.name,
    arguments: JSON.parse(call.function.arguments),
    type: 'function',
    status: 'completed',
  })) || [];
  
  return {
    result: response.choices[0].message.content,
    toolCalls,
  };
}
```

## Anthropic Claude

```javascript
function transformClaudeTools(response) {
  const toolCalls = response.content
    .filter(block => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      arguments: block.input,
      type: 'function',
      status: 'completed',
    }));
  
  const textContent = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
  
  return {
    result: textContent,
    toolCalls,
  };
}
```

## Vercel AI SDK

```javascript
function transformAISDKTools(response) {
  const toolCalls = response.toolCalls?.map((call, i) => {
    const toolResult = response.toolResults?.[i];
    const hasError = toolResult?.error !== undefined;
    
    return {
      id: call.toolCallId,
      name: call.toolName,
      arguments: call.args,
      result: toolResult?.result,
      error: hasError ? {
        message: toolResult.error.message || 'Tool execution failed',
        details: toolResult.error
      } : undefined,
      status: hasError ? 'failed' : 'completed',
      type: 'function',
    };
  }) || [];
  
  return {
    result: response.text,
    toolCalls,
  };
}
```

## Streaming Tool Calls

```javascript
async function handleStreamingTools(stream) {
  const toolCalls = new Map();
  
  for await (const chunk of stream) {
    if (chunk.toolCall) {
      const existing = toolCalls.get(chunk.toolCall.id) || {
        id: chunk.toolCall.id,
        name: chunk.toolCall.toolName,
        arguments: {},
        status: 'executing',
        timestamp: Date.now()
      };
      
      // Merge partial arguments
      Object.assign(existing.arguments, chunk.toolCall.args);
      toolCalls.set(chunk.toolCall.id, existing);
    }
    
    if (chunk.toolResult) {
      const call = toolCalls.get(chunk.toolResult.toolCallId);
      if (call) {
        call.result = chunk.toolResult.result;
        call.status = 'completed';
        call.duration_ms = Date.now() - call.timestamp;
      }
    }
  }
  
  return Array.from(toolCalls.values());
}
```

## Google Gemini

```javascript
function transformGeminiTools(response) {
  const toolCalls = response.candidates[0].content.parts
    .filter(part => part.functionCall)
    .map(part => ({
      name: part.functionCall.name,
      arguments: part.functionCall.args,
      type: 'function',
      status: 'completed',
    }));
  
  const textParts = response.candidates[0].content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('');
  
  return {
    result: textParts,
    toolCalls,
  };
}
```

## Cohere

```javascript
function transformCohereTools(response) {
  const toolCalls = response.tool_calls?.map(call => ({
    name: call.name,
    arguments: call.parameters,
    type: 'function',
    status: 'completed',
  })) || [];
  
  return {
    result: response.text,
    toolCalls,
  };
}
```