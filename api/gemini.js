import { GoogleGenerativeAI } from '@google/generative-ai';

// Конфигурация
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// Инициализация Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default async function handler(req, res) {
  // CORS настройки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight запрос
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Только POST запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Проверка API ключа
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const { 
      messages, 
      prompt, 
      systemInstruction,
      temperature = 0.7,
      maxTokens = 2048,
      topP = 0.95,
      topK = 40
    } = req.body;

    // Определяем модель
    const model = genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      systemInstruction: systemInstruction || 'Ты полезный ассистент.'
    });

    let result;

    // Поддержка разных форматов запросов
    if (messages && Array.isArray(messages)) {
      // Чат формат (как в OpenAI API)
      const chat = model.startChat({
        history: messages.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP,
          topK,
        },
      });

      const lastMessage = messages[messages.length - 1];
      result = await chat.sendMessage(lastMessage.content);
    } else if (prompt) {
      // Простой текстовый запрос
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP,
          topK,
        },
      });
    } else {
      return res.status(400).json({ 
        error: 'Missing required field: messages or prompt' 
      });
    }

    // Формируем ответ
    const response = result.response;
    const text = response.text();

    // Возвращаем в формате, совместимом с OpenAI
    res.status(200).json({
      success: true,
      data: {
        content: text,
        role: 'assistant',
        model: MODEL_NAME,
        usage: {
          totalTokens: response.usageMetadata?.totalTokenCount || 0
        }
      }
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}