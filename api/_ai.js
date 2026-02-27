/**
 * Shared multi-AI caller: routes to Anthropic or OpenAI based on available keys.
 * Priority: Anthropic > OpenAI
 */

export async function callAI({ system, messages, maxTokens = 1000, headers = {} }) {
    const anthropicKey = headers['x-anthropic-key'];
    const openaiKey    = headers['x-openai-key'];

    if (!anthropicKey && !openaiKey) {
        throw new Error('Configura tu clave de IA en Configuración → APIs de Inteligencia Artificial (Anthropic o OpenAI)');
    }

    if (anthropicKey) {
        return callAnthropic({ system, messages, maxTokens, apiKey: anthropicKey });
    }
    return callOpenAI({ system, messages, maxTokens, apiKey: openaiKey });
}

async function callAnthropic({ system, messages, maxTokens, apiKey }) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            system,
            messages
        })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || `Anthropic ${r.status}`);
    return { text: d.content[0].text.trim(), provider: 'anthropic' };
}

async function callOpenAI({ system, messages, maxTokens, apiKey }) {
    const oaiMessages = [
        { role: 'system', content: system },
        ...messages
    ];
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: maxTokens,
            messages: oaiMessages
        })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`);
    return { text: d.choices[0].message.content.trim(), provider: 'openai' };
}

/**
 * Chat with tool use. Anthropic supports native tools; OpenAI uses function calling.
 * Returns { text, toolUses, stopReason, provider }
 */
export async function callAIChat({ system, messages, tools, maxTokens = 1024, headers = {} }) {
    const anthropicKey = headers['x-anthropic-key'];
    const openaiKey    = headers['x-openai-key'];

    if (!anthropicKey && !openaiKey) {
        throw new Error('Configura tu clave de IA en Configuración → APIs de Inteligencia Artificial (Anthropic o OpenAI)');
    }

    if (anthropicKey) {
        return callAnthropicChat({ system, messages, tools, maxTokens, apiKey: anthropicKey });
    }
    return callOpenAIChat({ system, messages, tools, maxTokens, apiKey: openaiKey });
}

async function callAnthropicChat({ system, messages, tools, maxTokens, apiKey }) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            system,
            tools,
            messages
        })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || `Anthropic ${r.status}`);

    const text     = d.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const toolUses = d.content.filter(b => b.type === 'tool_use');
    return { text, toolUses, stopReason: d.stop_reason, provider: 'anthropic' };
}

async function callOpenAIChat({ system, messages, tools, maxTokens, apiKey }) {
    // Convert Anthropic tool format → OpenAI function format
    const oaiTools = tools.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema
        }
    }));

    // Convert Anthropic message format → OpenAI (tool_result → tool role)
    const oaiMessages = [{ role: 'system', content: system }];
    for (const m of messages) {
        if (typeof m.content === 'string') {
            oaiMessages.push({ role: m.role, content: m.content });
        } else if (Array.isArray(m.content)) {
            for (const block of m.content) {
                if (block.type === 'text') {
                    oaiMessages.push({ role: m.role, content: block.text });
                } else if (block.type === 'tool_use') {
                    oaiMessages.push({
                        role: 'assistant',
                        tool_calls: [{ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } }]
                    });
                } else if (block.type === 'tool_result') {
                    oaiMessages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: String(block.content) });
                }
            }
        }
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: maxTokens,
            tools: oaiTools,
            tool_choice: 'auto',
            messages: oaiMessages
        })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`);

    const choice   = d.choices[0];
    const text     = choice.message.content || '';
    const toolUses = (choice.message.tool_calls || []).map(tc => ({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}')
    }));
    const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';
    return { text, toolUses, stopReason, provider: 'openai' };
}
