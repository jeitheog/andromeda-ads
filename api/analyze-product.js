export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { product } = req.body;
    if (!product?.title) return res.status(400).json({ error: 'Falta el producto' });

    const apiKey = req.headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Falta la clave de Jarvi (Anthropic). Añádela en Configuración → APIs de Inteligencia Artificial' });

    const systemPrompt = `Eres un experto en marketing de moda y publicidad digital. Respondes ÚNICAMENTE con JSON válido, sin markdown ni explicaciones.`;

    const userPrompt = `Analiza este producto de una tienda de moda y genera el briefing completo para una campaña publicitaria.

PRODUCTO:
- Nombre: ${product.title}
- Precio: $${product.price}
- Descripción: ${product.description || 'Sin descripción proporcionada'}
- Tipo de producto: ${product.type || 'Moda/Ropa'}
- Tags: ${product.tags || 'Sin tags'}

Responde ÚNICAMENTE con este JSON exacto:
{
  "product": "Descripción de venta del producto: qué es, precio, materiales o características clave que lo hacen deseable (2-3 frases directas y atractivas)",
  "audience": "Perfil del cliente ideal para este producto específico: edad estimada, género, estilo de vida, ocasiones de uso (2-3 frases concretas)",
  "painPoint": "El problema real o deseo que resuelve este producto: qué frustraba al cliente antes de encontrarlo (1-2 frases con emoción)",
  "differentiator": "Por qué comprar ESTE producto y no otro: precio, calidad, diseño, exclusividad u otro factor diferenciador (1-2 frases)",
  "tone": "tono detectado"
}

Para "tone" elige EXACTAMENTE uno de estos valores:
elegante y sofisticada | casual y cercana | atrevida y provocadora | minimalista y clean | divertida y jovial | empoderada y feminista`;

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
                max_tokens: 600,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || `Claude ${r.status}`);
        const text = d.content[0].text.trim();
        const jsonStr = text.startsWith('{') ? text : text.substring(text.indexOf('{'));
        return res.json(JSON.parse(jsonStr));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
