module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8780268541:AAFjreUJnAJn_wX0-OT6ThEv8RBSCMQu2-o';

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const payload = await response.json();

    if (!payload.ok) {
      return res.status(500).json({ error: payload.description || 'Telegram API error' });
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
    return res.status(500).json({ error: error.message });
  }
};
