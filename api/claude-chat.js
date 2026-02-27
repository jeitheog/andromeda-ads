export const config = { maxDuration: 60 };
import { callAIChat } from './_ai.js';

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
    },
    {
        name: 'create_strategy',
        description: 'Crea y guarda una estrategia de copy completa en la biblioteca de estrategias del usuario. Úsala cuando el usuario pida crear, generar o sugerir una estrategia de copy o briefing para una marca, producto o campaña.',
        input_schema: {
            type: 'object',
            properties: {
                name:          { type: 'string', description: 'Nombre corto y descriptivo de la estrategia (ej: "FOMO Verano Mujeres 25-35")' },
                product:       { type: 'string', description: 'Descripción del producto o marca: qué se vende, precio, características clave (2-3 frases)' },
                audience:      { type: 'string', description: 'Perfil del cliente ideal: edad, género, estilo de vida, motivaciones (2-3 frases)' },
                painPoint:     { type: 'string', description: 'El problema o deseo principal que resuelve el producto (1-2 frases con emoción)' },
                differentiator:{ type: 'string', description: 'Por qué este producto y no otro: precio, calidad, diseño, exclusividad (1-2 frases)' },
                tone:          { type: 'string', enum: ['elegante y sofisticada', 'casual y cercana', 'atrevida y provocadora', 'minimalista y clean', 'divertida y jovial', 'empoderada y feminista'], description: 'Tono de comunicación de la marca' }
            },
            required: ['name', 'product', 'audience', 'painPoint', 'differentiator', 'tone']
        }
    }
];

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { messages, context } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'Faltan mensajes' });

    const ctx = context || {};
    const conceptList = (ctx.concepts || [])
        .map((c, i) => `  [${i}] ${c.selected ? '✓' : '○'} "${c.headline}" — ${c.angle}`)
        .join('\n');

    const providerName = req.headers['x-anthropic-key'] ? 'Anthropic Claude' : 'OpenAI GPT-4o';

    const system = `Eres Jarvi, el asistente inteligente de Andromeda Ads, una plataforma de automatización de Meta Ads para tiendas de moda. Tu nombre es Jarvi.

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
        const result = await callAIChat({
            system,
            messages,
            tools: TOOLS,
            maxTokens: 1024,
            headers: req.headers
        });
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
