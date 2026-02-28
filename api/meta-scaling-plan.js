export const config = { maxDuration: 60 };

const BASE = 'https://graph.facebook.com/v19.0';

function metaError(d) {
    const e = new Error(d.error.message || JSON.stringify(d.error));
    e.code = d.error.code;
    return e;
}

async function gql(path, method, token, body) {
    const r = await fetch(`${BASE}/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, access_token: token })
    });
    const d = await r.json();
    if (d.error) throw metaError(d);
    return d;
}

function evaluate(value, operator, threshold) {
    switch (operator) {
        case '>':  return value > threshold;
        case '<':  return value < threshold;
        case '>=': return value >= threshold;
        case '<=': return value <= threshold;
        default:   return false;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token     = req.headers['x-meta-token'];
    const rawAccount = req.headers['x-meta-account'];
    if (!token || !rawAccount) return res.status(400).json({ error: 'Faltan credenciales de Meta' });

    const account = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`;
    const { campaignId, rules } = req.body;

    if (!campaignId || !rules?.length) {
        return res.status(400).json({ error: 'Faltan campaignId o rules' });
    }

    try {
        // 1. Fetch ads with insights for this campaign
        const adsRes = await fetch(
            `${BASE}/${account}/ads?fields=id,name,status,adset_id&filtering=[{"field":"campaign.id","operator":"EQUAL","value":"${campaignId}"}]&limit=50&access_token=${token}`
        );
        const adsData = await adsRes.json();
        if (adsData.error) {
            if (adsData.error.code === 190) return res.status(401).json({ error: adsData.error.message, tokenExpired: true });
            throw metaError(adsData);
        }
        const ads = adsData.data || [];

        if (!ads.length) return res.json({ applied: [], message: 'No se encontraron anuncios en esta campaña' });

        // 2. Fetch insights (7d) for each ad
        const insights = {};
        const since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const until = new Date().toISOString().split('T')[0];

        await Promise.all(ads.map(async ad => {
            const r = await fetch(
                `${BASE}/${ad.id}/insights?fields=spend,impressions,clicks,ctr,cpm,actions,action_values&time_range={"since":"${since}","until":"${until}"}&access_token=${token}`
            );
            const d = await r.json();
            const ins = d.data?.[0] || {};
            const purchases = (ins.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
            const purchaseValue = (ins.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
            const spend = parseFloat(ins.spend || 0);
            insights[ad.id] = {
                spend,
                impressions: parseInt(ins.impressions || 0),
                clicks: parseInt(ins.clicks || 0),
                ctr: parseFloat(ins.ctr || 0),
                cpm: parseFloat(ins.cpm || 0),
                conversions: parseInt(purchases),
                roas: spend > 0 ? parseFloat(purchaseValue) / spend : 0
            };
        }));

        // 3. Evaluate rules per ad and collect actions
        const applied = [];
        const import_time = 0.3 * 1000;

        for (const ad of ads) {
            const stats = insights[ad.id] || {};
            for (const rule of rules) {
                const statValue = stats[rule.metric] ?? 0;
                if (!evaluate(statValue, rule.operator, rule.threshold)) continue;

                let actionDesc = '';
                try {
                    if (rule.action === 'pause') {
                        await gql(ad.id, 'POST', token, { status: 'PAUSED' });
                        actionDesc = 'Pausado';
                    } else if (rule.action === 'activate') {
                        await gql(ad.id, 'POST', token, { status: 'ACTIVE' });
                        actionDesc = 'Activado';
                    } else if (rule.action === 'scale_budget' || rule.action === 'reduce_budget') {
                        // Get current adset budget
                        const adsetRes = await fetch(`${BASE}/${ad.adset_id}?fields=daily_budget&access_token=${token}`);
                        const adsetData = await adsetRes.json();
                        const currentBudget = parseInt(adsetData.daily_budget || 0);
                        const pct = (rule.actionValue || 50) / 100;
                        const newBudget = rule.action === 'scale_budget'
                            ? Math.round(currentBudget * (1 + pct))
                            : Math.round(currentBudget * (1 - pct));
                        if (newBudget > 0) {
                            await gql(ad.adset_id, 'POST', token, { daily_budget: newBudget });
                            const from = (currentBudget / 100).toFixed(2);
                            const to   = (newBudget / 100).toFixed(2);
                            actionDesc = `Presupuesto $${from} → $${to}/día`;
                        }
                    }

                    if (actionDesc) {
                        applied.push({ adId: ad.id, adName: ad.name, action: actionDesc, metric: rule.metric, value: statValue });
                    }
                } catch (e) {
                    applied.push({ adId: ad.id, adName: ad.name, action: `Error: ${e.message}`, metric: rule.metric, value: statValue });
                }

                await new Promise(r => setTimeout(r, import_time)); // rate limit
                break; // one action per ad per execution
            }
        }

        return res.json({ applied, total: ads.length });

    } catch (err) {
        const status = err.code === 190 ? 401 : 500;
        return res.status(status).json({ error: err.message, tokenExpired: err.code === 190 });
    }
}
