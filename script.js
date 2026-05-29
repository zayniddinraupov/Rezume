const phoneInput = document.getElementById('phone');
const birthInput = document.getElementById('birthdate');
const GROUP_LINK = 'https://t.me/+4stHqX6b0rhjNDli';

// Ограничение календаря 18-35 лет
const today = new Date();
birthInput.max = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).toISOString().split("T")[0];
birthInput.min = new Date(today.getFullYear() - 35, today.getMonth(), today.getDate()).toISOString().split("T")[0];

// Телефон - только цифры и ограничение длины
phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^\d+]/g, '');
    if (value.length > 13) {
        value = value.substring(0, 13);
    }
    e.target.value = value;
});

// Прогресс бар
function updateProgress() {
    const form = document.getElementById('resumeForm');
    const requiredInputs = form.querySelectorAll('input[required]');
    let filled = 0;
    requiredInputs.forEach(input => {
        if (input.value.trim()) filled++;
    });
    const percent = (filled / requiredInputs.length) * 100;
    document.getElementById('progressFill').style.width = percent + '%';
}

document.querySelectorAll('#resumeForm input, #resumeForm textarea, #resumeForm select').forEach(el => {
    el.addEventListener('input', updateProgress);
});

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

// Навыки теги
let skills = [];
function addSkill(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        const skill = input.value.trim();
        if (skill && !skills.includes(skill)) {
            skills.push(skill);
            renderSkills();
        }
        input.value = '';
    }
}

function renderSkills() {
    const container = document.getElementById('skillsContainer');
    container.innerHTML = skills.map(skill => 
        `<span class="skill-tag">${skill} <i class="fas fa-times" onclick="removeSkill('${skill}')"></i></span>`
    ).join('');
}

function removeSkill(skill) {
    skills = skills.filter(s => s !== skill);
    renderSkills();
}

document.getElementById('resumeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const loader = document.getElementById('loader');

    const formData = new FormData(this);
    
    // Сбор языков с уровнями
    let languagesList = [];
    
    if (document.querySelector('input[name="languages"][value="Русский"]')?.checked) {
        const level = document.querySelector('input[name="level_russian"]:checked');
        languagesList.push('Русский' + (level ? ` (${level.value})` : ''));
    }
    if (document.querySelector('input[name="languages"][value="Узбекский"]')?.checked) {
        const level = document.querySelector('input[name="level_uzbek"]:checked');
        languagesList.push('Узбекский' + (level ? ` (${level.value})` : ''));
    }
    if (document.querySelector('input[name="languages"][value="Английский"]')?.checked) {
        const level = document.querySelector('input[name="level_english"]:checked');
        languagesList.push('Английский' + (level ? ` (${level.value})` : ''));
    }
    if (document.querySelector('input[name="languages"][value="Другие"]')?.checked) {
        const other = formData.get('other_languages');
        if (other) languagesList.push(other);
    }

    const data = {
        fullname: formData.get('fullname'),
        birthdate: formData.get('birthdate'),
        gender: formData.get('gender'),
        phone: formData.get('phone'),
        city: formData.get('city'),
        citizenship: formData.get('citizenship'),
        marital: formData.get('marital'),
        salary: formData.get('salary'),
        telegram: formData.get('telegram'),
        education_level: formData.get('education_level'),
        education_details: formData.get('education_details'),
        experience: formData.get('experience'),
        courses: formData.get('courses'),
        skills: skills.join(', '),
        languages: languagesList.join(', '),
        army: formData.get('army'),
        personal_qualities: formData.get('personal_qualities'),
        professional_skills: formData.get('professional_skills'),
        about: formData.get('about')
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
                // Показать ссылку на группу кандидату
                const groupBox = document.getElementById('groupLinkBox');
                const joinLink = document.getElementById('joinGroupLink');
                if (groupBox && joinLink) {
                    joinLink.href = GROUP_LINK;
                    groupBox.style.display = 'block';
                }
                this.reset();
                // Сброс полей
                document.querySelectorAll('.lang-level').forEach(el => el.style.display = 'none');
                document.getElementById('otherLangField').style.display = 'none';
                skills = [];
                renderSkills();
                document.getElementById('progressFill').style.width = '0%';
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

// Копирование ссылки на группу
document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'copyGroupBtn') {
        const link = document.getElementById('joinGroupLink')?.href;
        if (!link) return;
        navigator.clipboard.writeText(link).then(() => {
            e.target.textContent = 'Скопировано!';
            setTimeout(() => { e.target.textContent = 'Копировать ссылку'; }, 2000);
        }).catch(() => {
            alert('Не удалось скопировать ссылку.');
        });
    }
});


