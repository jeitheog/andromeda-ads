export const config = { maxDuration: 60 };

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

    const token      = req.headers['x-meta-token'];
    const rawAccount = req.headers['x-meta-account'];
    const pageId     = req.headers['x-meta-page'];

    if (!token || !rawAccount || !pageId)
        return res.status(400).json({ error: 'Faltan credenciales de Meta (token, account, page)' });

    const account = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`;

    const { adSetId, imageB64, headline, body: copyBody, destinationUrl } = req.body;

    if (!adSetId || !imageB64 || !destinationUrl)
        return res.status(400).json({ error: 'Faltan adSetId, imageB64 o destinationUrl' });

    try {
        // 1. Upload image bytes to Meta adimages
        const imgRes = await fetch(`${BASE}/${account}/adimages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bytes: imageB64, access_token: token })
        });
        const imgData = await imgRes.json();
        if (imgData.error) {
            const detail = imgData.error.error_user_msg || imgData.error.message;
            throw new Error(`Meta image [${imgData.error.code}]: ${detail}`);
        }
        const imageHash = Object.values(imgData.images || {})[0]?.hash;
        if (!imageHash) throw new Error('Meta no devolvió hash de imagen');

        // 2. Create Ad Creative with the uploaded image
        const creative = await gql(`${account}/adcreatives`, 'POST', token, {
            name: `Creative_img_${Date.now()}`,
            object_story_spec: {
                page_id: pageId,
                link_data: {
                    message: headline || '',
                    link: destinationUrl,
                    image_hash: imageHash,
                    call_to_action: { type: 'SHOP_NOW', value: { link: destinationUrl } }
                }
            }
        });

        // 3. Create Ad in the ad set
        const ad = await gql(`${account}/ads`, 'POST', token, {
            adset_id: adSetId,
            name: `Ad_img_${Date.now()}`,
            creative: { creative_id: creative.id },
            status: 'PAUSED'
        });

        return res.json({ adId: ad.id, creativeId: creative.id, imageHash });
    } catch (err) {
        console.error('meta-upload-creative error:', err);
        return res.status(500).json({ error: err.message });
    }
}
