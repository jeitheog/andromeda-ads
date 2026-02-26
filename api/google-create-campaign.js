export const config = { maxDuration: 120 };

const BASE = 'https://googleads.googleapis.com/v17';

async function gads(path, method, token, devToken, body) {
    const r = await fetch(`${BASE}/${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'developer-token': devToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!r.ok || d.partialFailureError) {
        const err = d.error || d.partialFailureError;
        throw new Error(err?.message || `Google Ads error ${r.status}`);
    }
    return d;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token    = req.headers['x-google-token'];
    const custId   = req.headers['x-google-customer'];
    const devToken = req.headers['x-google-dev-token'];

    if (!token || !custId || !devToken)
        return res.status(400).json({ error: 'Faltan credenciales de Google Ads' });

    const { campaignName, objective, dailyBudgetUsd, destinationUrl, concepts } = req.body;
    const dailyBudgetMicros = Math.round((dailyBudgetUsd || 5) * 1_000_000);

    // Map objective to Google bidding strategy
    const isConversions = objective === 'OUTCOME_SALES';

    try {
        // 1. Create Campaign Budget
        const budgetRes = await gads(`customers/${custId}/campaignBudgets:mutate`, 'POST', token, devToken, {
            operations: [{
                create: {
                    name: `Budget_${campaignName}_${Date.now()}`,
                    amountMicros: dailyBudgetMicros,
                    deliveryMethod: 'STANDARD'
                }
            }]
        });
        const budgetName = budgetRes.results[0].resourceName;

        // 2. Create Campaign
        const campRes = await gads(`customers/${custId}/campaigns:mutate`, 'POST', token, devToken, {
            operations: [{
                create: {
                    name: campaignName,
                    advertisingChannelType: 'SEARCH',
                    status: 'ENABLED',
                    campaignBudget: budgetName,
                    ...(isConversions
                        ? { maximizeConversions: {} }
                        : { targetSpend: {} })
                }
            }]
        });
        const campaignResourceName = campRes.results[0].resourceName;
        const campaignId = campaignResourceName.split('/').pop();

        const adGroupIds = [];
        const adIds = [];

        // 3. Create Ad Group + RSA per concept
        for (const concept of (concepts || [])) {
            const agRes = await gads(`customers/${custId}/adGroups:mutate`, 'POST', token, devToken, {
                operations: [{
                    create: {
                        name: `AG_${concept.angle.substring(0, 30)}`,
                        campaign: campaignResourceName,
                        type: 'SEARCH_STANDARD',
                        cpcBidMicros: 1_000_000
                    }
                }]
            });
            const agName = agRes.results[0].resourceName;
            adGroupIds.push(agName.split('/').pop());

            // Build RSA assets from concept copy
            const headlines = [
                { text: (concept.headline || 'Nueva Colección').substring(0, 30) },
                { text: (concept.hook || 'Descubre las novedades').substring(0, 30) },
                { text: (concept.cta || 'Compra ahora').substring(0, 30) }
            ];
            const descriptions = [
                { text: (concept.body || 'Encuentra tu estilo perfecto').substring(0, 90) },
                { text: (concept.painPoint || 'La moda que buscabas al mejor precio').substring(0, 90) }
            ];

            const adRes = await gads(`customers/${custId}/adGroupAds:mutate`, 'POST', token, devToken, {
                operations: [{
                    create: {
                        adGroup: agName,
                        status: 'ENABLED',
                        ad: {
                            finalUrls: [destinationUrl],
                            responsiveSearchAd: { headlines, descriptions }
                        }
                    }
                }]
            });
            adIds.push(adRes.results[0].resourceName.split('/').pop());
        }

        return res.json({ campaignId, adGroupIds, adIds, platform: 'google' });

    } catch (err) {
        console.error('google-create-campaign error:', err);
        return res.status(500).json({ error: err.message });
    }
}
