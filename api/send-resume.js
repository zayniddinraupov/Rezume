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

// ---------- Cloudflare Turnstile (антибот) ----------
// Если TURNSTILE_SECRET_KEY не задан в окружении — проверка пропускается
// (чтобы не сломать форму до того, как вы настроите ключи), но в этом
// случае реальной защиты от ботов НЕТ. Задайте ключ в проде обязательно.
async function verifyTurnstile(token, remoteIp) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        console.warn('TURNSTILE_SECRET_KEY не задан — проверка Turnstile пропущена (небезопасно для прода)');
        return { success: true, skipped: true };
    }

    if (!token || typeof token !== 'string') {
        return { success: false };
    }

    try {
        const body = new URLSearchParams();
        body.append('secret', secret);
        body.append('response', token);
        if (remoteIp && remoteIp !== 'unknown') body.append('remoteip', remoteIp);

        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Turnstile verification request failed:', err.message);
        return { success: false };
    }
}

// ---------- Whitelist / формат-валидация ----------
const ALLOWED_GENDER = ['', 'Мужской', 'Женский'];
const ALLOWED_MARITAL = ['', 'Холост/Не замужем', 'Женат/Замужем', 'Женат, есть дети', 'Замужем, есть дети', 'Разведен/Разведена'];
const ALLOWED_EDUCATION = ['', 'Среднее', 'Среднее профессиональное', 'Высшее (бакалавр)', 'Высшее (магистр)', 'Аспирантура'];
const ALLOWED_ARMY = ['', 'Служил', 'Не служил', 'Освобожден'];
const ALLOWED_SCHEDULE = ['', 'Полный день', 'Неполный день', 'Сменный график', 'Гибкий график', 'Удалённая работа', 'Вахтовый метод'];

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

// ---------- Файл (резюме/фото) ----------
// ВАЖНО: Vercel (и большинство serverless-платформ) ограничивают размер
// тела запроса по умолчанию ~4.5 МБ. Файл кодируется в base64 (~на треть
// больше исходного размера) и едет вместе с остальными полями анкеты в
// одном JSON-запросе, поэтому лимит держим консервативным.
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 МБ
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function isValidFile(file) {
    if (!file || typeof file !== 'object') return { ok: false };
    if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 150) return { ok: false };
    if (!ALLOWED_FILE_TYPES.includes(file.type)) return { ok: false };
    if (typeof file.base64 !== 'string' || !file.base64.length) return { ok: false };

    let buffer;
    try {
        buffer = Buffer.from(file.base64, 'base64');
    } catch {
        return { ok: false };
    }

    if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) return { ok: false };

    return { ok: true, buffer };
}

async function sendTelegramDocument(botToken, chatId, buffer, filename, mimeType, caption, attempt = 1) {
    const MAX_ATTEMPTS = 2;
    try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', caption);
        form.append('document', new Blob([buffer], { type: mimeType }), filename);

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            body: form
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok) {
            const description = payload?.description || 'Telegram API вернул ошибку при отправке файла';
            if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, attempt * 500));
                return sendTelegramDocument(botToken, chatId, buffer, filename, mimeType, caption, attempt + 1);
            }
            return { ok: false, error: description };
        }

        return { ok: true };
    } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, attempt * 500));
            return sendTelegramDocument(botToken, chatId, buffer, filename, mimeType, caption, attempt + 1);
        }
        return { ok: false, error: err.message };
    }
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

    // ---------- Cloudflare Turnstile ----------
    const turnstileResult = await verifyTurnstile(body.turnstileToken, clientIp);
    if (!turnstileResult.success) {
        return res.status(400).json({ error: 'Проверка на робота не пройдена. Обновите страницу и попробуйте снова.', field: 'turnstile' });
    }

    const {
        fullname, birthdate, gender, phone, city, citizenship, marital, salary,
        telegram, education_level, education_details, experience, courses,
        skills, languages, army, personal_qualities,
        professional_skills, about, file, work_schedule
    } = body;

    let fileBuffer = null;
    let fileValidationFailed = false;
    if (file) {
        const fileCheck = isValidFile(file);
        if (!fileCheck.ok) {
            fileValidationFailed = true;
        } else {
            fileBuffer = fileCheck.buffer;
        }
    }

    if (fileValidationFailed) {
        return res.status(400).json({ error: 'Файл не прошёл проверку (тип или размер). Допустимы PDF/JPG/PNG до 3 МБ', field: 'file' });
    }

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
    if (work_schedule !== undefined && !isValidEnum(work_schedule, ALLOWED_SCHEDULE)) {
        return res.status(400).json({ error: 'Некорректное значение поля "График работы"', field: 'work_schedule' });
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
        `${work_schedule ? `🕒 <b>График работы:</b> ${escapeHtml(work_schedule)}\n` : ''}` +
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
        work_schedule, telegram: normalizedTelegram, education_level, education_details, experience,
        courses, skills, languages, army, personal_qualities, professional_skills, about,
        file_attached: Boolean(fileBuffer),
        file_name: fileBuffer ? file.name : ''
    });

    const telegramResult = await sendTelegramMessage(BOT_TOKEN, CHAT_ID, message, GROUP_LINK);
    await backupPromise;

    if (!telegramResult.ok) {
        console.error('Telegram sendMessage failed after retries:', telegramResult.error);
        return res.status(502).json({ error: `Telegram error: ${telegramResult.error}` });
    }

    // Файл отправляем отдельным сообщением уже ПОСЛЕ основной анкеты.
    // Если это не удастся — не проваливаем всю отправку (текст уже дошёл),
    // а просто сообщаем клиенту через fileWarning, чтобы кандидат знал,
    // что стоит прислать файл отдельно.
    let fileWarning = false;
    if (fileBuffer) {
        const caption = `📎 Файл к анкете: ${escapeHtml(fullname)} (${normalizedTelegram})`;
        const docResult = await sendTelegramDocument(BOT_TOKEN, CHAT_ID, fileBuffer, file.name, file.type, caption);
        if (!docResult.ok) {
            console.error('Telegram sendDocument failed:', docResult.error);
            fileWarning = true;
        }
    }

    return res.status(200).json({ success: true, fileWarning });
};
