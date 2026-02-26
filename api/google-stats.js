export const config = { maxDuration: 30 };

const BASE = 'https://googleads.googleapis.com/v17';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const token    = req.headers['x-google-token'];
    const custId   = req.headers['x-google-customer'];
    const devToken = req.headers['x-google-dev-token'];
    const { campaignId } = req.query;

    if (!token || !custId || !campaignId)
        return res.status(400).json({ error: 'Faltan parámetros' });

    const query = `
        SELECT
            ad_group_ad.ad.id,
            ad_group_ad.ad.name,
            metrics.cost_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.average_cpm,
            metrics.conversions,
            metrics.conversions_value
        FROM ad_group_ad
        WHERE campaign.id = ${campaignId}
        AND segments.date DURING LAST_7_DAYS
    `.trim();

    try {
        const r = await fetch(`${BASE}/customers/${custId}/googleAds:search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'developer-token': devToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        const data = await r.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

        const ads = (data.results || []).map(row => {
            const m = row.metrics || {};
            const spend = (parseInt(m.costMicros || 0)) / 1_000_000;
            const revenue = parseFloat(m.conversionsValue || 0);
            const roas = spend > 0 && revenue > 0 ? (revenue / spend).toFixed(2) : 0;

            return {
                id: row.adGroupAd?.ad?.id || '—',
                name: row.adGroupAd?.ad?.name || 'Ad',
                spend: spend.toFixed(2),
                impressions: m.impressions || '0',
                clicks: m.clicks || '0',
                ctr: ((parseFloat(m.ctr || 0)) * 100).toFixed(2),
                cpm: ((parseInt(m.averageCpm || 0)) / 1_000_000).toFixed(2),
                conversions: m.conversions || 0,
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
