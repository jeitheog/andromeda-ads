export const config = { maxDuration: 30 };

const BASE = 'https://graph.facebook.com/v19.0';
const FIELDS = 'spend,impressions,clicks,ctr,cpm,actions,action_values,reach';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const token     = req.headers['x-meta-token'];
    const account   = req.headers['x-meta-account'];
    const { campaignId } = req.query;

    if (!token || !campaignId) return res.status(400).json({ error: 'Faltan token o campaignId' });

    try {
        // Campaign-level insights
        const campRes = await fetch(
            `${BASE}/${campaignId}/insights?fields=${FIELDS}&date_preset=last_7d&access_token=${token}`
        );
        const campData = await campRes.json();
        if (campData.error) throw new Error(campData.error.message);
        const campInsights = campData.data?.[0] || {};

        // Ad-level insights
        const adsRes = await fetch(
            `${BASE}/${campaignId}/ads?fields=id,name,insights{${FIELDS}}&access_token=${token}`
        );
        const adsData = await adsRes.json();
        if (adsData.error) throw new Error(adsData.error.message);

        const ads = (adsData.data || []).map(ad => {
            const ins = ad.insights?.data?.[0] || {};
            const conversions = (ins.actions || []).find(a =>
                a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
                a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
                a.action_type === 'lead'
            )?.value || 0;
            const revenue = (ins.action_values || []).find(a =>
                a.action_type === 'offsite_conversion.fb_pixel_purchase'
            )?.value || 0;
            const spend = parseFloat(ins.spend || 0);
            const roas = spend > 0 && revenue > 0 ? (parseFloat(revenue) / spend).toFixed(2) : 0;

            return {
                id: ad.id,
                name: ad.name,
                spend: ins.spend || '0',
                impressions: ins.impressions || '0',
                clicks: ins.clicks || '0',
                ctr: ins.ctr || '0',
                cpm: ins.cpm || '0',
                conversions,
                roas
            };
        });

        // Summary
        const totalSpend = ads.reduce((s, a) => s + parseFloat(a.spend), 0);
        const totalImpressions = ads.reduce((s, a) => s + parseInt(a.impressions), 0);
        const totalClicks = ads.reduce((s, a) => s + parseInt(a.clicks), 0);
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
