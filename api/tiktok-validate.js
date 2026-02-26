export const config = { maxDuration: 30 };

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { accessToken, advertiserId } = req.body;
    if (!accessToken || !advertiserId)
        return res.status(400).json({ error: 'Faltan credenciales de TikTok Ads' });

    try {
        const r = await fetch(
            `${BASE}/advertiser/info/?advertiser_ids=${encodeURIComponent(JSON.stringify([advertiserId]))}`,
            { headers: { 'Access-Token': accessToken } }
        );
        const data = await r.json();
        if (data.code !== 0) throw new Error(data.message || `TikTok error ${data.code}`);

        const advertiser = data.data?.list?.[0];
        if (!advertiser) throw new Error('Advertiser no encontrado. Verifica el ID.');

        return res.json({
            accountName: advertiser.advertiser_name,
            advertiserId,
            currency: advertiser.currency,
            timezone: advertiser.timezone
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
