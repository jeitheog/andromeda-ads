export const config = { maxDuration: 30 };

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const token      = req.headers['x-tiktok-token'];
    const advertiser = req.headers['x-tiktok-advertiser'];
    const { campaignId } = req.query;

    if (!token || !advertiser || !campaignId)
        return res.status(400).json({ error: 'Faltan parámetros' });

    const endDate   = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];

    try {
        const r = await fetch(`${BASE}/report/integrated/get/`, {
            method: 'POST',
            headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                advertiser_id: advertiser,
                report_type: 'BASIC',
                dimensions: ['ad_id'],
                metrics: ['spend', 'impressions', 'clicks', 'ctr', 'cpm', 'complete_payment', 'complete_payment_value'],
                data_level: 'AUCTION_AD',
                start_date: startDate,
                end_date: endDate,
                filters: [{ field_name: 'campaign_id', filter_type: 'IN', filter_value: `["${campaignId}"]` }]
            })
        });
        const data = await r.json();
        if (data.code !== 0) throw new Error(data.message || `TikTok ${data.code}`);

        const ads = (data.data?.list || []).map(row => {
            const m = row.metrics || {};
            const spend   = parseFloat(m.spend || 0);
            const revenue = parseFloat(m.complete_payment_value || 0);
            const roas    = spend > 0 && revenue > 0 ? (revenue / spend).toFixed(2) : 0;
            return {
                id:          row.dimensions?.ad_id || '—',
                name:        `Ad ${row.dimensions?.ad_id || '—'}`,
                spend:       m.spend || '0',
                impressions: m.impressions || '0',
                clicks:      m.clicks || '0',
                ctr:         ((parseFloat(m.ctr || 0)) * 100).toFixed(2),
                cpm:         m.cpm || '0',
                conversions: m.complete_payment || 0,
                roas
            };
        });

        const totalSpend       = ads.reduce((s, a) => s + parseFloat(a.spend), 0);
        const totalImpressions = ads.reduce((s, a) => s + parseInt(a.impressions), 0);
        const totalClicks      = ads.reduce((s, a) => s + parseInt(a.clicks), 0);
        const totalConversions = ads.reduce((s, a) => s + parseInt(a.conversions), 0);

        return res.json({
            summary: {
                spend: totalSpend,
                impressions: totalImpressions,
                clicks: totalClicks,
                ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0,
                cpm: totalImpressions > 0 ? ((totalSpend / totalImpressions) * 1000).toFixed(2) : 0,
                conversions: totalConversions
            },
            ads
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
