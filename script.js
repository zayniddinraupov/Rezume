 const phoneInput = document.getElementById('phone');
const birthInput = document.getElementById('birthdate');

// Ограничение календаря 18-35 лет
const today = new Date();
birthInput.max = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).toISOString().split("T")[0];
birthInput.min = new Date(today.getFullYear() - 35, today.getMonth(), today.getDate()).toISOString().split("T")[0];

// Маска телефона +998
phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    let result = '+998';
    
    if (value.length > 0) {
        result += ' (' + value.substring(0, 2);
    }
    if (value.length > 2) {
        result += ') ' + value.substring(2, 5);
    }
    if (value.length > 5) {
        result += '-' + value.substring(5, 7);
    }
    if (value.length > 7) {
        result += '-' + value.substring(7, 9);
    }
    
    e.target.value = result;
});

// Установить плейсхолдер
phoneInput.placeholder = '+998';

// Показать/скрыть уровень языка
function toggleLangLevel(lang) {
    const checkbox = document.querySelector(`input[value="${lang === 'russian' ? 'Русский' : lang === 'uzbek' ? 'Узбекский' : 'Английский'}"]`);
    const levelDiv = document.getElementById(`level-${lang}`);
    
    if (checkbox && levelDiv) {
        levelDiv.style.display = checkbox.checked ? 'block' : 'none';
    }
}

// Показать/скрыть поле для других языков
function toggleOtherLang() {
    const otherLang = document.getElementById('otherLang');
    const otherField = document.getElementById('otherLangField');
    
    if (otherLang && otherField) {
        otherField.style.display = otherLang.checked ? 'block' : 'none';
    }
}

document.getElementById('resumeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const loader = document.getElementById('loader');

    const formData = new FormData(this);
    
    // Сбор языков с уровнями
    let languagesList = [];
    
    if (formData.get('Русский')) {
        const level = formData.querySelector('input[name="level_russian"]:checked');
        languagesList.push('Русский' + (level ? ` (${level.value})` : ''));
    }
    if (formData.get('Узбекский')) {
        const level = formData.querySelector('input[name="level_uzbek"]:checked');
        languagesList.push('Узбекский' + (level ? ` (${level.value})` : ''));
    }
    if (formData.get('Английский')) {
        const level = formData.querySelector('input[name="level_english"]:checked');
        languagesList.push('Английский' + (level ? ` (${level.value})` : ''));
    }
    if (formData.get('Другие')) {
        const other = formData.get('other_languages');
        if (other) languagesList.push(other);
    }

    const data = {
        fullname: formData.get('fullname'),
        birthdate: formData.get('birthdate'),
        phone: formData.get('phone'),
        education: formData.get('education'),
        experience: formData.get('experience'),
        languages: languagesList.join(', '),
        programs: formData.get('programs'),
        salary: formData.get('salary')
    };

    // Проверка ФИО
    if (!data.fullname.trim()) {
        alert("Пожалуйста, введите ФИО.");
        return;
    }

    btn.disabled = true;
    loader.style.display = 'inline-block';

    try {
        const response = await fetch('/api/send-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            alert("✅ Успешно отправлено!");
            this.reset();
            // Сбросить все уровни языков
            document.querySelectorAll('.lang-level').forEach(el => el.style.display = 'none');
            document.getElementById('otherLangField').style.display = 'none';
        } else {
            const error = await response.json();
            alert("❌ Ошибка: " + error.error);
        }
    } catch (err) {
        console.error(err);
        alert("❌ Ошибка соединения. Проверьте подключение.");
    } finally {
        btn.disabled = false;
        loader.style.display = 'none';
    }
});
