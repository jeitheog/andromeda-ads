export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const shop  = req.headers['x-shopify-shop']  || req.body?.shop;
    const token = req.headers['x-shopify-token'] || req.body?.token;

    if (!shop || !token) return res.status(400).json({ error: 'Faltan credenciales de Shopify' });

    const base    = `https://${shop}/admin/api/2024-01`;
    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };

    try {
        const r = await fetch(
            `${base}/products.json?limit=50&fields=id,title,body_html,variants,images,product_type,tags`,
            { headers }
        );
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.errors || `Shopify ${r.status}`);
        }
        const { products } = await r.json();

        return res.json({
            products: (products || []).map(p => ({
                id:          p.id,
                title:       p.title,
                price:       p.variants?.[0]?.price || '0',
                currency:    'USD',
                description: (p.body_html || '').replace(/<[^>]+>/g, '').substring(0, 400),
                image:       p.images?.[0]?.src || null,
                tags:        p.tags || '',
                type:        p.product_type || ''
            }))
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
