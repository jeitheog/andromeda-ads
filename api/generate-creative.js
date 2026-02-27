import { Buffer } from 'node:buffer';
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { mode, concept, style, imageBase64, mimeType = 'image/jpeg', selectedProduct } = req.body;
    const apiKey = req.headers['x-openai-key'] || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Falta la clave de OpenAI. Añádela en Configuración → APIs de Inteligencia Artificial' });

    // Build a very specific product anchor so the item stays IDENTICAL across concepts
    const productAnchor = selectedProduct
        ? `THE PRODUCT (MUST appear exactly as described — do NOT invent, alter or substitute it):
"${selectedProduct.title}" — price $${selectedProduct.price}
${(selectedProduct.description || '').substring(0, 300)}
Tags/keywords: ${selectedProduct.tags || selectedProduct.type || 'fashion clothing'}

CRITICAL RULE: The garment/item above must look IDENTICAL in every image (same piece, same color, same design, same fabric). Only the background, setting, model pose, lighting and mood change.`
        : '';

    const basePrompt = selectedProduct
        ? `Professional fashion advertisement for Instagram/Facebook/TikTok.

${productAnchor}

AD CONCEPT FOR THIS IMAGE:
Angle: "${concept.angle}" — ${concept.hook}
Headline: "${concept.headline}"
Mood/style: ${style || 'modern, clean, high-fashion editorial'}

COMPOSITION RULES:
- The product ("${selectedProduct.title}") must be the HERO of the image — centered, well-lit, clearly visible
- Change ONLY: background scene, model pose, setting, lighting atmosphere, color grading
- Do NOT change the product itself — same garment, same color, same design every time
- Format: 1080x1080px square, high-end brand aesthetic, bold typography overlay
- Must look like a real paid digital ad for a fashion/clothing brand`
        : `Professional fashion advertisement photo for Instagram/Facebook/TikTok.
Concept angle: "${concept.angle}" — ${concept.hook}
Headline visible in image: "${concept.headline}"
Style: ${style || 'modern, clean, high-fashion editorial'}
Requirements: 1080x1080px square format, high-end fashion brand aesthetic, bold typography overlay, vibrant colors.
The image must look like a real paid digital ad for a clothing/fashion brand.`;

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
                    quality: 'high'
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
            form.append('prompt', `Transform this product photo into a professional fashion ad for Meta/Instagram/TikTok.
CRITICAL: Keep the original product EXACTLY as it appears — same garment, same color, same design. Do NOT alter the product.
Add text overlay: "${concept.headline}"
Add CTA badge: "${concept.cta}"
Concept angle: "${concept.angle}" — ${concept.hook}
Style: ${style || 'clean editorial fashion ad, modern typography, Instagram-ready'}
Only enhance: background, lighting, color grading, composition. The product stays identical.
Make it look like a real paid digital advertisement.`);
            form.append('n', '1');
            form.append('size', '1024x1024');
            form.append('quality', 'high');

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
