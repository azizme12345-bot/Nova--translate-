import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Self-healing icon copying to ensure PWA standards are met
const ensurePwaAssets = () => {
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Find generated asset
  const imagesDir = path.join(__dirname, 'src', 'assets', 'images');
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    const brandImage = files.find(f => f.startsWith('pwa_512x512') && f.endsWith('.jpg'));
    if (brandImage) {
      const srcPath = path.join(imagesDir, brandImage);
      // Copy to required PWA destinations
      const pwaFiles = [
        'pwa-512x512.png',
        'pwa-192x192.png',
        'pwa-maskable-512x512.png',
        'apple-touch-icon.png'
      ];
      pwaFiles.forEach(fileName => {
        const destPath = path.join(publicDir, fileName);
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`Copied brand asset to PWA destination: ${fileName}`);
        }
      });
    }
  }
};

try {
  ensurePwaAssets();
} catch (e) {
  console.error('PWA assets copying warning:', e);
}

const app = express();
const port = process.env.PORT || 3000;

// Increase request limit for base64 OCR image handling
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Google Gemini API
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper to map UI model selections to correct Gemini SDK models
const mapModel = (uiModel: string): string => {
  const modelLower = uiModel.toLowerCase();
  if (modelLower.includes('pro')) {
    // Pro models mapped to the standard pro model preview
    return 'gemini-3.1-pro-preview';
  }
  // All flash/default models mapped to the flagship gemini-3.8-flash
  return 'gemini-3.8-flash';
};

// API Route: Translate Text
app.post('/api/translate', async (req, res) => {
  try {
    const { text, from, to, model } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text input is required' });
    }

    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API Key is missing. Please add it via the Secrets panel in AI Studio.' 
      });
    }

    const targetModel = mapModel(model || 'gemini-3.8-flash');
    
    // Construct structured prompt for perfect context, grammar, and natural localized translation
    const systemInstruction = `You are Nova Translate, a highly advanced multilingual translation engine. 
Translate the user's input text accurately and naturally. 

RULES:
1. Translate from "${from}" to "${to}".
2. If "Auto-detect" is selected as the source language, identify the source language first and then translate it.
3. Keep the translation localized, preserving idioms, tone, and formatting.
4. Output ONLY the translated text. Do not include any explanations, side notes, or markdown wrappers unless the input itself had formatting.
5. If the input text is a single word or short phrase with multiple valid context translations, provide the most natural one.`;

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: text,
      config: {
        systemInstruction,
        temperature: 0.3, // low temperature for precise, accurate translations
      }
    });

    const translatedText = response.text || '';
    res.json({ translation: translatedText.trim() });
  } catch (error: any) {
    console.error('Translation error:', error);
    res.status(500).json({ 
      error: error.message || 'An error occurred during translation. Please try again.' 
    });
  }
});

// API Route: Camera Scan / Image OCR
app.post('/api/ocr', async (req, res) => {
  try {
    const { image, mimeType, model } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image payload is required' });
    }

    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API Key is missing. Please add it via the Secrets panel in AI Studio.' 
      });
    }

    // Strip data prefix if present (e.g., data:image/png;base64,)
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const targetModel = mapModel(model || 'gemini-3.8-flash');
    const targetMime = mimeType || 'image/jpeg';

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: [
        {
          inlineData: {
            mimeType: targetMime,
            data: base64Data
          }
        },
        {
          text: `Extract all legible text and writing from this image. 

RULES:
1. Output ONLY the extracted text. Maintain the formatting, layout, and line breaks where possible.
2. Do not include any intro, outro, conversational fillers, or markdown.
3. If no legible text or writing is present in the image, respond exactly with: "[No legible text found in the image]"`
        }
      ]
    });

    const extractedText = response.text || '';
    res.json({ text: extractedText.trim() });
  } catch (error: any) {
    console.error('OCR/Scan error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to analyze the image. Ensure the file is clear and try again.' 
    });
  }
});

// SEO & Verification Files
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: ${process.env.APP_URL || 'https://nova-translate.example.com'}/sitemap.xml`);
});

app.get('/sitemap.xml', (req, res) => {
  const baseUrl = process.env.APP_URL || 'https://nova-translate.example.com';
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

// Google Search Console Verification placeholder path
app.get('/google81387d7b3ea1e7bd.html', (req, res) => {
  res.send('google-site-verification: google81387d7b3ea1e7bd.html');
});

// Mounting Vite in development or serving build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Dynamic Vite dev server initialization
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

app.listen(port, () => {
  console.log(`Nova Translate Server is running on port ${port}`);
});
