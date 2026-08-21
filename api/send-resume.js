const { normalizeTelegramUsername, escapeHtml } = require('../utils/telegram');
const { incrWithTtl } = require('../utils/store');
const { backupSubmission } = require('../utils/backup');

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 минут
const RATE_LIMIT_MAX = 5;                    // не больше 5 отправок с одного IP за окно

const DUPLICATE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 часов
// Порог = 1: если этот же Telegram-username уже отправлял анкету в
// пределах окна, повторную отправку блокируем.

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}

// ---------- Whitelist / формат-валидация ----------
const ALLOWED_GENDER = ['', 'Мужской', 'Женский'];
const ALLOWED_MARITAL = ['', 'Холост/Не замужем', 'Женат/Замужем', 'Женат, есть дети', 'Замужем, есть дети', 'Разведен/Разведена'];
const ALLOWED_EDUCATION = ['', 'Среднее', 'Среднее профессиональное', 'Высшее (бакалавр)', 'Высшее (магистр)', 'Аспирантура'];
const ALLOWED_ARMY = ['', 'Служил', 'Не служил', 'Освобожден'];

const MAX_LEN = {
    fullname: 100,
    phone: 16,
    city: 80,
    citizenship: 80,
    salary: 40,
    education_details: 1000,
    experience: 2000,
    courses: 1000,
    skills: 500,
    languages: 300,
    personal_qualities: 500,
    professional_skills: 500,
    about: 1500
};

function isValidEnum(value, allowed) {
    return typeof value === 'string' && allowed.includes(value);
}

function isValidLength(value, max) {
    return typeof value === 'string' && value.length <= max;
}

function isValidPhone(value) {
    return typeof value === 'string' && /^\+?\d{7,15}$/.test(value.trim());
}

function isAdultInRange(birthdateStr) {
    const date = new Date(birthdateStr);
    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age--;

    return age >= 18 && age <= 35;
}

async function sendTelegramMessage(botToken, chatId, message, groupLink, attempt = 1) {
    const MAX_ATTEMPTS = 3;
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: 'Открыть группу', url: groupLink }]]
                    }
                })
            }
        );

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok) {
            const description = payload?.description || 'Telegram API вернул ошибку';
            // Ретраим только на временные сбои (5xx / сетевые), не на 4xx (например, бот не в чате)
            if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, attempt * 500));
                return sendTelegramMessage(botToken, chatId, message, groupLink, attempt + 1);
            }
            return { ok: false, error: description };
        }

        return { ok: true };
    } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, attempt * 500));
            return sendTelegramMessage(botToken, chatId, message, groupLink, attempt + 1);
        }
        return { ok: false, error: err.message };
    }
}

module.exports = async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({
            message: 'Use POST to send resume to Telegram',
            note: 'To get chat ID, add the bot to a group or private chat and use /api/get-chat-id'
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const GROUP_LINK = process.env.TELEGRAM_GROUP_LINK || 'https://t.me/+4stHqX6b0rhjNDli';

    if (!BOT_TOKEN || !CHAT_ID) {
        console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не заданы в окружении');
        return res.status(500).json({ error: 'Сервер не настроен. Обратитесь к администратору.' });
    }

    // ---------- Rate limit по IP ----------
    const clientIp = getClientIp(req);
    const attemptsFromIp = await incrWithTtl(`ratelimit:ip:${clientIp}`, RATE_LIMIT_WINDOW_MS);
    if (attemptsFromIp > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' });
    }

    const body = req.body || {};

    // ---------- Honeypot ----------
    if (typeof body.company_site === 'string' && body.company_site.trim().length > 0) {
        return res.status(200).json({ success: true });
    }

    const {
        fullname, birthdate, gender, phone, city, citizenship, marital, salary,
        telegram, education_level, education_details, experience, courses,
        skills, languages, army, personal_qualities,
        professional_skills, about
    } = body;

    // ---------- Валидация ----------
    if (!fullname || !String(fullname).trim() || !isValidLength(String(fullname).trim(), MAX_LEN.fullname)) {
        return res.status(400).json({ error: 'Введите корректное ФИО', field: 'fullname' });
    }

    if (!birthdate || !isAdultInRange(birthdate)) {
        return res.status(400).json({ error: 'Возраст должен быть от 18 до 35 лет', field: 'birthdate' });
    }

    if (!phone || !isValidPhone(phone)) {
        return res.status(400).json({ error: 'Введите корректный номер телефона', field: 'phone' });
    }

    if (gender !== undefined && !isValidEnum(gender, ALLOWED_GENDER)) {
        return res.status(400).json({ error: 'Некорректное значение поля "Пол"', field: 'gender' });
    }
    if (marital !== undefined && !isValidEnum(marital, ALLOWED_MARITAL)) {
        return res.status(400).json({ error: 'Некорректное значение поля "Семейное положение"', field: 'marital' });
    }
    if (education_level !== undefined && !isValidEnum(education_level, ALLOWED_EDUCATION)) {
        return res.status(400).json({ error: 'Некорректный уровень образования', field: 'education' });
    }
    if (army !== undefined && !isValidEnum(army, ALLOWED_ARMY)) {
        return res.status(400).json({ error: 'Некорректное значение поля "Армия"', field: 'army' });
    }

    const textFields = { city, citizenship, salary, education_details, experience, courses, skills, languages, personal_qualities, professional_skills, about };
    for (const [key, value] of Object.entries(textFields)) {
        if (value !== undefined && value !== null && !isValidLength(String(value), MAX_LEN[key])) {
            return res.status(400).json({ error: 'Поле превышает допустимую длину', field: key });
        }
    }

    const normalizedTelegram = normalizeTelegramUsername(telegram);
    if (!normalizedTelegram) {
        return res.status(400).json({ error: 'Введите корректный Telegram-username', field: 'telegram' });
    }

    // ---------- Защита от дублей: тот же username не чаще раза в 6 часов ----------
    const duplicateCount = await incrWithTtl(`submit:tg:${normalizedTelegram.toLowerCase()}`, DUPLICATE_WINDOW_MS);
    if (duplicateCount > 1) {
        return res.status(429).json({ error: 'Вы уже отправляли анкету недавно. Мы её получили — дождитесь ответа.' });
    }

    const message = `📝 <b>Новая анкета</b>\n\n` +
        `👤 <b>ФИО:</b> ${escapeHtml(fullname)}\n` +
        `🎂 <b>Дата рождения:</b> ${escapeHtml(birthdate)}\n` +
        `${gender ? `⚧ <b>Пол:</b> ${escapeHtml(gender)}\n` : ''}` +
        `📱 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
        `${city ? `🏙 <b>Город:</b> ${escapeHtml(city)}\n` : ''}` +
        `${citizenship ? `🏳️ <b>Гражданство:</b> ${escapeHtml(citizenship)}\n` : ''}` +
        `${marital ? `💍 <b>Семейное положение:</b> ${escapeHtml(marital)}\n` : ''}` +
        `💰 <b>Зарплата:</b> ${escapeHtml(salary) || 'Не указана'}\n` +
        `✈️ <b>Telegram:</b> ${normalizedTelegram}\n` +
        `🎓 <b>Образование:</b> ${escapeHtml(education_level) || 'Не указано'}\n` +
        `${education_details ? `📚 <b>Детали образования:</b> ${escapeHtml(education_details)}\n` : ''}` +
        `💼 <b>Опыт работы:</b> ${escapeHtml(experience) || 'Нет опыта'}\n` +
        `${courses ? `📜 <b>Курсы:</b> ${escapeHtml(courses)}\n` : ''}` +
        `⭐ <b>Навыки:</b> ${escapeHtml(skills) || 'Не указаны'}\n` +
        `🌍 <b>Языки:</b> ${escapeHtml(languages) || 'Не указаны'}\n` +
        `${army ? `🛡 <b>Армия:</b> ${escapeHtml(army)}\n` : ''}` +
        `${personal_qualities ? `👤 <b>Личные качества:</b> ${escapeHtml(personal_qualities)}\n` : ''}` +
        `${professional_skills ? `🔧 <b>Проф. навыки:</b> ${escapeHtml(professional_skills)}\n` : ''}` +
        `${about ? `📝 <b>О себе:</b> ${escapeHtml(about)}\n` : ''}` +
        `\n<b>Если кандидат подходит, добавьте его в группу по кнопке ниже.</b>`;

    // Резервная запись — не блокирует и не проваливает основной ответ,
    // если Google Sheets webhook не настроен или недоступен.
    const backupPromise = backupSubmission({
        fullname, birthdate, gender, phone, city, citizenship, marital, salary,
        telegram: normalizedTelegram, education_level, education_details, experience,
        courses, skills, languages, army, personal_qualities, professional_skills, about
    });

    const telegramResult = await sendTelegramMessage(BOT_TOKEN, CHAT_ID, message, GROUP_LINK);
    await backupPromise;

    if (!telegramResult.ok) {
        console.error('Telegram sendMessage failed after retries:', telegramResult.error);
        // Если резервная копия хотя бы записалась — сообщаем честно, но не как полный провал
        return res.status(502).json({ error: `Telegram error: ${telegramResult.error}` });
    }

    return res.status(200).json({ success: true });
};
