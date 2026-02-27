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
    if (d.error) {
        const detail = d.error.error_user_msg || d.error.message || JSON.stringify(d.error);
        throw new Error(`Meta [${d.error.code}]: ${detail}`);
    }
    return d;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers['x-meta-token'];
    const rawAccount = req.headers['x-meta-account'];
    const pageId = req.headers['x-meta-page'];

    if (!token || !rawAccount) return res.status(400).json({ error: 'Faltan credenciales de Meta' });

    // Normalize: Meta requires act_ prefix for ad accounts
    const account = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`;

    const { campaignName, objective, dailyBudgetUsd, durationDays, destinationUrl, targeting, concepts } = req.body;

    // CBO: total daily budget on the campaign, split across ad sets automatically
    const totalDailyBudgetCents = Math.round((dailyBudgetUsd || 5) * 100);

    try {
        // OUTCOME_SALES requires a Meta Pixel — use OUTCOME_TRAFFIC which works without one.
        // Both drive traffic to the website; conversion tracking is handled by the store's own analytics.
        const campaignObjective = 'OUTCOME_TRAFFIC';

        // ── 1. Create Campaign with CBO (budget at campaign level) ──
        const campaign = await gql(`${account}/campaigns`, 'POST', token, {
            name: campaignName,
            objective: campaignObjective,
            status: 'ACTIVE',
            special_ad_categories: [],
            daily_budget: totalDailyBudgetCents,
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
        });

        const adSetIds = [];
        const adIds = [];

        // ── 2. Create Ad Set + Creative + Ad per concept ────
        for (const concept of concepts) {
            const genders = targeting.gender === '1' ? [1] : targeting.gender === '2' ? [2] : [];

            // Ad Set — Using LINK_CLICKS to avoid Pixel requirement for simpler setup
            const adSetBody = {
                campaign_id: campaign.id,
                name: `AdSet_${concept.angle.substring(0, 30)}`,
                billing_event: 'IMPRESSIONS',
                optimization_goal: 'LINK_CLICKS',
                targeting: {
                    geo_locations: { countries: targeting.countries || ['ES'] },
                    age_min: targeting.ageMin || 18,
                    age_max: targeting.ageMax || 45,
                    ...(genders.length > 0 ? { genders } : {}),
                    targeting_automation: { advantage_audience: 0 }
                },
                status: 'ACTIVE'
            };

            let adSet;
            try {
                adSet = await gql(`${account}/adsets`, 'POST', token, adSetBody);
                adSetIds.push(adSet.id);
            } catch (e) {
                console.error(`Ad Set creation failed for ${concept.angle}:`, e.message);
                continue; // Skip the rest of this concept if ad set fails
            }

            // Upload image by URL if concept has one (imageUrl passed instead of heavy base64)
            let imageHash = null;
            if (concept.imageUrl) {
                try {
                    const imgRes = await fetch(`${BASE}/${account}/adimages`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: concept.imageUrl, access_token: token })
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

            // Creative + Ad
            let creativeId;
            if (pageId) {
                try {
                    const creative = await gql(`${account}/adcreatives`, 'POST', token, creativeBody);
                    creativeId = creative.id;
                } catch (e) {
                    console.warn(`Creative failed (page ID issue?): ${e.message}`);
                }
            }

            if (creativeId) {
                try {
                    const adBody = {
                        adset_id: adSet.id,
                        name: `Ad_${concept.angle.substring(0, 30)}`,
                        creative: { creative_id: creativeId },
                        status: 'ACTIVE'
                    };
                    const ad = await gql(`${account}/ads`, 'POST', token, adBody);
                    adIds.push(ad.id);
                } catch (e) {
                    console.warn(`Ad creation failed: ${e.message}`);
                }
            }
        }

        return res.json({ campaignId: campaign.id, adSetIds, adIds });

    } catch (err) {
        console.error('meta-create-campaign error:', err);
        return res.status(500).json({ error: err.message });
    }
}
