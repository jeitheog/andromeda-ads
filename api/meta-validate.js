export const config = { maxDuration: 15 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { token, adAccountId, pageId } = req.body;
    if (!token || !adAccountId) return res.status(400).json({ error: 'Faltan token o adAccountId' });

    // Normalize: Meta requires act_ prefix for ad accounts
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    try {
        // Validate token + fetch ad account name
        const r = await fetch(`https://graph.facebook.com/v19.0/${accountId}?fields=name,account_status,currency&access_token=${token}`);
        const d = await r.json();
        if (d.error) {
            if (d.error.code === 190) return res.status(401).json({ error: d.error.error_user_msg || d.error.message, tokenExpired: true });
            throw new Error(d.error.error_user_msg || d.error.message || JSON.stringify(d.error));
        }
        return res.json({ accountName: d.name, currency: d.currency, status: d.account_status });
    } catch (err) {
        return res.status(401).json({ error: err.message });
    }
}
