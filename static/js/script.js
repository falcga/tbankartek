// Burger menu
function toggleBurger() {
  document.getElementById('burger-menu').classList.toggle('open');
  document.getElementById('burger-overlay').classList.toggle('show');
}

function closeBurger() {
  document.getElementById('burger-menu').classList.remove('open');
  document.getElementById('burger-overlay').classList.remove('show');
}

// Theme switching
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);

  // Theme toggle buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  // Close burger on link click
  document.querySelectorAll('.burger-menu a').forEach(a => {
    a.addEventListener('click', closeBurger);
  });
  document.getElementById('burger-overlay')?.addEventListener('click', closeBurger);

  // Save settings form
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(settingsForm);
      const data = {
        name: formData.get('name'),
        subject: formData.get('subject'),
        grade: parseInt(formData.get('grade')),
        theme: document.documentElement.getAttribute('data-theme') || 'light'
      };

      try {
        const resp = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if ((await resp.json()).status === 'ok') {
          showAlert('Настройки сохранены', 'success');
        }
      } catch (err) {
        showAlert('Ошибка при сохранении', 'error');
      }
    });
  }
});

function mdToHtml(text) {
  if (!text) return ''
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  text = text.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  text = text.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  text = text.replace(/^# (.+)$/gm, '<h3>$1</h3>')
  text = text.replace(/^- (.+)$/gm, '<li>$1</li>')
  text = text.replace(/\n/g, '<br>')
  return text
}

function showAlert(message, type = 'success') {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  const container = document.querySelector('.container') || document.querySelector('.container-sm');
  if (container) {
    container.prepend(alert);
    setTimeout(() => alert.remove(), 3000);
  }
}

// Trainer module
class Trainer {
  constructor() {
    this.questions = [];
    this.currentIndex = 0;
    this.answers = [];
    this.subject = document.getElementById('subject-select')?.value || 'math';
    this.answered = false;

    this.startBtn = document.getElementById('start-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.finishBtn = document.getElementById('finish-btn');
    this.questionContainer = document.getElementById('question-container');
    this.resultContainer = document.getElementById('result-container');
    this.progressFill = document.getElementById('progress-fill');
    this.progressBar = document.getElementById('progress-bar');
    this.explanationBox = document.getElementById('explanation-box');
    this.trainerBottom = document.getElementById('trainer-bottom');
    this.setupCard = document.getElementById('setup-card');

    if (this.startBtn) {
      this.startBtn.addEventListener('click', () => this.start());
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.next());
    }
    if (this.finishBtn) {
      this.finishBtn.addEventListener('click', () => this.finish());
    }
  }

  async start() {
    this.subject = document.getElementById('subject-select')?.value || 'math';
    this.startBtn.disabled = true;
    this.startBtn.textContent = 'Загрузка...';

    try {
      const resp = await fetch(`/api/questions?subject=${this.subject}`);
      this.questions = await resp.json();
      this.currentIndex = 0;
      this.answers = [];
      this.answered = false;
      this.setupCard.style.display = 'none';
      this.progressBar.style.display = 'block';
      this.showQuestion();
    } catch (err) {
      showAlert('Ошибка загрузки вопросов', 'error');
      this.startBtn.disabled = false;
      this.startBtn.textContent = 'Начать тест';
    }
  }

  showQuestion() {
    if (this.currentIndex >= this.questions.length) {
      this.finish();
      return;
    }

    const q = this.questions[this.currentIndex];
    const options = JSON.parse(q.options);
    const progress = ((this.currentIndex) / this.questions.length) * 100;
    if (this.progressFill) this.progressFill.style.width = progress + '%';
    this.answered = false;

    this.questionContainer.innerHTML = `
      <div class="card question-card">
        <h3>Вопрос ${this.currentIndex + 1} из ${this.questions.length}</h3>
        <p style="margin-bottom:16px;font-size:16px;">${q.question}</p>
        <div class="options-list">
          ${options.map((opt, i) => `
            <button class="option-btn" onclick="trainer.selectOption(${i})">
              ${opt}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    this.explanationBox.classList.remove('show');
    this.explanationBox.innerHTML = '';
    this.nextBtn.style.display = 'none';
    this.finishBtn.style.display = 'none';
    this.trainerBottom.style.display = 'none';

    const existing = this.answers[this.currentIndex];
    if (existing) {
      this.answered = true;
      this.highlightAnswer(existing.selected);
    }
  }

  selectOption(index) {
    if (this.answered) return;
    this.answered = true;

    const q = this.questions[this.currentIndex];
    this.answers[this.currentIndex] = {
      question: q.question,
      topic: q.topic,
      selected: index,
      correct: q.answer,
      is_correct: index === q.answer,
      options: JSON.parse(q.options)
    };

    this.highlightAnswer(index);
    this.showExplanation(this.answers[this.currentIndex]);
    this.trainerBottom.style.display = 'block';

    if (this.currentIndex < this.questions.length - 1) {
      this.nextBtn.style.display = 'inline-flex';
      this.finishBtn.style.display = 'none';
    } else {
      this.nextBtn.style.display = 'none';
      this.finishBtn.style.display = 'inline-flex';
    }
  }

  highlightAnswer(index) {
    const btns = this.questionContainer.querySelectorAll('.option-btn');
    btns.forEach((btn, i) => {
      btn.classList.remove('selected', 'correct', 'wrong');
      if (i === index) btn.classList.add('selected');
    });
  }

  async showExplanation(answer) {
    this.explanationBox.classList.add('show');
    this.explanationBox.innerHTML = '<div class="loading"><div class="spinner"></div>Объясняем...</div>';

    try {
      const resp = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: answer.question,
          user_answer: answer.options[answer.selected],
          correct_answer: answer.options[answer.correct]
        })
      });
      const data = await resp.json();
      this.explanationBox.innerHTML = mdToHtml(data.explanation);
    } catch (err) {
      const correct = answer.options[answer.correct];
      this.explanationBox.innerHTML = `Правильный ответ: <strong>${correct}</strong>.${answer.is_correct ? ' Всё верно!' : ' Обрати внимание на решение.'}`;
    }
  }

  next() {
    this.currentIndex++;
    this.showQuestion();
  }

  async finish() {
    this.finishBtn.disabled = true;
    this.finishBtn.textContent = 'Анализируем...';
    this.questionContainer.innerHTML = '';

    try {
      const resp = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: this.answers, subject: this.subject })
      });
      const data = await resp.json();
      this.showResult(data);
    } catch (err) {
      this.showResult();
    }
  }

  showResult(data) {
    const correct = data ? data.score : this.answers.filter(a => a.is_correct).length;
    const total = data ? data.total : this.answers.length;
    const weakTopics = data ? data.weak_topics : [];
    const plan = data ? data.plan : '';

    this.questionContainer.style.display = 'none';
    this.progressBar.style.display = 'none';
    this.nextBtn.style.display = 'none';
    this.finishBtn.style.display = 'none';
    this.trainerBottom.style.display = 'none';
    this.explanationBox.classList.remove('show');

    this.resultContainer.innerHTML = `
      <div class="result-center">
        <div class="card" style="text-align:center;">
          <div class="result-score">${correct}/${total}</div>
          <p class="result-text">
            ${correct >= total * 0.8 ? 'Отличный результат!' :
              correct >= total * 0.6 ? 'Хороший результат! Есть над чем поработать.' :
              'Нужно подтянуть знания. Не отчаивайся!'}
          </p>
          ${weakTopics.length > 0 ? `
            <div style="margin-top:16px;">
              <p style="font-weight:600;margin-bottom:8px;">Темы для повторения:</p>
              ${weakTopics.map(t => `<span class="btn btn-sm" style="margin:4px;">${t}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        ${plan ? `
          <div class="plan-box show">
            <h3>План подготовки</h3>
            ${plan}
          </div>
        ` : ''}
        <div style="margin-top:20px;display:flex;gap:8px;">
          <a href="/trainer" class="btn btn-primary" style="flex:1;">Заново</a>
          <a href="/dashboard" class="btn" style="flex:1;">Дэшборд</a>
        </div>
      </div>
    `;

    fetch('/api/submit_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: this.subject, score: correct, total: total, topics: {} })
    }).catch(() => {});
  }
}

let trainer;
document.addEventListener('DOMContentLoaded', () => {
  trainer = new Trainer();
});

// Admin functions
async function deleteUser(userId) {
  if (!confirm('Удалить пользователя? Это действие необратимо.')) return;
  try {
    const resp = await fetch('/api/admin/delete_user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    if ((await resp.json()).status === 'ok') {
      document.querySelector(`#user-${userId}`)?.remove();
      showAlert('Пользователь удалён', 'success');
    }
  } catch (err) {
    showAlert('Ошибка при удалении', 'error');
  }
}

async function generateQuestions() {
  const subject = document.getElementById('gen-subject')?.value || 'math';
  const count = document.getElementById('gen-count')?.value || 5;
  const btn = document.getElementById('gen-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Генерация...';

  try {
    const resp = await fetch('/api/admin/generate_questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, count })
    });
    const data = await resp.json();
    if (data.status === 'ok') {
      showAlert(`Добавлено ${data.added} вопросов`, 'success');
      setTimeout(() => location.reload(), 1000);
    } else {
      showAlert(data.message || 'Ошибка', 'error');
    }
  } catch (err) {
    showAlert('Ошибка сети', 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Сгенерировать';
}

async function deleteGenerated() {
  if (!confirm('Удалить все сгенерированные вопросы?')) return;
  const resp = await fetch('/api/admin/delete_generated', { method: 'POST' });
  const data = await resp.json();
  showAlert(`Удалено ${data.deleted} вопросов`, 'success');
  setTimeout(() => location.reload(), 1000);
}

async function deleteAllQuestions() {
  if (!confirm('Удалить ВСЕ вопросы? Это необратимо.')) return;
  const resp = await fetch('/api/admin/delete_all_questions', { method: 'POST' });
  const data = await resp.json();
  showAlert(`Удалено ${data.deleted} вопросов`, 'success');
  setTimeout(() => location.reload(), 1000);
}