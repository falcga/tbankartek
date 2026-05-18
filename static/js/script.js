// Theme switching
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  // Update active button state
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);

  // Theme toggle buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

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
        const result = await resp.json();
        if (result.status === 'ok') {
          showAlert('Настройки сохранены', 'success');
        }
      } catch (err) {
        showAlert('Ошибка при сохранении', 'error');
      }
    });
  }
});

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

    this.startBtn = document.getElementById('start-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.finishBtn = document.getElementById('finish-btn');
    this.questionContainer = document.getElementById('question-container');
    this.resultContainer = document.getElementById('result-container');
    this.progressFill = document.getElementById('progress-fill');
    this.explanationBox = document.getElementById('explanation-box');
    this.planBox = document.getElementById('plan-box');

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
      this.showQuestion();
      this.startBtn.style.display = 'none';
      document.getElementById('subject-select').disabled = true;
    } catch (err) {
      showAlert('Ошибка загрузки вопросов', 'error');
      this.startBtn.disabled = false;
      this.startBtn.textContent = 'Начать тест';
    }
  }

  showQuestion() {
    if (this.currentIndex >= this.questions.length) {
      this.showResult();
      return;
    }

    const q = this.questions[this.currentIndex];
    const options = JSON.parse(q.options);
    const progress = ((this.currentIndex) / this.questions.length) * 100;
    if (this.progressFill) this.progressFill.style.width = progress + '%';

    this.questionContainer.innerHTML = `
      <div class="card question-card">
        <h3>Вопрос ${this.currentIndex + 1} из ${this.questions.length}</h3>
        <p style="margin-bottom:16px;font-size:16px;">${q.question}</p>
        <div class="options-list">
          ${options.map((opt, i) => `
            <button class="option-btn" data-index="${i}" onclick="trainer.selectOption(${i})">
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

    // Pre-select if already answered
    const existing = this.answers[this.currentIndex];
    if (existing) {
      this.highlightAnswer(existing.selected);
    }
  }

  selectOption(index) {
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

    // Show explanation
    this.showExplanation(this.answers[this.currentIndex]);

    // Show next/finish button
    if (this.currentIndex < this.questions.length - 1) {
      this.nextBtn.style.display = 'inline-flex';
    } else {
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
      this.explanationBox.innerHTML = data.explanation;
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
    this.nextBtn.style.display = 'none';
    this.finishBtn.style.display = 'none';
    this.explanationBox.classList.remove('show');

    this.resultContainer.innerHTML = `
      <div class="card" style="text-align:center;">
        <div style="font-size:48px;font-weight:700;color:var(--accent);">${correct}/${total}</div>
        <p style="color:var(--text-secondary);margin-top:8px;">
          ${correct >= total * 0.8 ? 'Отличный результат! 🎉' :
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
          <h3 style="margin-bottom:12px;">📋 Персональный план подготовки</h3>
          ${plan}
        </div>
      ` : ''}
      <div style="text-align:center;margin-top:16px;">
        <a href="/trainer" class="btn btn-primary">Пройти ещё раз</a>
        <a href="/dashboard" class="btn" style="margin-left:8px;">К дэшборду</a>
      </div>
    `;

    // Save result
    fetch('/api/submit_result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: this.subject,
        score: correct,
        total: total,
        topics: {}
      })
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
    const data = await resp.json();
    if (data.status === 'ok') {
      document.querySelector(`#user-${userId}`)?.remove();
      showAlert('Пользователь удалён', 'success');
    }
  } catch (err) {
    showAlert('Ошибка при удалении', 'error');
  }
}