module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Use POST to send resume to Telegram',
      note: 'To get chat ID, add the bot to a group or private chat and use this method: https://api.telegram.org/bot<token>/getUpdates'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    fullname, birthdate, gender, phone, city, citizenship, marital, salary,
    telegram, education_level, education_details, experience, courses,
    skills, languages, army, personal_qualities,
    professional_skills, about
  } = req.body;

  const normalizedTelegram = typeof telegram === 'string'
    ? telegram.trim().replace(/^@+/, '').replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9]/g, '')
    : '';

  if (!normalizedTelegram) {
    return res.status(400).json({ error: 'Введите корректный Telegram-username' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8780268541:AAFjreUJnAJn_wX0-OT6ThEv8RBSCMQu2-o';
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1003712671429';
  const GROUP_LINK = 'https://t.me/+4stHqX6b0rhjNDli';

  const message = `📝 <b>Новая анкета</b>\n\n` +
    `👤 <b>ФИО:</b> ${fullname || 'Не указано'}\n` +
    `🎂 <b>Дата рождения:</b> ${birthdate || 'Не указана'}\n` +
    `${gender ? `⚧ <b>Пол:</b> ${gender}\n` : ''}` +
    `📱 <b>Телефон:</b> ${phone || 'Не указан'}\n` +
    `${city ? `🏙 <b>Город:</b> ${city}\n` : ''}` +
    `${citizenship ? `🏳️ <b>Гражданство:</b> ${citizenship}\n` : ''}` +
    `${marital ? `💍 <b>Семейное положение:</b> ${marital}\n` : ''}` +
    `💰 <b>Зарплата:</b> ${salary || 'Не указана'}\n` +
    `${normalizedTelegram ? `✈️ <b>Telegram:</b> @${normalizedTelegram}\n` : ''}` +
    `🎓 <b>Образование:</b> ${education_level || 'Не указано'}\n` +
    `${education_details ? `📚 <b>Детали образования:</b> ${education_details}\n` : ''}` +
    `💼 <b>Опыт работы:</b> ${experience || 'Нет опыта'}\n` +
    `${courses ? `📜 <b>Курсы:</b> ${courses}\n` : ''}` +
    `⭐ <b>Навыки:</b> ${skills || 'Не указаны'}\n` +
    `🌍 <b>Языки:</b> ${languages || 'Не указаны'}\n` +
    `${army ? `🛡 <b>Армия:</b> ${army}\n` : ''}` +
    `${personal_qualities ? `👤 <b>Личные качества:</b> ${personal_qualities}\n` : ''}` +
    `${professional_skills ? `🔧 <b>Проф. навыки:</b> ${professional_skills}\n` : ''}` +
    `${about ? `📝 <b>О себе:</b> ${about}\n` : ''}` +
    `\n<b>Если кандидат подходит, откройте группу и добавьте кандидата вручную.</b>\n` +
    `<b>Если кандидат подходит, добавьте его в группу по кнопке ниже.</b>`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Открыть группу', url: GROUP_LINK }]
            ]
          }
        })
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      const description = payload?.description || 'Telegram API вернул ошибку';
      console.error('Telegram sendMessage failed:', description);
      return res.status(500).json({ error: `Telegram error: ${description}` });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('send-resume handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}
