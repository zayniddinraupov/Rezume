// Резервная запись анкеты — если Telegram упадёт, заявка не потеряется.
// Использует Google Apps Script Web App как бесплатный "webhook в Google Sheets":
// 1. Откройте вашу Google Таблицу → Расширения → Apps Script
// 2. Вставьте функцию doPost(e), которая пишет e.postData.contents в новую строку
// 3. Разверните как Web App (доступ: "У кого есть доступ: Все")
// 4. Скопируйте URL веб-приложения в GOOGLE_SHEETS_WEBHOOK_URL
//
// 5. ЗАЩИТА: задайте BACKUP_WEBHOOK_SECRET (длинная случайная строка) здесь и в
//    свойствах скрипта Apps Script (Project Settings → Script properties →
//    BACKUP_WEBHOOK_SECRET). Вебхук доступен «всем», поэтому без секрета
//    любой, кто узнает URL, сможет писать мусор в вашу Таблицу. В doPost:
//
//      function doPost(e) {
//        const data = JSON.parse(e.postData.contents);
//        const secret = PropertiesService.getScriptProperties().getProperty('BACKUP_WEBHOOK_SECRET');
//        if (!secret || data.secret !== secret) {
//          return ContentService.createTextOutput('forbidden');
//        }
//        delete data.secret;
//        // ... запись data в Таблицу ...
//      }
//
// Если переменная URL не задана — модуль просто ничего не делает (не обязателен).
async function backupSubmission(data) {
    const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (!url) return { skipped: true };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...data,
                submitted_at: new Date().toISOString(),
                ...(process.env.BACKUP_WEBHOOK_SECRET ? { secret: process.env.BACKUP_WEBHOOK_SECRET } : {})
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);
        return { ok: response.ok };
    } catch (err) {
        // Резервная запись не должна ронять основной сценарий (отправку в Telegram)
        console.error('backupSubmission failed:', err.message);
        return { ok: false, error: err.message };
    }
}

module.exports = { backupSubmission };
