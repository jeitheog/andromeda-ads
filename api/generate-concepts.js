export const config = { maxDuration: 60 };
import { callAI } from './_ai.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { briefing, selectedProduct } = req.body;
    if (!briefing?.product) return res.status(400).json({ error: 'Falta el briefing' });

    const productSection = selectedProduct
        ? `\nPRODUCTO ESPECÍFICO EN FOCO:\n- Nombre: ${selectedProduct.title}\n- Precio: $${selectedProduct.price}\n- Descripción: ${selectedProduct.description || 'Sin descripción'}\n- Tipo: ${selectedProduct.type || ''}\n- Tags: ${selectedProduct.tags || ''}\n\nIMPORTANTE: Los 10 conceptos deben girar EXCLUSIVAMENTE en torno a este producto concreto. El headline, hook y body deben mencionar o referirse directamente a "${selectedProduct.title}". NO hagas conceptos genéricos de marca.`
        : '';

    const system = `Eres un experto copywriter de publicidad digital especializado en moda y ropa. Respondes ÚNICAMENTE con JSON válido, sin markdown ni explicaciones.`;

    const userPrompt = `BRIEFING DE MARCA:\n- Producto/marca: ${briefing.product}\n- Cliente ideal: ${briefing.audience}\n- Dolor principal del cliente: ${briefing.painPoint}\n- Diferenciador: ${briefing.differentiator}\n- Tono de marca: ${briefing.tone || 'moderno y cercano'}\n${productSection}\nGenera exactamente 10 conceptos de anuncios diferentes para publicidad digital (Meta Ads, Google Ads, TikTok).\nEl objetivo de TODOS los anuncios es llevar tráfico directo al sitio web para generar compras online. Solo compra directa en la tienda.\nCada concepto debe tener un ángulo de venta DISTINTO:\nÁngulos sugeridos: FOMO, Prueba social, Transformación, Problema-Solución, Deseo/Aspiración, Identidad, Oferta/Urgencia, Storytelling, Educativo, Curiosidad.\n\nEl CTA siempre debe orientar a la compra: "Comprar ahora", "Ver producto", "Consíguelo ya", "Descúbrelo aquí", "Ir a la tienda", etc.\n\nResponde ÚNICAMENTE con este JSON exacto:\n{\n  "concepts": [\n    {\n      "angle": "Nombre del ángulo de venta",\n      "hook": "Frase de enganche inicial (máx 10 palabras)",\n      "headline": "Titular principal del anuncio (máx 40 caracteres)",\n      "body": "Cuerpo del anuncio (2-3 frases, máx 125 caracteres)",\n      "cta": "Texto del botón CTA orientado a compra (máx 5 palabras)",\n      "painPoint": "Dolor específico que toca este concepto",\n      "targetEmotion": "Emoción principal que activa"\n    }\n  ]\n}`;

    try {
        const { text } = await callAI({
            system,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 2000,
            headers: req.headers
        });
        const jsonStr = text.startsWith('{') ? text : text.substring(text.indexOf('{'));
        return res.json(JSON.parse(jsonStr));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
