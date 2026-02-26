export const config = { maxDuration: 15 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const shop      = req.headers['x-shopify-shop']  || req.body?.shop;
    const token     = req.headers['x-shopify-token'] || req.body?.token;
    const productId = req.body?.productId;

    if (!shop || !token || !productId)
        return res.status(400).json({ error: 'Faltan shop, token o productId' });

    try {
        const r = await fetch(
            `https://${shop}/admin/api/2024-01/products/${productId}.json`,
            { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
        );
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.errors || `Shopify ${r.status}`);
        }
        const { product: p } = await r.json();

        return res.json({
            id:          p.id,
            title:       p.title,
            price:       p.variants?.[0]?.price || '0',
            image:       p.images?.[0]?.src || null,
            images:      (p.images || []).map(i => i.src),
            description: (p.body_html || '').replace(/<[^>]+>/g, '').trim(),
            tags:        p.tags || '',
            type:        p.product_type || '',
            variants:    (p.variants || []).map(v => ({
                id: v.id, title: v.title, price: v.price, sku: v.sku
            }))
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
