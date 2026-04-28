import { ImproveYourSentenceSettings } from './settings';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export async function* streamAIResponse(
    messages: ChatMessage[],
    settings: ImproveYourSentenceSettings
): AsyncGenerator<string, void, unknown> {
    const { provider, openAiApiKey, geminiApiKey, openRouterApiKey } = settings;

    try {
        if (provider === 'gemini') {
            yield* streamGemini(messages, geminiApiKey, settings.geminiModel);
        } else if (provider === 'openai') {
            yield* streamOpenAI(messages, openAiApiKey, settings.openAiModel);
        } else if (provider === 'openrouter') {
            yield* streamOpenRouter(messages, openRouterApiKey, settings.openRouterModel);
        } else {
            throw new Error('Unknown AI provider configured.');
        }
    } catch (e: any) {
        console.error("AI stream error:", e);
        yield `\n\n**Error**: ${e.message || 'An unknown error occurred during AI completion.'}`;
    }
}

async function* streamOpenAI(messages: ChatMessage[], apiKey: string, model: string) {
    if (!apiKey) throw new Error("OpenAI API key is missing. Please set it in the plugin settings.");
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages,
            stream: true
        })
    });
	yield* parseSSE(response);
}

async function* streamOpenRouter(messages: ChatMessage[], apiKey: string, model: string) {
    if (!apiKey) throw new Error("OpenRouter API key is missing. Please set it in the plugin settings.");
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://obsidian.md' // Required by OpenRouter sometimes
        },
        body: JSON.stringify({
            model: model,
            messages,
            stream: true
        })
    });
	yield* parseSSE(response);
}

async function* parseSSE(response: Response) {
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP Error ${response.status}: ${text}`);
    }
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("Could not read response stream");

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
                const data = line.trim().slice(6);
                if (data === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.choices?.[0]?.delta?.content) {
                        yield parsed.choices[0].delta.content;
                    }
                } catch (e) {
                    // Ignore parse errors for partial JSON chunks
                }
            }
        }
    }
}

async function* streamGemini(messages: ChatMessage[], apiKey: string, model: string) {
    if (!apiKey) throw new Error("Gemini API key is missing. Please set it in the plugin settings.");
    
    const systemMessage = messages.find(m => m.role === 'system');
    const standardMessages = messages.filter(m => m.role !== 'system');

    const contents = standardMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    const body: any = { contents };
    if (systemMessage) {
        body.systemInstruction = {
            parts: [{ text: systemMessage.content }]
        };
    }

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
	const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`HTTP Error ${response.status}: ${text}`);
	}
	
	const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("Could not read response stream");

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
                const data = line.trim().slice(6);
                if (data === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                        yield parsed.candidates[0].content.parts[0].text;
                    }
                } catch (e) {}
            }
        }
    }
}
