export const config = { maxDuration: 60 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { briefing, selectedProduct } = req.body;
    if (!briefing?.product) return res.status(400).json({ error: 'Falta el briefing' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

    const productSection = selectedProduct
        ? `\nPRODUCTO ESPECÍFICO EN FOCO:
- Nombre: ${selectedProduct.title}
- Precio: $${selectedProduct.price}
- Descripción: ${selectedProduct.description || 'Sin descripción'}
- Tipo: ${selectedProduct.type || ''}
- Tags: ${selectedProduct.tags || ''}

IMPORTANTE: Los 10 conceptos deben girar EXCLUSIVAMENTE en torno a este producto concreto. El headline, hook y body deben mencionar o referirse directamente a "${selectedProduct.title}". NO hagas conceptos genéricos de marca.`
        : '';

    const systemPrompt = `Eres un experto copywriter de publicidad digital especializado en moda y ropa. Respondes ÚNICAMENTE con JSON válido, sin markdown ni explicaciones.`;

    const userPrompt = `BRIEFING DE MARCA:
- Producto/marca: ${briefing.product}
- Cliente ideal: ${briefing.audience}
- Dolor principal del cliente: ${briefing.painPoint}
- Diferenciador: ${briefing.differentiator}
- Tono de marca: ${briefing.tone || 'moderno y cercano'}
${productSection}
Genera exactamente 10 conceptos de anuncios diferentes para publicidad digital (Meta Ads, Google Ads, TikTok).
El objetivo de TODOS los anuncios es llevar tráfico directo al sitio web para generar compras online. Solo compra directa en la tienda.
Cada concepto debe tener un ángulo de venta DISTINTO:
Ángulos sugeridos: FOMO, Prueba social, Transformación, Problema-Solución, Deseo/Aspiración, Identidad, Oferta/Urgencia, Storytelling, Educativo, Curiosidad.

El CTA siempre debe orientar a la compra: "Comprar ahora", "Ver producto", "Consíguelo ya", "Descúbrelo aquí", "Ir a la tienda", etc.

Responde ÚNICAMENTE con este JSON exacto:
{
  "concepts": [
    {
      "angle": "Nombre del ángulo de venta",
      "hook": "Frase de enganche inicial (máx 10 palabras)",
      "headline": "Titular principal del anuncio (máx 40 caracteres)",
      "body": "Cuerpo del anuncio (2-3 frases, máx 125 caracteres)",
      "cta": "Texto del botón CTA orientado a compra (máx 5 palabras)",
      "painPoint": "Dolor específico que toca este concepto",
      "targetEmotion": "Emoción principal que activa"
    }
  ]
}`;

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
                max_tokens: 2000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || `Claude ${r.status}`);
        const text = d.content[0].text.trim();
        const jsonStr = text.startsWith('{') ? text : text.substring(text.indexOf('{'));
        const parsed = JSON.parse(jsonStr);
        return res.json(parsed);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
