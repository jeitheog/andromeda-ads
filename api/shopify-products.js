export const config = { maxDuration: 60 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const shop  = req.headers['x-shopify-shop']  || req.body?.shop;
    const token = req.headers['x-shopify-token'] || req.body?.token;

    if (!shop || !token) return res.status(400).json({ error: 'Faltan credenciales de Shopify' });

    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };

    // Paginate through ALL products using Shopify cursor-based pagination
    // Only fetch minimal fields needed for the search list
    let nextUrl = `https://${shop}/admin/api/2024-01/products.json?limit=250&fields=id,title,variants,images`;
    const all = [];
    const MAX_PAGES = 10; // safety cap: 2500 products
    let page = 0;

    try {
        while (nextUrl && page < MAX_PAGES) {
            const r = await fetch(nextUrl, { headers });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.errors || `Shopify ${r.status}`);
            }
            const data = await r.json();
            (data.products || []).forEach(p => {
                all.push({
                    id:    p.id,
                    title: p.title,
                    price: p.variants?.[0]?.price || '0',
                    image: p.images?.[0]?.src || null
                });
            });

            // Follow cursor-based next page from Link header
            const link = r.headers.get('link') || '';
            const m = link.match(/<([^>]+)>;\s*rel="next"/);
            nextUrl = m ? m[1] : null;
            page++;
        }

        return res.json({ products: all, total: all.length });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
