import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable JSON body parsing with large payload support for images
app.use(express.json({ limit: '35mb' }));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    appName: 'DukanDesk',
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

interface CatalogProductSummary {
  id: string;
  name: string;
  category: string;
  brand: string;
  unit: string;
  sellingPrice: number;
  currentStock: number;
}

// POST /api/analyze-bill
app.post('/api/analyze-bill', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', catalogProducts = [] } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        error: 'Missing bill image data in request payload.',
      });
    }

    // Clean base64 string if it contains data URI prefix
    const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not configured on server.');
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please add GEMINI_API_KEY to user secrets.',
        useFallback: true,
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Format catalogue products for AI matching reference
    const catalogSummary = (catalogProducts as CatalogProductSummary[])
      .slice(0, 100)
      .map(
        (p) =>
          `ID: "${p.id}", Name: "${p.name}", Brand: "${p.brand}", Category: "${p.category}", Rate: ₹${p.sellingPrice}, Unit: "${p.unit}"`
      )
      .join('\n');

    const promptText = `
Analyze this physical bill, receipt, or invoice photograph for DukanDesk shop management.

CRITICAL INSTRUCTIONS:
1. Extract ONLY text and numerical figures that are genuinely visible and legible on this bill.
2. NEVER hallucinate, guess, or invent products, prices, bill numbers, dates, or quantities.
3. If an item line or price is faded, torn, smudged, or partially unreadable, mark confidence as "UNCERTAIN" and explain in matchReason.
4. For each line item found on the bill, attempt to match it with one of the shop's existing catalogue products listed below. If a match is exact or highly probable (e.g. "Kajaria 600x600" matching "Kajaria Tile — Model XYZ"), provide matchedProductId and matchConfidence ("EXACT" or "CONFIDENT"). If uncertain or different, set matchConfidence to "UNCERTAIN" or "NONE", and DO NOT guess.

SHOP CATALOGUE PRODUCTS (Reference for matching):
${catalogSummary || '(No existing catalog provided)'}

Return pure valid JSON matching this schema:
{
  "billNumber": "string or null",
  "date": "string or null (e.g. YYYY-MM-DD or DD/MM/YYYY)",
  "customerName": "string or null",
  "customerPhone": "string or null",
  "supplierName": "string or null",
  "isClear": true or false,
  "warningNotice": "string or null (e.g. if photo is blurry, dark, or partially cut off)",
  "items": [
    {
      "rawText": "verbatim text read on this line",
      "detectedName": "clean item title",
      "brand": "brand if noted",
      "modelCode": "model or code if noted",
      "sizeDimensions": "size dimensions if noted (e.g. 600x600)",
      "quantity": number (e.g. 10),
      "unitPrice": number (unit rate if visible, else 0),
      "totalPrice": number (line subtotal if visible, else 0),
      "matchedProductId": "matching product ID from catalog or null",
      "matchConfidence": "EXACT" | "CONFIDENT" | "UNCERTAIN" | "NONE",
      "matchReason": "short explanation of match or why uncertain"
    }
  ],
  "totalAmount": number (grand total on bill if visible, else 0),
  "paymentModeHint": "Cash" | "UPI" | "Credit" | "Bank Transfer" | "Cheque" | null,
  "notes": "any additional remarks found on the bill"
}
`;

    // Call Gemini 2.5 Flash for vision extraction
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch {
      // Clean possible markdown code fences
      const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResult = JSON.parse(cleaned);
    }

    return res.json(parsedResult);
  } catch (error: any) {
    console.error('Error analyzing bill photo with Gemini:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to analyze bill image.',
      useFallback: true,
    });
  }
});

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DukanDesk Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DukanDesk server:', err);
  process.exit(1);
});
