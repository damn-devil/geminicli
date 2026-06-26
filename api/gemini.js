import { GoogleGenerativeAI } from '@google/generative-ai';

// Все переменные из Vercel Environment Variables
const {
  GEMINI_API_KEY,
  GEMINI_MODEL = 'gemini-1.5-flash',
  GEMINI_TEMPERATURE = '0.7',
  GEMINI_MAX_TOKENS = '2048',
  ALLOWED_ORIGINS = '*',
  CLIENT_API_KEY = null,  // Опционально для аутентификации
  NODE_ENV = 'production'
} = process.env;

// Инициализация Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Парсинг CORS origins
const allowedOrigins = ALLOWED_ORIGINS === '*' 
  ? ['*'] 
  : ALLOWED_ORIGINS.split(',').map(o => o.trim());

export default async function handler(req, res) {
  // --- CORS ---
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- Аутентификация (опционально) ---
  if (CLIENT_API_KEY) {
    const clientKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
    if (clientKey !== CLIENT_API_KEY) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid API key' 
      });
    }
  }

  // --- GET запрос для проверки статуса ---
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      model: GEMINI_MODEL,
      environment: NODE_ENV,
      timestamp: new Date().toISOString()
    });
  }

  // --- POST запрос ---
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Проверка API ключа Gemini
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not set in environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'Gemini API key not configured'
      });
    }

    const { 
      messages, 
      prompt, 
      systemInstruction,
      temperature = parseFloat(GEMINI_TEMPERATURE),
      maxTokens = parseInt(GEMINI_MAX_TOKENS),
      topP = 0.95,
      topK = 40,
      stream = false
    } = req.body;

    // --- Обработка стриминга ---
    if (stream) {
      // Для стриминга нужно использовать другой подход
      // См. расширенную версию ниже
      return res.status(400).json({ 
        error: 'Streaming not supported in this endpoint' 
      });
    }

    // Определяем модель
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      ...(systemInstruction && { systemInstruction })
    });

    let result;

    // --- Обработка разных форматов ---
    if (messages && Array.isArray(messages) && messages.length > 0) {
      // Чат формат (OpenAI-совместимый)
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'user' || msg.role === 'system' ? 'user' : 'model',
        parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
      }));

      const chat = model.startChat({
        history: history,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP,
          topK,
        },
      });

      const lastMessage = messages[messages.length - 1];
      const content = typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : JSON.stringify(lastMessage.content);
      
      result = await chat.sendMessage(content);
      
    } else if (prompt) {
      // Простой запрос
      result = await model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ text: prompt }] 
        }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP,
          topK,
        },
      });
    } else {
      return res.status(400).json({ 
        error: 'Missing required field',
        message: 'Provide either "messages" or "prompt" in request body'
      });
    }

    // --- Формирование ответа ---
    const response = result.response;
    const text = response.text();

    res.status(200).json({
      success: true,
      data: {
        id: `gemini-${Date.now()}`,
        content: text,
        role: 'assistant',
        model: GEMINI_MODEL,
        created: Math.floor(Date.now() / 1000),
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0
        },
        finishReason: 'stop'
      }
    });

  } catch (error) {
    console.error('Gemini API Error:', {
      message: error.message,
      stack: NODE_ENV === 'development' ? error.stack : undefined,
      status: error.status
    });

    // Обработка специфических ошибок Gemini
    let statusCode = 500;
    let errorMessage = error.message;

    if (error.message?.includes('API key')) {
      statusCode = 401;
      errorMessage = 'Invalid Gemini API key';
    } else if (error.message?.includes('quota')) {
      statusCode = 429;
      errorMessage = 'Rate limit exceeded';
    } else if (error.message?.includes('safety')) {
      statusCode = 400;
      errorMessage = 'Content blocked by safety filters';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      ...(NODE_ENV === 'development' && { stack: error.stack })
    });
  }
}