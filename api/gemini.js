export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
  // Разрешаем только POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // Получаем тело запроса
  const body = req.body;
  
  // Проверяем наличие ключа в переменных окружения
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  // Проверяем, что есть messages
  if (!body.messages || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Извлекаем последнее сообщение пользователя
    const userMessages = body.messages.filter(msg => msg.role === 'user');
    if (userMessages.length === 0) {
      return res.status(400).json({ error: 'No user message found' });
    }
    
    const lastUserMessage = userMessages[userMessages.length - 1].content;
    
    // Определяем модель (из запроса или дефолтную)
    const modelName = body.model || 'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    // Отправляем запрос в Gemini
    const result = await model.generateContent(lastUserMessage);
    const response = await result.response;
    const text = response.text();

    // Возвращаем в формате, совместимом с OpenAI
    res.status(200).json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: text
          }
        }
      ]
    });

  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
};
