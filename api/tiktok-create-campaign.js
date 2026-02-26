export const config = { maxDuration: 120 };

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

// TikTok location IDs for common countries
const COUNTRY_LOCATION_IDS = {
    ES: '6356726', MX: '3996063', AR: '3865483', CO: '3686110',
    US: '6252001', PE: '3932488', CL: '3895114', VE: '3625428',
    EC: '3658394', BO: '3923057', PY: '3437598', UY: '3439705',
    GB: '2635167', FR: '3017382', IT: '3175395', DE: '2921044',
    BR: '3469034', PT: '2264397'
};

async function ttk(path, method, token, body) {
    const r = await fetch(`${BASE}/${path}`, {
        method,
        headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const d = await r.json();
    if (d.code !== 0) throw new Error(d.message || `TikTok API error ${d.code}`);
    return d.data;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token      = req.headers['x-tiktok-token'];
    const advertiser = req.headers['x-tiktok-advertiser'];

    if (!token || !advertiser)
        return res.status(400).json({ error: 'Faltan credenciales de TikTok' });

    const { campaignName, objective, dailyBudgetUsd, durationDays, destinationUrl, targeting, concepts } = req.body;
    const totalBudget = (dailyBudgetUsd || 5) * (durationDays || 7);

    const locationIds = (targeting?.countries || ['ES'])
        .map(c => COUNTRY_LOCATION_IDS[c.toUpperCase()])
        .filter(Boolean);

    const isConversions = objective === 'OUTCOME_SALES';
    const gender = targeting?.gender === '2' ? 'GENDER_FEMALE'
                 : targeting?.gender === '1' ? 'GENDER_MALE'
                 : 'GENDER_UNLIMITED';

    try {
        // 1. Create Campaign
        const campaign = await ttk('campaign/create/', 'POST', token, {
            advertiser_id: advertiser,
            campaign_name: campaignName,
            objective_type: isConversions ? 'PRODUCT_SALES' : 'TRAFFIC',
            budget_mode: 'BUDGET_MODE_TOTAL',
            budget: totalBudget
        });

        const adGroupIds = [];
        const adIds = [];

        // 2. Ad Group + Ad per concept
        for (const concept of (concepts || [])) {
            const adGroup = await ttk('adgroup/create/', 'POST', token, {
                advertiser_id: advertiser,
                campaign_id: campaign.campaign_id,
                adgroup_name: `AG_${concept.angle.substring(0, 30)}`,
                placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
                budget_mode: 'BUDGET_MODE_TOTAL',
                budget: totalBudget,
                schedule_type: 'SCHEDULE_FROM_NOW',
                optimize_goal: isConversions ? 'CONVERT' : 'CLICK',
                billing_event: 'OCPM',
                gender,
                age_groups: ['AGE_25_34', 'AGE_35_44'],
                ...(locationIds.length > 0 ? { location_ids: locationIds } : {}),
                promotion_type: 'WEBSITE',
                ...(isConversions ? { external_action: 'COMPLETE_PAYMENT' } : {})
            });
            adGroupIds.push(adGroup.adgroup_id);

            // Build ad body
            const adBody = {
                advertiser_id: advertiser,
                adgroup_id: adGroup.adgroup_id,
                creatives: [{
                    ad_name: `Ad_${concept.angle.substring(0, 30)}`,
                    ad_format: 'SINGLE_IMAGE',
                    ad_text: `${concept.hook || ''}\n\n${concept.body || ''}`.substring(0, 100),
                    call_to_action: 'SHOP_NOW',
                    landing_page_url: destinationUrl
                }]
            };

            // Try to upload image if available
            if (concept.imageB64) {
                try {
                    const imgData = await ttk('file/image/ad/upload/', 'POST', token, {
                        advertiser_id: advertiser,
                        upload_type: 'UPLOAD_BY_FILE',
                        image_file: concept.imageB64,
                        image_signature: ''
                    });
                    adBody.creatives[0].image_ids = [imgData.image_id];
                } catch (e) { console.warn('TikTok image upload failed:', e.message); }
            }

            const ad = await ttk('ad/create/', 'POST', token, adBody);
            adIds.push(ad.ad_ids?.[0] || ad.ad_id);
        }

        return res.json({ campaignId: campaign.campaign_id, adGroupIds, adIds, platform: 'tiktok' });

    } catch (err) {
        console.error('tiktok-create-campaign error:', err);
        return res.status(500).json({ error: err.message });
    }
}
