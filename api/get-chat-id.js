// Служебный эндпоинт для настройки — узнать chat_id группы/чата.
//
// Безопасность:
//  - Работает ТОЛЬКО если в окружении задан ADMIN_DEBUG_KEY. Без него
//    эндпоинт «не существует» (404), а не открыт всем.
//  - Ключ передаётся в заголовке x-admin-key, а не в URL (URL попадает
//    в логи, историю браузера и Referer).
//  - Число попыток ограничено, чтобы ключ нельзя было подобрать.
//
// Использование (один раз при настройке):
//   curl -H "x-admin-key: ВАШ_КЛЮЧ" https://ваш-домен/api/get-chat-id
// После получения chat_id удалите ADMIN_DEBUG_KEY из окружения (эндпоинт
// снова отключится) или удалите этот файл.

const crypto = require('node:crypto');
const { incrWithTtl } = require('../utils/store');
const { getClientIp } = require('../utils/request');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ADMIN_KEY = process.env.ADMIN_DEBUG_KEY;
  if (!ADMIN_KEY) {
    return res.status(404).json({ error: 'Not found' });
  }

  const attempts = await incrWithTtl(`ratelimit:admin:${getClientIp(req)}`, WINDOW_MS);
  if (attempts > MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts' });
  }

  const provided = req.headers?.['x-admin-key'];
  if (typeof provided !== 'string' || !safeEqual(provided, ADMIN_KEY)) {
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
