export const config = { maxDuration: 60 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { briefing } = req.body;
    if (!briefing?.product) return res.status(400).json({ error: 'Falta el briefing' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

    const prompt = `Eres un experto copywriter de Meta Ads especializado en moda y ropa.

BRIEFING DE MARCA:
- Producto: ${briefing.product}
- Cliente ideal: ${briefing.audience}
- Dolor principal del cliente: ${briefing.painPoint}
- Diferenciador: ${briefing.differentiator}
- Tono de marca: ${briefing.tone || 'moderno y cercano'}

Genera exactamente 10 conceptos de anuncios diferentes para Meta Ads (Facebook/Instagram).
Cada concepto debe tener un ángulo de venta DISTINTO:
Ángulos sugeridos: FOMO, Prueba social, Transformación, Problema-Solución, Deseo/Aspiración, Identidad, Oferta/Urgencia, Storytelling, Educativo, Curiosidad.

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicaciones):
{
  "concepts": [
    {
      "angle": "Nombre del ángulo de venta",
      "hook": "Frase de enganche inicial (máx 10 palabras)",
      "headline": "Titular principal del anuncio (máx 40 caracteres)",
      "body": "Cuerpo del anuncio (2-3 frases, máx 125 caracteres)",
      "cta": "Texto del botón CTA (máx 5 palabras)",
      "painPoint": "Dolor específico que toca este concepto",
      "targetEmotion": "Emoción principal que activa"
    }
  ]
}`;

    try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o',
                max_tokens: 2000,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`);
        const parsed = JSON.parse(d.choices[0].message.content);
        return res.json(parsed);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
