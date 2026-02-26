import { Buffer } from 'node:buffer';
export const config = { maxDuration: 120 };

const BASE = 'https://graph.facebook.com/v19.0';

async function gql(path, method, token, body) {
    const r = await fetch(`${BASE}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, access_token: token })
    });
    const d = await r.json();
    if (d.error) throw new Error(`Meta API: ${d.error.message}`);
    return d;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token   = req.headers['x-meta-token'];
    const account = req.headers['x-meta-account'];
    const pageId  = req.headers['x-meta-page'];

    if (!token || !account) return res.status(400).json({ error: 'Faltan credenciales de Meta' });

    const { campaignName, objective, dailyBudgetUsd, durationDays, destinationUrl, targeting, concepts } = req.body;

    const dailyBudgetCents = Math.round((dailyBudgetUsd || 5) * 100);

    try {
        // ── 1. Create Campaign ──────────────────────────────
        const campaign = await gql(`${account}/campaigns`, 'POST', token, {
            name: campaignName,
            objective: objective || 'OUTCOME_TRAFFIC',
            status: 'ACTIVE',
            special_ad_categories: []
        });

        const adSetIds = [];
        const adIds = [];

        // ── 2. Create Ad Set + Creative + Ad per concept ────
        for (const concept of concepts) {
            const geoLocations = (targeting.countries || ['ES']).map(c => ({ country: c }));
            const genders = targeting.gender === '1' ? [1] : targeting.gender === '2' ? [2] : [];

            // Ad Set
            const adSetBody = {
                campaign_id: campaign.id,
                name: `AdSet_${concept.angle.substring(0, 30)}`,
                daily_budget: dailyBudgetCents,
                billing_event: 'IMPRESSIONS',
                optimization_goal: objective === 'OUTCOME_SALES' ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS',
                bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
                targeting: {
                    geo_locations: { countries: (targeting.countries || ['ES']) },
                    age_min: targeting.ageMin || 18,
                    age_max: targeting.ageMax || 45,
                    ...(genders.length > 0 ? { genders } : {})
                },
                status: 'ACTIVE'
            };
            const adSet = await gql(`${account}/adsets`, 'POST', token, adSetBody);
            adSetIds.push(adSet.id);

            // Upload image if concept has one
            let imageHash = null;
            if (concept.imageB64 && pageId) {
                try {
                    const imgRes = await fetch(`${BASE}/${account}/adimages`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bytes: concept.imageB64, access_token: token })
                    });
                    const imgData = await imgRes.json();
                    imageHash = Object.values(imgData.images || {})[0]?.hash;
                } catch (e) { console.warn('Image upload failed:', e.message); }
            }

            // Ad Creative
            const linkData = {
                message: `${concept.headline}\n\n${concept.body}`,
                link: destinationUrl,
                call_to_action: { type: 'SHOP_NOW', value: { link: destinationUrl } }
            };
            if (imageHash) linkData.image_hash = imageHash;

            let creativeBody = {
                name: `Creative_${concept.angle.substring(0, 30)}`,
                object_story_spec: {
                    page_id: pageId,
                    link_data: linkData
                }
            };

            let creativeId;
            if (pageId) {
                const creative = await gql(`${account}/adcreatives`, 'POST', token, creativeBody);
                creativeId = creative.id;
            }

            // Ad
            const adBody = {
                adset_id: adSet.id,
                name: `Ad_${concept.angle.substring(0, 30)}`,
                status: 'ACTIVE'
            };
            if (creativeId) adBody.creative = { creative_id: creativeId };

            const ad = await gql(`${account}/ads`, 'POST', token, adBody);
            adIds.push(ad.id);
        }

        return res.json({ campaignId: campaign.id, adSetIds, adIds });

    } catch (err) {
        console.error('meta-create-campaign error:', err);
        return res.status(500).json({ error: err.message });
    }
}
