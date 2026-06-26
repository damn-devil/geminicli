import { GoogleGenerativeAI } from '@google/generative-ai';

// Только API ключ и модель из environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const { messages, prompt } = req.body;

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    
    let result;

    if (messages && Array.isArray(messages)) {
      // Чат режим
      const chat = model.startChat({
        history: messages.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }))
      });

      const lastMessage = messages[messages.length - 1];
      result = await chat.sendMessage(lastMessage.content);
    } else if (prompt) {
      // Простой режим
      result = await model.generateContent(prompt);
    } else {
      return res.status(400).json({ error: 'Provide messages or prompt' });
    }

    const response = result.response;
    const text = response.text();

    res.status(200).json({
      success: true,
      content: text
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}