(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.normalizeTelegramUsername = api.normalizeTelegramUsername;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Возвращает "@username" если валиден, иначе "".
  // Используется и на клиенте (script.js), и на сервере (api/send-resume.js),
  // чтобы правила нормализации не расходились.
  // Принимает: "@name", "name", "t.me/name", "https://t.me/name?start=1".
  function normalizeTelegramUsername(value) {
    if (typeof value !== 'string') {
      return '';
    }

    let cleaned = value.trim();
    if (!cleaned) {
      return '';
    }

    // убираем префикс-ссылку и ведущие "@" / "/"
    cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '');
    cleaned = cleaned.replace(/^@+/, '');
    cleaned = cleaned.replace(/^\/+/, '');

    // отрезаем хвост ссылки: путь, параметры, якорь
    cleaned = cleaned.split(/[\/?#]/)[0];

    // Telegram: латиница, цифры и "_", начинается с буквы, до 32 символов.
    // Точку оставляем допустимой (как и раньше), минимум 3 символа —
    // мягкая проверка, чтобы не отсекать пограничные случаи, но отсечь мусор.
    if (!/^[A-Za-z][A-Za-z0-9._]{2,31}$/.test(cleaned)) {
      return '';
    }

    return `@${cleaned}`;
  }

  // Простое экранирование для вставки пользовательского текста
  // в HTML-сообщение Telegram (parse_mode: 'HTML').
  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    normalizeTelegramUsername,
    escapeHtml
  };
});
