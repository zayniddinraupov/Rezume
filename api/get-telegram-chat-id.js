// Служебный эндпоинт для разработки — узнать chat_id группы/чата.
// ВАЖНО: после того как вы один раз получили нужный chat_id, либо
// удалите этот файл из продакшена, либо закройте его секретным
// ключом (как ниже), чтобы посторонние не могли читать апдейты бота.

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Простая защита: доступ только с правильным ?key=...
  const ADMIN_KEY = process.env.ADMIN_DEBUG_KEY;
  if (ADMIN_KEY && req.query?.key !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN не задан в окружении' });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const payload = await response.json();

    if (!payload.ok) {
      return res.status(502).json({ error: payload.description || 'Telegram API error' });
    }

    const updates = payload.result || [];
    const chatIds = updates
      .map(update => update.message?.chat?.id || update.my_chat_member?.chat?.id)
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      chatIds: [...new Set(chatIds)]
    });
  } catch (error) {
    console.error('get-chat-id handler error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
