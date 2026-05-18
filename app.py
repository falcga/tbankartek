import os
import sqlite3
import hashlib
import requests
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, redirect, url_for, session

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')

DB_PATH = 'database.db'


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT DEFAULT '',
            subject TEXT DEFAULT 'math',
            grade INTEGER DEFAULT 9,
            role TEXT DEFAULT 'user',
            theme TEXT DEFAULT 'light',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            topics TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            topic TEXT NOT NULL,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            answer INTEGER NOT NULL,
            difficulty INTEGER DEFAULT 1
        );
    ''')
    conn.commit()
    conn.close()


init_db()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if session.get('role') != 'admin':
            return redirect(url_for('dashboard'))
        return f(*args, **kwargs)
    return decorated


def ask_gemini(prompt):
    if not GEMINI_API_KEY:
        return "Gemini API не настроен. Добавьте GEMINI_API_KEY в .env файл."
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    try:
        resp = requests.post(
            url,
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=30
        )
        data = resp.json()
        return data['candidates'][0]['content']['parts'][0]['text']
    except Exception as e:
        return f"Ошибка Gemini API: {str(e)}"


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()
        if user and user['password'] == hashlib.sha256(password.encode()).hexdigest():
            session['user_id'] = user['id']
            session['email'] = user['email']
            session['role'] = user['role']
            session['theme'] = user['theme']
            return redirect(url_for('dashboard'))
        return render_template('login.html', error='Неверный email или пароль')
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        name = request.form.get('name', '')
        subject = request.form.get('subject', 'math')
        grade = int(request.form.get('grade', 9))
        if len(password) < 6:
            return render_template('register.html', error='Пароль должен быть минимум 6 символов')
        conn = get_db()
        existing = conn.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
        if existing:
            conn.close()
            return render_template('register.html', error='Email уже зарегистрирован')
        hashed = hashlib.sha256(password.encode()).hexdigest()
        conn.execute(
            'INSERT INTO users (email, password, name, subject, grade) VALUES (?,?,?,?,?)',
            (email, hashed, name, subject, grade)
        )
        conn.commit()
        conn.close()
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/dashboard')
@login_required
def dashboard():
    conn = get_db()
    results = conn.execute(
        'SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        (session['user_id'],)
    ).fetchall()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.close()
    return render_template('dashboard.html', results=results, user=user)


@app.route('/trainer')
@login_required
def trainer():
    return render_template('trainer.html')


@app.route('/api/questions', methods=['GET'])
@login_required
def get_questions():
    subject = request.args.get('subject', 'math')
    topic = request.args.get('topic', '')
    conn = get_db()
    if topic:
        questions = conn.execute(
            'SELECT * FROM questions WHERE subject = ? AND topic = ? ORDER BY RANDOM() LIMIT 10',
            (subject, topic)
        ).fetchall()
    else:
        questions = conn.execute(
            'SELECT * FROM questions WHERE subject = ? ORDER BY RANDOM() LIMIT 10',
            (subject,)
        ).fetchall()
    conn.close()
    return jsonify([dict(q) for q in questions])


@app.route('/api/explain', methods=['POST'])
@login_required
def explain():
    data = request.json
    question = data.get('question', '')
    user_answer = data.get('user_answer', '')
    correct_answer = data.get('correct_answer', '')
    prompt = f"""Ты репетитор по подготовке к ОГЭ/ЕГЭ.
Вопрос: {question}
Правильный ответ: {correct_answer}
Ответ ученика: {user_answer}
Объясни ошибку ученика, дай развернутое пояснение и подскажи, как правильно решать подобные задачи.
Пиши на русском, понятным для школьника языком."""
    explanation = ask_gemini(prompt)
    return jsonify({'explanation': explanation})


@app.route('/api/diagnose', methods=['POST'])
@login_required
def diagnose():
    data = request.json
    answers = data.get('answers', [])
    subject = data.get('subject', 'math')
    correct_count = sum(1 for a in answers if a.get('is_correct'))
    total = len(answers)
    topics_data = {}
    for a in answers:
        t = a.get('topic', 'general')
        if t not in topics_data:
            topics_data[t] = {'correct': 0, 'total': 0}
        topics_data[t]['total'] += 1
        if a.get('is_correct'):
            topics_data[t]['correct'] += 1

    conn = get_db()
    conn.execute(
        'INSERT INTO results (user_id, subject, score, total, topics) VALUES (?,?,?,?,?)',
        (session['user_id'], subject, correct_count, total, str(topics_data))
    )
    conn.commit()
    conn.close()

    weak_topics = [t for t, d in topics_data.items() if d['correct'] / max(d['total'], 1) < 0.6]
    prompt = f"""Ученик ответил правильно на {correct_count} из {total} вопросов по предмету {subject}.
Слабые темы: {', '.join(weak_topics) if weak_topics else 'нет'}.
Составь персональный план подготовки на неделю, выделив приоритетные темы для изучения.
Пиши на русском."""
    plan = ask_gemini(prompt)
    return jsonify({'score': correct_count, 'total': total, 'weak_topics': weak_topics, 'plan': plan})


@app.route('/api/submit_result', methods=['POST'])
@login_required
def submit_result():
    data = request.json
    conn = get_db()
    conn.execute(
        'INSERT INTO results (user_id, subject, score, total, topics) VALUES (?,?,?,?,?)',
        (session['user_id'], data.get('subject', 'math'), data.get('score', 0),
         data.get('total', 0), str(data.get('topics', {})))
    )
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


@app.route('/admin')
@admin_required
def admin_panel():
    conn = get_db()
    users = conn.execute('SELECT * FROM users ORDER BY created_at DESC').fetchall()
    results = conn.execute('SELECT * FROM results ORDER BY created_at DESC LIMIT 50').fetchall()
    stats = conn.execute('''
        SELECT COUNT(DISTINCT user_id) as active_users,
               AVG(score) as avg_score,
               COUNT(*) as total_attempts
        FROM results
    ''').fetchone()
    conn.close()
    return render_template('admin.html', users=users, results=results, stats=stats)


@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_users():
    conn = get_db()
    users = conn.execute(
        'SELECT id, email, name, role, subject, grade, created_at FROM users'
    ).fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])


@app.route('/api/admin/delete_user', methods=['POST'])
@admin_required
def delete_user():
    user_id = request.json.get('user_id')
    conn = get_db()
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.execute('DELETE FROM results WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


@app.route('/settings')
@login_required
def settings():
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.close()
    return render_template('settings.html', user=user)


@app.route('/api/settings', methods=['POST'])
@login_required
def update_settings():
    data = request.json
    conn = get_db()
    conn.execute(
        'UPDATE users SET name=?, subject=?, grade=?, theme=? WHERE id=?',
        (data.get('name', ''), data.get('subject', 'math'),
         int(data.get('grade', 9)), data.get('theme', 'light'),
         session['user_id'])
    )
    conn.commit()
    conn.close()
    session['theme'] = data.get('theme', 'light')
    return jsonify({'status': 'ok'})


# ─── Seed data ────────────────────────────────────────────────────────────────

def seed_questions():
    conn = get_db()
    count = conn.execute('SELECT COUNT(*) as c FROM questions').fetchone()['c']
    if count > 0:
        conn.close()
        return

    questions = [
        # Math
        ('math', 'algebra', 'Решите уравнение: 2x + 5 = 15', '["6", "5", "7", "4"]', 1, 1),
        ('math', 'algebra', 'Найдите корень уравнения: x² - 9 = 0', '["3 и -3", "3", "-3", "9"]', 0, 2),
        ('math', 'geometry', 'Чему равна площадь прямоугольника со сторонами 4 и 7?', '["28", "24", "32", "14"]', 0, 1),
        ('math', 'geometry', 'Сколько градусов в треугольнике?', '["180", "360", "90", "270"]', 0, 1),
        ('math', 'algebra', 'Упростите: 3(a + 2b) - 2(a - b)', '["a + 8b", "a + 4b", "5a + 4b", "5a + 8b"]', 0, 2),
        ('math', 'probability', 'Какова вероятность выпадения орла при подбрасывании монеты?', '["1/2", "1/3", "1/4", "2/3"]', 0, 1),
        ('math', 'algebra', 'Решите неравенство: 3x - 7 > 2', '["x > 3", "x < 3", "x > -3", "x < -3"]', 0, 2),
        ('math', 'geometry', 'Чему равен объём куба со стороной 5?', '["125", "25", "50", "100"]', 0, 2),
        ('math', 'functions', 'Найдите значение функции f(x) = 2x + 1 в точке x = 3', '["7", "6", "5", "8"]', 0, 1),
        ('math', 'algebra', 'Решите систему: x + y = 5, x - y = 1', '["x=3,y=2", "x=2,y=3", "x=4,y=1", "x=1,y=4"]', 0, 2),
        # Russian
        ('russian', 'orthography', 'В каком слове пишется буква И?', '["ц_рк", "ц_ган", "ц_плёнок", "ц_кнуть"]', 0, 1),
        ('russian', 'orthography', 'В каком слове НЕ пишется слитно?', '["не_красивый", "не_годование", "не_мог", "не_был"]', 1, 2),
        ('russian', 'grammar', 'Укажите слово с ошибкой в окончании', '["много яблок", "пара чулок", "нет сапогов", "пять апельсинов"]', 2, 2),
        ('russian', 'punctuation', 'Где нужно поставить запятую? "Он пришёл(,) но опоздал."', '["перед но", "после но", "не нужно", "вместо но"]', 0, 1),
        ('russian', 'orthography', 'В каком слове пишется Ь?', '["ноч_", "мяч_", "плащ_", "ключ_"]', 0, 1),
        # Informatics
        ('informatics', 'logic', 'Чему равно значение выражения: НЕ (A И B) ИЛИ C, если A=1, B=0, C=0?', '["1", "0", "2", "3"]', 0, 2),
        ('informatics', 'coding', 'Что выведет print(2 ** 3)?', '["8", "6", "9", "5"]', 0, 1),
        ('informatics', 'systems', 'Сколько байт в 1 Кбайте?', '["1024", "1000", "512", "2048"]', 0, 1),
        ('informatics', 'logic', 'Сколько строк в таблице истинности для 3 переменных?', '["8", "6", "4", "10"]', 0, 1),
        ('informatics', 'coding', 'Что вернёт len("Python")?', '["6", "5", "7", "4"]', 0, 1),
    ]

    conn.executemany(
        'INSERT INTO questions (subject, topic, question, options, answer, difficulty) VALUES (?,?,?,?,?,?)',
        questions
    )
    conn.commit()
    conn.close()


seed_questions()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)