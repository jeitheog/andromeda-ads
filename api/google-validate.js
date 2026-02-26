export const config = { maxDuration: 30 };

const BASE = 'https://googleads.googleapis.com/v17';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { customerId, developerToken, accessToken } = req.body;
    if (!customerId || !developerToken || !accessToken)
        return res.status(400).json({ error: 'Faltan credenciales de Google Ads' });

    const cleanId = customerId.replace(/-/g, '');

    try {
        const r = await fetch(
            `${BASE}/customers/${cleanId}?fields=customer.descriptiveName,customer.currencyCode`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'developer-token': developerToken,
                }
            }
        );
        const data = await r.json();
        if (data.error) throw new Error(data.error.message || data.error.status || JSON.stringify(data.error));

        return res.json({
            accountName: data.customer?.descriptiveName || `Customer ${cleanId}`,
            customerId: cleanId,
            currency: data.customer?.currencyCode || 'USD'
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
