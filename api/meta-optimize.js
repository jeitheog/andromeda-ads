export const config = { maxDuration: 60 };
const BASE = 'https://graph.facebook.com/v19.0';

export default async function handler(req, res) {
    if (req.method === 'PATCH') return applyOptimizations(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = req.headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Falta la clave de Jarvi (Anthropic). Añádela en Configuración → APIs de Inteligencia Artificial' });

    const { campaignId, stats, briefing } = req.body;
    if (!stats) return res.status(400).json({ error: 'Faltan stats' });

    const systemPrompt = `Eres un experto Media Buyer de Meta Ads especializado en moda y ropa. Respondes ÚNICAMENTE con JSON válido, sin markdown ni explicaciones.`;

    const userPrompt = `BRIEFING DEL CLIENTE:
${briefing ? `Producto: ${briefing.product}\nCliente ideal: ${briefing.audience}\nDiferenciador: ${briefing.differentiator}` : 'Tienda de moda'}

DATOS DE RENDIMIENTO (últimos 7 días):
Resumen campaña: Gasto $${stats.summary?.spend?.toFixed(2)}, Impresiones ${stats.summary?.impressions?.toLocaleString()}, CTR ${stats.summary?.ctr}%, CPM $${stats.summary?.cpm}, Conversiones: ${stats.summary?.conversions}

Anuncios individuales:
${(stats.ads || []).map(ad => `- ${ad.name}: Gasto $${parseFloat(ad.spend).toFixed(2)}, CTR ${parseFloat(ad.ctr).toFixed(2)}%, CPM $${parseFloat(ad.cpm).toFixed(2)}, Conversiones: ${ad.conversions}, ROAS: ${ad.roas}x`).join('\n')}

DECISIONES A TOMAR:
1. Pausa anuncios con CTR < 0.5% durante 3+ días o ROAS < 0.8
2. Escala (duplica presupuesto) anuncios con ROAS > 1.5 o CTR > 2%
3. Mantén los demás
4. Sugiere mejoras de copy específicas

Responde ÚNICAMENTE con este JSON exacto:
{
  "insights": "Análisis breve de 2-3 frases del rendimiento general",
  "pause": ["adId1", "adId2"],
  "scale": [{"adId": "adId3", "newBudget": 10}],
  "copyTweaks": "Sugerencias específicas de copy para mejorar los anuncios con bajo CTR",
  "winnerAngle": "Ángulo de venta que mejor está funcionando y por qué"
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
                max_tokens: 1000,
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

async function applyOptimizations(req, res) {
    const token = req.headers['x-meta-token'];
    if (!token) return res.status(400).json({ error: 'Falta token de Meta' });

    const { pause = [], scale = [] } = req.body;
    const errors = [];

    for (const adId of pause) {
        try {
            const r = await fetch(`${BASE}/${adId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'PAUSED', access_token: token })
            });
            const d = await r.json();
            if (d.error) errors.push(`Pause ${adId}: ${d.error.message}`);
        } catch (e) { errors.push(`Pause ${adId}: ${e.message}`); }
    }

    for (const { adId, newBudget } of scale) {
        try {
            const adRes = await fetch(`${BASE}/${adId}?fields=adset_id&access_token=${token}`);
            const adData = await adRes.json();
            if (adData.adset_id) {
                const r = await fetch(`${BASE}/${adData.adset_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ daily_budget: Math.round(newBudget * 100), access_token: token })
                });
                const d = await r.json();
                if (d.error) errors.push(`Scale ${adId}: ${d.error.message}`);
            }
        } catch (e) { errors.push(`Scale ${adId}: ${e.message}`); }
    }

    return res.json({ applied: true, errors });
}
