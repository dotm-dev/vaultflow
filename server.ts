import { GoogleGenAI } from '@google/genai';
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local environment files
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Retrieve Gemini API Key securely on the server
const apiKey = process.env.GEMINI_API_KEY;
const isDummyKey = !apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.includes('PleaseReplace');

// Initialize Gemini SDK client only if we have a valid key configured
const ai = !isDummyKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * POST /api/categorize
 * Batches merchant names and queries Gemini securely on the backend to predict standard categories.
 */
app.post('/api/categorize', async (req, res) => {
  const { merchants } = req.body;

  if (!merchants || !Array.isArray(merchants)) {
    return res.status(400).json({ error: 'Invalid request payload: "merchants" must be a string array.' });
  }

  if (merchants.length === 0) {
    return res.json({});
  }

  // Fallback if no Gemini API Key is configured
  if (!ai) {
    console.warn('Gemini API key is not configured in .env.local. Falling back to default categories.');
    const fallbackResponse: Record<string, string> = {};
    for (const m of merchants) {
      fallbackResponse[m] = 'Other';
    }
    return res.json(fallbackResponse);
  }

  try {
    const categoriesList = ['Food', 'Transport', 'Utilities', 'Shopping', 'Fun', 'Home', 'Health', 'Other'];
    
    const prompt = `
You are a financial planning engine assistant.
We have a list of raw merchant names: ${JSON.stringify(merchants)}.
Classify each merchant name into exactly one of the following standard categories: ${categoriesList.join(', ')}.
Return your response STRICTLY as a valid JSON object where the keys are the merchant names and values are their corresponding category name (e.g. "Uber": "Transport").
Do not wrap your response in markdown formatting or anything other than a clean, valid JSON string.
`;

    // Query gemini-2.5-flash with JSON mode config
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text || '{}';
    const classification = JSON.parse(resultText);
    res.json(classification);
  } catch (error: any) {
    console.error('Gemini API error during categorization:', error);
    // Safe fallback for runtime API errors (e.g. rate limit, auth error)
    const fallback: Record<string, string> = {};
    for (const m of merchants) {
      fallback[m] = 'Other';
    }
    res.json(fallback);
  }
});

// Serve built frontend assets in production
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Secure Server] VaultFlow API listening securely on http://localhost:${PORT}`);
});
