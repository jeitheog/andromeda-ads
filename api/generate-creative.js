import { Buffer } from 'node:buffer';
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { mode, concept, style, imageBase64, mimeType = 'image/jpeg', selectedProduct } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

    const productContext = selectedProduct
        ? `\nFeatured product: "${selectedProduct.title}" at $${selectedProduct.price}. ${(selectedProduct.description || '').substring(0, 200)}`
        : '';

    const basePrompt = `Professional fashion advertisement photo for Instagram/Facebook/TikTok.
Concept angle: "${concept.angle}" — ${concept.hook}
Headline visible in image: "${concept.headline}"${productContext}
Style: ${style || 'modern, clean, high-fashion editorial'}
Requirements: 1080x1080px square format, high-end fashion brand aesthetic, bold typography overlay, vibrant colors.
The image must look like a real paid digital ad for a clothing/fashion brand.${selectedProduct ? ` Feature the product "${selectedProduct.title}" prominently in the composition.` : ''}`;

    try {
        let b64;

        if (mode === 'generate') {
            // Generate from scratch
            const r = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-image-1',
                    prompt: basePrompt,
                    n: 1,
                    size: '1024x1024',
                    quality: 'medium'
                })
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`);
            b64 = d.data[0].b64_json;

        } else if (mode === 'edit' && imageBase64) {
            // Edit product photo
            const buffer = Buffer.from(imageBase64, 'base64');
            const blob = new Blob([buffer], { type: mimeType });
            const form = new FormData();
            form.append('model', 'gpt-image-1');
            form.append('image', blob, 'product.jpg');
            form.append('prompt', `Transform this product photo into a professional fashion Meta ad.
Add the text overlay: "${concept.headline}"
CTA badge: "${concept.cta}"
Style: ${style || 'clean editorial fashion ad, modern typography, Instagram-ready'}
Keep the original product visible and prominent. Make it look like a real paid advertisement.`);
            form.append('n', '1');
            form.append('size', '1024x1024');
            form.append('quality', 'medium');

            const r = await fetch('https://api.openai.com/v1/images/edits', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: form
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error?.message || `OpenAI ${r.status}`);
            b64 = d.data[0].b64_json;

        } else if (mode === 'manual' && imageBase64) {
            // Return the uploaded image as-is (user's own image)
            b64 = imageBase64;
        } else {
            return res.status(400).json({ error: 'Modo no válido o imagen faltante' });
        }

        return res.json({ b64 });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
