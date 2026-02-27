export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { product } = req.body;
    if (!product?.title) return res.status(400).json({ error: 'Falta el producto' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

    const prompt = `Eres un experto en marketing de moda y publicidad digital. Analiza este producto de una tienda de moda y genera el briefing completo para una campaña publicitaria.

PRODUCTO:
- Nombre: ${product.title}
- Precio: $${product.price}
- Descripción: ${product.description || 'Sin descripción proporcionada'}
- Tipo de producto: ${product.type || 'Moda/Ropa'}
- Tags: ${product.tags || 'Sin tags'}

Responde ÚNICAMENTE con un JSON válido con este formato exacto:
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
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o',
                max_tokens: 600,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`);
        return res.json(JSON.parse(d.choices[0].message.content));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
