export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fullname, birthdate, phone, education, experience, languages, programs, salary } = req.body;

  const BOT_TOKEN = '8780268541:AAG7DSXldhj-zOQ6gWp7dN5gIq4YbhdDujQ';
  const CHAT_ID = '-1003712671429';

  const message = `📝 <b>Новая анкета</b>\n\n` +
    `👤 <b>ФИО:</b> ${fullname}\n` +
    `🎂 <b>Дата рождения:</b> ${birthdate}\n` +
    `📱 <b>Телефон:</b> ${phone}\n` +
    `🎓 <b>Образование:</b> ${education || 'Не указано'}\n` +
    `💼 <b>Опыт работы:</b> ${experience || 'Нет опыта'}\n` +
    `🌍 <b>Языки:</b> ${languages || 'Не указаны'}\n` +
    `💻 <b>Программы:</b> ${programs || 'Не указаны'}\n` +
    `💰 <b>Ожидаемая зарплата:</b> ${salary || 'Не указана'}`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      }
    );

    if (response.ok) {
      return res.status(200).json({ success: true });
    } else {
      const error = await response.json();
      return res.status(500).json({ error: error.description });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
