export const config = { maxDuration: 60 };

const TOOLS = [
    {
        name: 'update_concept',
        description: 'Modifica el headline, body, hook o cta de un concepto de anuncio existente. Usa el índice (0-based) del concepto en la lista.',
        input_schema: {
            type: 'object',
            properties: {
                index:    { type: 'number', description: 'Índice del concepto (0 = primer concepto)' },
                headline: { type: 'string', description: 'Nuevo titular del anuncio (máx 40 caracteres)' },
                body:     { type: 'string', description: 'Nuevo cuerpo del anuncio (máx 125 caracteres)' },
                hook:     { type: 'string', description: 'Nueva frase de enganche (máx 10 palabras)' },
                cta:      { type: 'string', description: 'Nuevo texto del botón CTA (máx 5 palabras)' }
            },
            required: ['index']
        }
    },
    {
        name: 'update_campaign_settings',
        description: 'Modifica el presupuesto diario (USD), duración (días) o nombre de la campaña',
        input_schema: {
            type: 'object',
            properties: {
                dailyBudget:  { type: 'number', description: 'Presupuesto diario en USD' },
                duration:     { type: 'number', description: 'Duración de la campaña en días' },
                campaignName: { type: 'string', description: 'Nombre de la campaña' }
            }
        }
    },
    {
        name: 'update_targeting',
        description: 'Modifica el targeting de la campaña: países, rango de edad o género',
        input_schema: {
            type: 'object',
            properties: {
                countries: { type: 'array', items: { type: 'string' }, description: 'Códigos de país ISO (ej: ["ES","MX","CO"])' },
                ageMin:    { type: 'number', description: 'Edad mínima (18-65)' },
                ageMax:    { type: 'number', description: 'Edad máxima (18-65)' },
                gender:    { type: 'string', enum: ['all', '1', '2'], description: 'all=Todos, 1=Hombres, 2=Mujeres' }
            }
        }
    },
    {
        name: 'select_concepts',
        description: 'Selecciona o deselecciona conceptos por sus índices para incluirlos en la campaña',
        input_schema: {
            type: 'object',
            properties: {
                indices: { type: 'array', items: { type: 'number' }, description: 'Lista de índices (0-based)' },
                action:  { type: 'string', enum: ['select', 'deselect'], description: 'Acción a realizar' }
            },
            required: ['indices', 'action']
        }
    }
];

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

    const { messages, context } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'Faltan mensajes' });

    // Build context section
    const ctx = context || {};
    const conceptList = (ctx.concepts || [])
        .map((c, i) => `  [${i}] ${c.selected ? '✓' : '○'} "${c.headline}" — ${c.angle}`)
        .join('\n');

    const systemPrompt = `Eres el asistente inteligente de Andromeda Ads, una plataforma de automatización de Meta Ads para tiendas de moda.

ESTADO ACTUAL DE LA APLICACIÓN:
${ctx.briefing ? `Briefing: ${ctx.briefing.product} | Audiencia: ${ctx.briefing.audience}` : 'Briefing: no configurado'}

Conceptos generados (${ctx.concepts?.length || 0} total):
${conceptList || '  (ninguno todavía)'}

Configuración de campaña:
- Presupuesto: $${ctx.campaign?.dailyBudget || 5}/día × ${ctx.campaign?.duration || 7} días
- Países: ${ctx.campaign?.countries || 'ES'}
- Edad: ${ctx.campaign?.ageMin || 18}-${ctx.campaign?.ageMax || 45}
- Género: ${ctx.campaign?.gender === '1' ? 'Hombres' : ctx.campaign?.gender === '2' ? 'Mujeres' : 'Todos'}

Puedes modificar conceptos, targeting y presupuesto usando las herramientas disponibles.
Cuando el usuario pida cambios, usa las herramientas directamente y confirma qué cambiaste.
Responde siempre en español, de forma breve y directa.`;

    try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 1024,
                system: systemPrompt,
                tools: TOOLS,
                messages
            })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || `Claude ${r.status}`);

        const text = d.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const toolUses = d.content.filter(b => b.type === 'tool_use');

        return res.json({ text, toolUses, stopReason: d.stop_reason });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
