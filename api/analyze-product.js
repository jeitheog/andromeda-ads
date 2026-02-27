export const config = { maxDuration: 30 };
import { callAI } from './_ai.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { product } = req.body;
    if (!product?.title) return res.status(400).json({ error: 'Falta el producto' });

    const system = `Eres un experto en marketing de moda y publicidad digital. Respondes ÚNICAMENTE con JSON válido, sin markdown ni explicaciones.`;

    const userPrompt = `Analiza este producto de una tienda de moda y genera el briefing completo para una campaña publicitaria.\n\nPRODUCTO:\n- Nombre: ${product.title}\n- Precio: $${product.price}\n- Descripción: ${product.description || 'Sin descripción proporcionada'}\n- Tipo de producto: ${product.type || 'Moda/Ropa'}\n- Tags: ${product.tags || 'Sin tags'}\n\nResponde ÚNICAMENTE con este JSON exacto:\n{\n  "product": "Descripción de venta del producto: qué es, precio, materiales o características clave que lo hacen deseable (2-3 frases directas y atractivas)",\n  "audience": "Perfil del cliente ideal para este producto específico: edad estimada, género, estilo de vida, ocasiones de uso (2-3 frases concretas)",\n  "painPoint": "El problema real o deseo que resuelve este producto: qué frustraba al cliente antes de encontrarlo (1-2 frases con emoción)",\n  "differentiator": "Por qué comprar ESTE producto y no otro: precio, calidad, diseño, exclusividad u otro factor diferenciador (1-2 frases)",\n  "tone": "tono detectado"\n}\n\nPara "tone" elige EXACTAMENTE uno de estos valores:\nelegante y sofisticada | casual y cercana | atrevida y provocadora | minimalista y clean | divertida y jovial | empoderada y feminista`;

    try {
        const { text } = await callAI({
            system,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 600,
            headers: req.headers
        });
        const jsonStr = text.startsWith('{') ? text : text.substring(text.indexOf('{'));
        return res.json(JSON.parse(jsonStr));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
