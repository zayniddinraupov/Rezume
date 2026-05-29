export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    fullname, birthdate, gender, phone, city, citizenship, marital, salary,
    telegram, education_level, education_details, experience, courses,
    skills, languages, army, personal_qualities,
    professional_skills, about
  } = req.body;

  const BOT_TOKEN = '8780268541:AAG7DSXldhj-zOQ6gWp7dN5gIq4YbhdDujQ';
  const CHAT_ID = '-1003712671429';
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
    `${telegram ? `✈️ <b>Telegram:</b> ${telegram}\n` : ''}` +
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
    `
<b>Если кандидат подходит, откройте группу и добавьте кандидата вручную.</b>`;
<b>Если кандидат подходит, добавьте его в группу по кнопке ниже.</b>`;

  try {
    await fetch(
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

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
