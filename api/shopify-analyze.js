export const config = { maxDuration: 60 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const shop  = req.headers['x-shopify-shop']  || req.body.shop;
    const token = req.headers['x-shopify-token'] || req.body.token;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!shop || !token)  return res.status(400).json({ error: 'Faltan credenciales de Shopify' });
    if (!openaiKey)       return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

    const base = `https://${shop}/admin/api/2024-01`;
    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };

    try {
        // ── Fetch store data in parallel ──────────────────
        const [shopRes, productsRes, collectionsRes] = await Promise.all([
            fetch(`${base}/shop.json`, { headers }),
            fetch(`${base}/products.json?limit=15&fields=title,body_html,tags,product_type,variants,images`, { headers }),
            fetch(`${base}/custom_collections.json?limit=10&fields=title,body_html`, { headers })
        ]);

        if (!shopRes.ok) {
            const err = await shopRes.json().catch(() => ({}));
            throw new Error(err.errors || `Shopify error ${shopRes.status} — verifica el token y la URL de la tienda`);
        }

        const { shop: shopData }          = await shopRes.json();
        const { products }                = await productsRes.json();
        const { custom_collections: cols } = await collectionsRes.json();

        // ── Build a compact store summary for GPT ─────────
        const productSummary = (products || []).map(p => {
            const price = p.variants?.[0]?.price || '?';
            const cleanDesc = (p.body_html || '').replace(/<[^>]+>/g, '').substring(0, 200);
            return `• ${p.title} ($${price}) — ${cleanDesc}${p.tags ? ` [${p.tags}]` : ''}`;
        }).join('\n');

        const collectionSummary = (cols || []).map(c =>
            `• ${c.title}: ${(c.body_html || '').replace(/<[^>]+>/g, '').substring(0, 100)}`
        ).join('\n');

        const storeContext = `
TIENDA: ${shopData.name}
EMAIL: ${shopData.email}
DOMINIO: ${shopData.domain}
MONEDA: ${shopData.currency}

PRODUCTOS (${products?.length || 0}):
${productSummary || 'Sin productos'}

COLECCIONES:
${collectionSummary || 'Sin colecciones'}
`.trim();

        // ── GPT-4o: extract brand identity ────────────────
        const prompt = `Eres un experto en marketing de moda y Meta Ads. Analiza esta tienda de Shopify y extrae su identidad de marca para crear anuncios efectivos en Facebook e Instagram.

DATOS DE LA TIENDA:
${storeContext}

Responde ÚNICAMENTE con un JSON válido con este formato exacto:
{
  "product": "Descripción concisa de qué venden, productos estrella, rango de precios y materiales/características clave (2-3 frases)",
  "audience": "Descripción del cliente ideal basada en los productos: edad estimada, género, estilo de vida, valores (2-3 frases)",
  "painPoint": "El mayor problema o deseo que resuelve esta tienda según sus productos y descripciones (1-2 frases)",
  "differentiator": "Qué hace única a esta tienda frente a la competencia, basándote en sus productos y copy (1-2 frases)",
  "tone": "Tono de comunicación detectado en el copy de la tienda (elige uno: elegante y sofisticada / casual y cercana / atrevida y provocadora / minimalista y clean / divertida y jovial / empoderada y feminista)",
  "storeName": "${shopData.name}",
  "topProducts": ["producto1", "producto2", "producto3"],
  "priceRange": "rango de precios detectado (ej: $15–$90)"
}`;

        const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o',
                max_tokens: 800,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const gptData = await gptRes.json();
        if (!gptRes.ok) throw new Error(gptData.error?.message || `OpenAI ${gptRes.status}`);

        const brandProfile = JSON.parse(gptData.choices[0].message.content);

        return res.json({
            brandProfile,
            storeName: shopData.name,
            productCount: products?.length || 0,
            collectionCount: cols?.length || 0
        });

    } catch (err) {
        console.error('shopify-analyze error:', err);
        return res.status(500).json({ error: err.message });
    }
}
