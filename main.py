from flask import Flask, render_template, request, redirect, url_for, session, Response, jsonify
import sqlite3
from datetime import datetime, timedelta
import csv
import io
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = "tajne_haslo"

DB = "../database.db"

# -------------------- Inicjalizacja bazy --------------------
def init_db():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # tabela użytkowników
    c.execute('''CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE,
                    password TEXT,
                    role TEXT,
                    created_date DATE,
                    is_active BOOLEAN DEFAULT 1
                 )''')
    
    # tabela obecności / punktów
    c.execute('''CREATE TABLE IF NOT EXISTS obecnosci (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user TEXT,
                    data DATE,
                    punkty INTEGER,
                    typ_mszy TEXT DEFAULT 'zwykla',
                    uwagi TEXT,
                    status TEXT DEFAULT 'pending',
                    approved_by TEXT,
                    approved_date DATE
                 )''')
    
    # tabela ogłoszeń
    c.execute('''CREATE TABLE IF NOT EXISTS ogloszenia (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tytul TEXT,
                    tresc TEXT,
                    data DATE,
                    autor TEXT,
                    priorytet INTEGER DEFAULT 0
                 )''')
    
    # tabela harmonogramu mszy
    c.execute('''CREATE TABLE IF NOT EXISTS harmonogram (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data DATE,
                    godzina TIME,
                    typ_mszy TEXT,
                    ministranci TEXT,
                    uwagi TEXT
                 )''')
    
    # tabela wydarzeń specjalnych
    c.execute('''CREATE TABLE IF NOT EXISTS wydarzenia (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nazwa TEXT,
                    data DATE,
                    godzina TIME,
                    opis TEXT,
                    punkty_dodatkowe INTEGER DEFAULT 0
                 )''')
    
    # tabela konfiguracji punktów
    c.execute('''CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                 )''')
    
    # tabela typów mszy
    c.execute('''CREATE TABLE IF NOT EXISTS mass_types (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE,
                    points INTEGER DEFAULT 1,
                    is_active BOOLEAN DEFAULT 1,
                    description TEXT,
                    bonus_second_mass BOOLEAN DEFAULT 0,
                    bonus_points INTEGER DEFAULT 0
                 )''')
    
    # tabela sezonów punktów
    c.execute('''CREATE TABLE IF NOT EXISTS point_seasons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    start_date DATE,
                    end_date DATE,
                    is_active BOOLEAN DEFAULT 1
                 )''')
    
    # tabela rozmów (czatów)
    c.execute('''CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ministrant TEXT,
                    odbiorca TEXT,
                    status TEXT DEFAULT 'open',
                    created_at DATETIME,
                    closed_at DATETIME,
                    closed_by TEXT
                 )''')
    
    # tabela wiadomości w rozmowach
    c.execute('''CREATE TABLE IF NOT EXISTS wiadomosci (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id INTEGER,
                    nadawca TEXT,
                    tresc TEXT,
                    data_wysylania DATETIME,
                    is_deleted BOOLEAN DEFAULT 0,
                    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
                 )''')
    
    # Dodaj conversation_id jeśli nie istnieje (backward compatibility)
    try:
        c.execute("ALTER TABLE wiadomosci ADD COLUMN conversation_id INTEGER;")
    except sqlite3.OperationalError:
        pass  # Kolumna już istnieje
    
    # tabela zablokowanych użytkowników
    c.execute('''CREATE TABLE IF NOT EXISTS zablokowani (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    blokujacy TEXT,
                    blokowany TEXT,
                    typ_blokady TEXT DEFAULT 'specific',
                    data_blokady DATE
                 )''')
    
    # tabela kar dla ministrantów
    c.execute('''CREATE TABLE IF NOT EXISTS kary (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ministrant TEXT,
                    typ_kary TEXT,
                    opis TEXT,
                    data_wydania DATE,
                    wydana_przez TEXT,
                    status TEXT DEFAULT 'active'
                 )''')
    
    # tabela zarejestrowanych urządzeń (dla notyfikacji)
    c.execute('''CREATE TABLE IF NOT EXISTS devices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT UNIQUE,
                    device_name TEXT,
                    registered_date DATETIME,
                    last_ping DATETIME,
                    is_active BOOLEAN DEFAULT 1
                 )''')
    
    # tabela notyfikacji
    c.execute('''CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT,
                    event_type TEXT,
                    title TEXT,
                    message TEXT,
                    sent_date DATETIME,
                    is_read BOOLEAN DEFAULT 0,
                    FOREIGN KEY(device_id) REFERENCES devices(device_id)
                 )''')
    
    conn.commit()
    conn.close()

init_db()

# -------------------- Dodanie domyślnego konta admina --------------------
def ensure_admin_exists():
    """Sprawdza i tworzy domyślne konto administratora, jeśli nie istnieje."""
    admin_user = 'admin'
    # WAŻNE: Zmień 'adminpass123' na bezpieczne, losowe hasło w środowisku produkcyjnym!
    admin_pass = 'adminpass123' 
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # Sprawdź, czy administrator już istnieje
    c.execute("SELECT id FROM users WHERE username=?", (admin_user,))
    if c.fetchone() is None:
        # Haszowanie hasła przy użyciu funkcji z werkzeug.security
        hashed_password = generate_password_hash(admin_pass)
        
        # Wstawienie konta admina (rola: 'admin', is_active: 1)
        try:
            c.execute("INSERT INTO users (username, password, role, created_date, is_active) VALUES (?, ?, 'admin', ?, 1)",
                     (admin_user, hashed_password, datetime.today().date()))
            conn.commit()
            # Informacja dla użytkownika, widoczna w konsoli przy pierwszym uruchomieniu:
            print(f"Utworzono domyślne konto administratora: Użytkownik: {admin_user}, Hasło: {admin_pass}")
        except sqlite3.IntegrityError:
            pass # Pomiń, jeśli inny proces dodał użytkownika w międzyczasie
    
    conn.close()

# Wywołaj funkcję po inicjalizacji bazy danych
ensure_admin_exists()

# -------------------- Funkcje pomocnicze --------------------
def start_of_week(d):
    return d - timedelta(days=d.weekday())

def end_of_week(d):
    return start_of_week(d) + timedelta(days=6)

def get_config_value(key, default=None):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT value FROM config WHERE key=?", (key,))
    result = c.fetchone()
    conn.close()
    return result[0] if result else default

def get_mass_types(only_active=True):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    if only_active:
        c.execute("SELECT name, points, description FROM mass_types WHERE is_active=1 ORDER BY points DESC")
    else:
        c.execute("SELECT id, name, points, is_active, description, bonus_second_mass, bonus_points FROM mass_types ORDER BY points DESC")
    mass_types = c.fetchall()
    conn.close()
    return mass_types

def get_current_season():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    season_id = get_config_value('current_season_id', 1)
    c.execute("SELECT id, name, start_date, end_date FROM point_seasons WHERE id=?", (season_id,))
    season = c.fetchone()
    conn.close()
    return season

def is_date_in_season(date):
    season = get_current_season()
    if season:
        start_date = datetime.strptime(season[2], "%Y-%m-%d").date()
        end_date = datetime.strptime(season[3], "%Y-%m-%d").date()
        return start_date <= date <= end_date
    return True  # Jeśli nie ma sezonu, wszystkie daty są ważne

def calculate_points(user, typ_mszy='zwykla'):
    today = datetime.today().date()
    
    # Sprawdź czy data jest w aktualnym sezonie
    if not is_date_in_season(today):
        return 0
    
    # Pobierz punkty dla typu mszy z bazy
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT points FROM mass_types WHERE name=? AND is_active=1", (typ_mszy,))
    result = c.fetchone()
    base_points = int(result[0]) if result else 1
    
    # Sprawdź liczbę mszy w tym tygodniu (od poniedziałku do soboty)
    week_start = start_of_week(today)
    week_end = week_start + timedelta(days=5)  # Tylko do soboty
    
    c.execute("""
        SELECT COUNT(*) FROM obecnosci 
        WHERE user=? AND data BETWEEN ? AND ? 
        AND strftime('%w', data) BETWEEN '1' AND '6'
        AND status = 'approved'
    """, (user, week_start, week_end))
    
    count_week_masses = c.fetchone()[0]
    
    # Sprawdź czy bonus za drugą mszę jest włączony
    enable_second_mass_bonus = get_config_value('enable_second_mass_bonus', '1') == '1'
    points_second_mass = int(get_config_value('points_second_mass', 2))
    
    # Oblicz punkty
    if enable_second_mass_bonus and count_week_masses >= 1:
        # Druga i kolejne msze w tygodniu (od poniedziałku do soboty)
        total_points = points_second_mass
    else:
        # Pierwsza msza w tygodniu lub niedziela
        total_points = base_points
    
    # Sprawdź maksymalną liczbę punktów dziennie (0 = brak limitu)
    max_points = int(get_config_value('max_points_per_day', 5))
    if max_points > 0 and total_points > max_points:
        total_points = max_points
    
    conn.close()
    return total_points

def calculate_points_from_schedule(user, mass_date, typ_mszy='zwykla'):
    """Oblicz punkty na podstawie harmonogramu mszy - używa ustawień z typów mszy"""
    mass_date = mass_date if isinstance(mass_date, type(datetime.today().date())) else datetime.strptime(mass_date, "%Y-%m-%d").date()
    
    # Sprawdź czy data jest w aktualnym sezonie
    if not is_date_in_season(mass_date):
        return 0
    
    # Liczba mszy w tym tygodniu (od poniedziałku do soboty) - wszystkie (pending + approved)
    week_start = start_of_week(mass_date)
    week_end = week_start + timedelta(days=5)
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("""
        SELECT COUNT(*) FROM obecnosci 
        WHERE user=? AND data BETWEEN ? AND ? 
        AND strftime('%w', data) BETWEEN '1' AND '6'
    """, (user, week_start, week_end))
    
    count_week_masses = c.fetchone()[0]
    
    # Jeśli pierwsza msza - użyj points z typu mszy
    if count_week_masses == 0:
        c.execute("SELECT points FROM mass_types WHERE name=?", (typ_mszy,))
        result = c.fetchone()
        conn.close()
        return result[0] if result else 1
    
    # Jeśli druga+ msza - sprawdź czy typ mszy ma bonus
    c.execute("SELECT bonus_second_mass, bonus_points FROM mass_types WHERE name=?", (typ_mszy,))
    result = c.fetchone()
    conn.close()
    
    if result and result[0]:  # bonus_second_mass = 1
        return result[1]  # bonus_points - całkowita ilość
    else:
        return 1  # Default - jeden punkt

def get_announcements(limit=None):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    query = "SELECT id, tytul, tresc, data, autor, priorytet FROM ogloszenia ORDER BY priorytet DESC, data DESC"
    if limit:
        query += f" LIMIT {limit}"
    c.execute(query)
    records = c.fetchall()
    conn.close()
    return records

def get_user_stats(user):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT SUM(punkty) FROM obecnosci WHERE user=? AND status='approved'", (user,))
    total = c.fetchone()[0] or 0
    
    # Statystyki miesięczne
    month_start = datetime.today().replace(day=1).date()
    c.execute("SELECT SUM(punkty) FROM obecnosci WHERE user=? AND data >= ? AND status='approved'", (user, month_start))
    monthly = c.fetchone()[0] or 0
    
    # Liczba obecności w tym miesiącu
    c.execute("SELECT COUNT(*) FROM obecnosci WHERE user=? AND data >= ? AND status='approved'", (user, month_start))
    count_monthly = c.fetchone()[0] or 0
    
    # Ranking wśród ministrantów
    c.execute('''
        SELECT username, SUM(punkty) as total 
        FROM obecnosci 
        JOIN users ON obecnosci.user = users.username 
        WHERE users.role='ministrant' AND obecnosci.status='approved'
        GROUP BY username 
        ORDER BY total DESC
    ''')
    ranking = c.fetchall()
    user_rank = next((i+1 for i, (u, _) in enumerate(ranking) if u == user), None)
    
    conn.close()
    return {
        'total': total, 
        'monthly': monthly, 
        'count_monthly': count_monthly,
        'rank': user_rank,
        'total_users': len(ranking)
    }

def get_all_users():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT username, role, created_date, is_active FROM users ORDER BY username")
    users = c.fetchall()
    conn.close()
    return users

def get_todays_masses():
    today = datetime.today().date()
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT godzina, typ_mszy, uwagi FROM harmonogram WHERE data = ? ORDER BY godzina", (today,))
    masses = c.fetchall()
    conn.close()
    return masses

def get_system_stats():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    c.execute("SELECT COUNT(*) FROM users")
    total_users = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM obecnosci")
    total_records = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM ogloszenia")
    total_announcements = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM harmonogram WHERE data >= ?", (datetime.today().date(),))
    upcoming_masses = c.fetchone()[0]
    
    c.execute("SELECT SUM(punkty) FROM obecnosci WHERE data >= ? AND status='approved'", (datetime.today().replace(day=1).date(),))
    monthly_points = c.fetchone()[0] or 0
    
    # Punkty oczekujące na akceptację
    c.execute("SELECT COUNT(*) FROM obecnosci WHERE status='pending'")
    pending_approvals = c.fetchone()[0]
    
    conn.close()
    
    return {
        'total_users': total_users,
        'total_records': total_records,
        'total_announcements': total_announcements,
        'upcoming_masses': upcoming_masses,
        'monthly_points': monthly_points,
        'pending_approvals': pending_approvals
    }

def get_pending_approvals():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('''
        SELECT o.id, o.user, o.data, o.punkty, o.typ_mszy, o.uwagi, o.status, u.role 
        FROM obecnosci o 
        JOIN users u ON o.user = u.username 
        WHERE o.status = 'pending' 
        ORDER BY o.data DESC
    ''')
    pending = c.fetchall()
    conn.close()
    return pending

# -------------------- Routing --------------------
@app.route("/", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        c.execute("SELECT username, password, role, is_active FROM users WHERE username=?", (username,))
        row = c.fetchone()
        conn.close()
        
        if not row:
            return render_template("login.html", error="Błędne dane logowania")
        
        # Jeśli konto jest deaktywowane - pokaż TYLKO ten komunikat
        if not row[3]:
            return render_template("login.html", error="Twoje konto zostało deaktywowane. Skontaktuj się z administratorem.")
        
        # Sprawdź hasło
        if check_password_hash(row[1], password):
            session['user'] = row[0]
            session['role'] = row[2]
            return redirect(url_for("dashboard"))
        else:
            return render_template("login.html", error="Błędne dane logowania")
    
    return render_template("login.html")

@app.route("/dashboard", methods=["GET", "POST"])
def dashboard():
    if 'user' not in session:
        return redirect(url_for("login"))
    
    role = session['role']
    user = session['user']
    today = datetime.today().date().isoformat()
    
    # Dodaj słownik z danymi dla szablonu
    data = {
        "user": user,
        "role": role,
        "today": today,
        "current_season_id": 1  # <- dodaj domyślną wartość, aby Jinja2 nie wywalała błędu
    }

    return render_template("dashboard.html", some_dict=data)

    # ----------------- Ministrant -----------------
    if role == "ministrant":
        if request.method == "POST":
            mass_schedule_id = request.form.get("mass_schedule_id")
            uwagi = request.form.get("uwagi", "")
            
            if mass_schedule_id and mass_schedule_id.strip():
                conn = sqlite3.connect(DB)
                c = conn.cursor()
                
                # Pobierz szczegóły mszy z harmonogramu
                c.execute("SELECT data, godzina, typ_mszy FROM harmonogram WHERE id=?", (mass_schedule_id,))
                mass_info = c.fetchone()
                
                if mass_info:
                    mass_date = mass_info[0]
                    mass_time = mass_info[1]
                    typ_mszy = mass_info[2]
                    
                    # Oblicz punkty - używa ustawień z typów mszy
                    punkty = calculate_points_from_schedule(user, mass_date, typ_mszy)
                    
                    # Zawsze wymagaj akceptacji
                    status = 'pending'
                    
                    # Sprawdź czy już wcześniej się zaznaczył NA TĘ SAMĄ MSZĘ Z HARMONOGRAMU
                    c.execute("SELECT id FROM obecnosci WHERE user=? AND harmonogram_id=?", 
                             (user, mass_schedule_id))
                    existing = c.fetchone()
                    
                    if existing:
                        # Aktualizuj tylko jeśli to ta sama msza z harmonogramu
                        c.execute("UPDATE obecnosci SET punkty=?, uwagi=?, status=? WHERE id=?",
                                 (punkty, uwagi, status, existing[0]))
                    else:
                        # Dodaj nowy wpis z ID mszy z harmonogramu
                        c.execute("INSERT INTO obecnosci (user, data, punkty, typ_mszy, uwagi, status, harmonogram_id) VALUES (?,?,?,?,?,?,?)",
                                 (user, mass_date, punkty, typ_mszy, uwagi, status, mass_schedule_id))
                    conn.commit()
                conn.close()
            
            return redirect(url_for("dashboard"))
        
        # Filtrowanie rekordów
        week_start = request.args.get('week_start')
        month = request.args.get('month')
        
        query = "SELECT data, punkty, typ_mszy, uwagi, status FROM obecnosci WHERE user=?"
        params = [user]
        
        if week_start:
            start = datetime.strptime(week_start, "%Y-%m-%d").date()
            end = start + timedelta(days=6)
            query += " AND data BETWEEN ? AND ?"
            params.extend([start, end])
        elif month:
            start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
            end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
            query += " AND data BETWEEN ? AND ?"
            params.extend([start, end])
        
        query += " ORDER BY data DESC"
        
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        c.execute(query, params)
        raw_records = c.fetchall()
        
        # Konwertuj daty na obiekty datetime
        records = []
        for r in raw_records:
            try:
                if isinstance(r[0], str):
                    date_obj = datetime.strptime(r[0], "%Y-%m-%d").date()
                else:
                    date_obj = r[0]
                records.append((date_obj, r[1], r[2], r[3], r[4]))
            except:
                records.append(r)
        
        stats = get_user_stats(user)
        announcements = get_announcements(5)
        todays_masses = get_todays_masses()
        mass_types = get_mass_types()
        current_season = get_current_season()
        
        # Pobierz wszystkie dostępne msze z harmonogramu (od dzisiaj)
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        today = datetime.today().date()
        c.execute("SELECT id, data, godzina, typ_mszy FROM harmonogram WHERE data >= ? ORDER BY data, godzina", (today,))
        available_masses = c.fetchall()
        conn.close()
        
        all_users_list = get_all_users()
        
        return render_template("dashboard_ministrant.html", 
                             user=user, 
                             records=records, 
                             announcements=announcements,
                             stats=stats,
                             todays_masses=todays_masses,
                             mass_types=mass_types,
                             current_season=current_season,
                             available_masses=available_masses,
                             all_users=all_users_list)
    
    # ----------------- Ksiądz -----------------
    elif role == "ksiez":
        # Ręczne dodawanie obecności
        if request.method == "POST" and 'manual_attendance' in request.form:
            selected_user = request.form["user"]
            selected_date = request.form["date"]
            mass_type = request.form.get("mass_type", "zwykla")
            notes = request.form.get("notes", "")
            
            # Oblicz punkty na podstawie typu mszy
            conn = sqlite3.connect(DB)
            c = conn.cursor()
            c.execute("SELECT points FROM mass_types WHERE name=?", (mass_type,))
            result = c.fetchone()
            points = int(result[0]) if result else 1
            
            # Sprawdź czy już istnieje wpis
            c.execute("SELECT id FROM obecnosci WHERE user=? AND data=?", (selected_user, selected_date))
            existing = c.fetchone()
            
            if existing:
                c.execute("UPDATE obecnosci SET punkty=?, typ_mszy=?, uwagi=? WHERE id=?",
                         (points, mass_type, notes, existing[0]))
            else:
                # Dla księdza punkty są od razu akceptowane
                c.execute("INSERT INTO obecnosci (user, data, punkty, typ_mszy, uwagi, status, approved_by, approved_date) VALUES (?,?,?,?,?,?,?,?)",
                         (selected_user, selected_date, points, mass_type, notes, 'approved', session['user'], datetime.today().date()))
            conn.commit()
            conn.close()
            return redirect(url_for("dashboard"))
        
        # Filtrowanie
        week_start = request.args.get('week_start')
        month = request.args.get('month')
        selected_user = request.args.get('user')
        
        query = "SELECT id, user, data, punkty, typ_mszy, uwagi, status FROM obecnosci WHERE 1=1"
        params = []
        
        if week_start:
            start = datetime.strptime(week_start, "%Y-%m-%d").date()
            end = start + timedelta(days=6)
            query += " AND data BETWEEN ? AND ?"
            params.extend([start, end])
        elif month:
            start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
            end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
            query += " AND data BETWEEN ? AND ?"
            params.extend([start, end])
        
        if selected_user and selected_user != "all":
            query += " AND user=?"
            params.append(selected_user)
        
        query += " ORDER BY data DESC"
        
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        c.execute(query, params)
        records = c.fetchall()
        
        # Pobierz listę użytkowników do filtrowania
        c.execute("SELECT username FROM users WHERE role='ministrant' AND is_active=1 ORDER BY username")
        users = [u[0] for u in c.fetchall()]
        
        announcements = get_announcements()
        mass_types = get_mass_types()
        pending_approvals = get_pending_approvals()
        
        # Pobierz harmonogram
        c.execute("SELECT id, data, godzina, typ_mszy, uwagi FROM harmonogram ORDER BY data, godzina")
        schedule_list = c.fetchall()
        conn.close()
        
        return render_template("dashboard_ksiez.html", 
                             records=records, 
                             announcements=announcements,
                             users=users,
                             all_users=users,
                             selected_user=selected_user,
                             mass_types=mass_types,
                             today=today,
                             pending_approvals=pending_approvals,
                             schedule_list=schedule_list)
    
    # ----------------- Admin -----------------
    elif role == "admin":
        # Ręczne dodawanie obecności (również dla siebie)
        if request.method == "POST" and 'manual_attendance' in request.form:
            selected_user = request.form["user"]
            mass_schedule_id = request.form.get("mass_schedule_id")
            notes = request.form.get("notes", "")
            
            if mass_schedule_id and mass_schedule_id.strip():
                conn = sqlite3.connect(DB)
                c = conn.cursor()
                
                # Pobierz szczegóły mszy z harmonogramu
                c.execute("SELECT data, godzina, typ_mszy FROM harmonogram WHERE id=?", (mass_schedule_id,))
                mass_info = c.fetchone()
                
                if mass_info:
                    mass_date = mass_info[0]
                    mass_time = mass_info[1]
                    typ_mszy = mass_info[2]
                    
                    # Oblicz punkty - używa ustawień z typów mszy
                    punkty = calculate_points_from_schedule(selected_user, mass_date, typ_mszy)
                    
                    # Dla admina punkty są od razu akceptowane (pending -> approved)
                    status = 'approved'
                    
                    # Sprawdź czy już się zaznaczył NA TĘ SAMĄ MSZĘ Z HARMONOGRAMU
                    c.execute("SELECT id FROM obecnosci WHERE user=? AND harmonogram_id=?", 
                             (selected_user, mass_schedule_id))
                    existing = c.fetchone()
                    
                    if existing:
                        # Aktualizuj
                        c.execute("UPDATE obecnosci SET punkty=?, uwagi=?, status=?, approved_by=?, approved_date=? WHERE id=?",
                                 (punkty, notes, status, session['user'], datetime.today().date(), existing[0]))
                    else:
                        # Dodaj nowy wpis z ID mszy z harmonogramu
                        c.execute("INSERT INTO obecnosci (user, data, punkty, typ_mszy, uwagi, status, harmonogram_id, approved_by, approved_date) VALUES (?,?,?,?,?,?,?,?,?)",
                                 (selected_user, mass_date, punkty, typ_mszy, notes, status, mass_schedule_id, session['user'], datetime.today().date()))
                    conn.commit()
                conn.close()
            
            return redirect(url_for("dashboard"))
        
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        
        # Pobierz użytkowników
        c.execute("SELECT username, role, created_date, is_active FROM users ORDER BY username")
        users_list = c.fetchall()
        
        # Filtrowanie obecności
        week_start = request.args.get('week_start')
        month = request.args.get('month')
        selected_user = request.args.get('user')
        
        query = "SELECT id, user, data, punkty, typ_mszy, uwagi, status FROM obecnosci WHERE 1=1"
        params = []
        
        if week_start:
            start = datetime.strptime(week_start, "%Y-%m-%d").date()
            end = start + timedelta(days=6)
            query += " AND data BETWEEN ? AND ?"
            params.extend([start, end])
        elif month:
            start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
            end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
            query += " AND data BETWEEN ? AND ?"
            params.extend([start, end])
        
        if selected_user and selected_user != "all":
            query += " AND user=?"
            params.append(selected_user)
        
        query += " ORDER BY data DESC"
        c.execute(query, params)
        records = c.fetchall()
        
        # Pobierz użytkowników do filtrowania
        c.execute("SELECT username FROM users ORDER BY username")
        users_filter = [u[0] for u in c.fetchall()]
        
        announcements = get_announcements()
        mass_types = get_mass_types(only_active=False)
        system_stats = get_system_stats()
        pending_approvals_list = get_pending_approvals()  # ZMIANA: zmieniona nazwa zmiennej
        
        # Pobierz sezony punktów
        c.execute("SELECT id, name, start_date, end_date, is_active FROM point_seasons ORDER BY start_date DESC")
        seasons = c.fetchall()
        
        # Pobierz konfigurację
        config = {}
        c.execute("SELECT key, value FROM config")
        for key, value in c.fetchall():
            config[key] = value
        
        # Pobierz harmonogram
        c.execute("SELECT id, data, godzina, typ_mszy, uwagi FROM harmonogram ORDER BY data, godzina")
        schedule_list = c.fetchall()
        
        # Dostępne msze do dodawania
        available_masses = schedule_list
        
        conn.close()
        
        return render_template("dashboard_admin.html", 
                             users=users_list, 
                             all_users=users_list,
                             records=records, 
                             announcements=announcements,
                             users_filter=users_filter,
                             selected_user=selected_user,
                             mass_types=mass_types,
                             config=config,
                             today=today,
                             seasons=seasons,
                             pending_approvals_list=pending_approvals_list,  # ZMIANA: zmieniona nazwa zmiennej
                             get_user_stats=get_user_stats,
                             schedule_list=schedule_list,
                             available_masses=available_masses,
                             **system_stats)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# -------------------- Zarządzanie użytkownikami --------------------
@app.route("/admin/add_user", methods=["POST"])
def add_user():
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    username = request.form["username"]
    password = request.form["password"]
    role = request.form["role"]
    
    hashed_password = generate_password_hash(password)
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users (username, password, role, created_date) VALUES (?,?,?,?)",
                 (username, hashed_password, role, datetime.today().date()))
        conn.commit()
    except sqlite3.IntegrityError:
        pass  # Użytkownik już istnieje
    finally:
        conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/admin/change_password/<user>", methods=["POST"])
def change_password(user):
    if session.get('role') != 'admin':
        return jsonify({"success": False, "error": "Brak dostępu"})
    
    new_pass = request.form.get("new_password")
    if not new_pass or len(new_pass) < 6:
        return jsonify({"success": False, "error": "Hasło musi mieć minimum 6 znaków"})
    
    hashed_new_pass = generate_password_hash(new_pass)
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("UPDATE users SET password=? WHERE username=?", (hashed_new_pass, user))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "message": f"Zmieniono hasło dla {user}"})

@app.route("/admin/change_role/<user>", methods=["POST"])
def change_role(user):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    new_role = request.form["new_role"]
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("UPDATE users SET role=? WHERE username=?", (new_role, user))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/admin/toggle_user/<user>")
def toggle_user(user):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    if user == session.get('user'):
        return redirect(url_for("dashboard"))  # Nie można deaktywować siebie
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT is_active FROM users WHERE username=?", (user,))
    current = c.fetchone()[0]
    c.execute("UPDATE users SET is_active=? WHERE username=?", (not current, user))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/admin/delete_user/<user>")
def delete_user(user):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    if user == session.get('user'):
        return redirect(url_for("dashboard"))  # Nie można usunąć siebie
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM users WHERE username=?", (user,))
    c.execute("DELETE FROM obecnosci WHERE user=?", (user,))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

# -------------------- Zmiana własnego hasła --------------------
@app.route("/change_my_password", methods=["POST"])
def change_my_password():
    if 'user' not in session:
        return redirect(url_for("login"))
    
    current_password = request.form["current_password"]
    new_password = request.form["new_password"]
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT password FROM users WHERE username=?", (session['user'],))
    row = c.fetchone()
    
    if row and check_password_hash(row[0], current_password):
        hashed_new_pass = generate_password_hash(new_password)
        c.execute("UPDATE users SET password=? WHERE username=?", (hashed_new_pass, session['user']))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Hasło zostało zmienione"})
    else:
        conn.close()
        return jsonify({"success": False, "message": "Błędne obecne hasło"})

# -------------------- Ogłoszenia --------------------
@app.route("/add_announcement", methods=["POST"])
def add_announcement():
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    tytul = request.form["tytul"]
    tresc = request.form["tresc"]
    priorytet = request.form.get("priorytet", 0)
    today = datetime.today().date()
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("INSERT INTO ogloszenia (tytul, tresc, data, autor, priorytet) VALUES (?,?,?,?,?)",
             (tytul, tresc, today, session['user'], priorytet))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/edit_announcement/<int:announcement_id>", methods=["GET", "POST"])
def edit_announcement(announcement_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    if request.method == "POST":
        tytul = request.form["tytul"]
        tresc = request.form["tresc"]
        priorytet = request.form.get("priorytet", 0)
        
        c.execute("UPDATE ogloszenia SET tytul=?, tresc=?, priorytet=? WHERE id=?",
                 (tytul, tresc, priorytet, announcement_id))
        conn.commit()
        conn.close()
        return redirect(url_for("dashboard"))
    
    c.execute("SELECT id, tytul, tresc, priorytet FROM ogloszenia WHERE id=?", (announcement_id,))
    announcement = c.fetchone()
    conn.close()
    
    if not announcement:
        return redirect(url_for("dashboard"))
    
    return render_template("edit_announcement.html", announcement=announcement)

@app.route("/delete_announcement/<int:announcement_id>")
def delete_announcement(announcement_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM ogloszenia WHERE id=?", (announcement_id,))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

# -------------------- Wiadomości i Czat --------------------
@app.route("/start_conversation", methods=["POST"])
def start_conversation():
    if 'user' not in session or session.get('role') != 'ministrant':
        return jsonify({"success": False})
    
    odbiorca = request.form.get("odbiorca")
    
    if not odbiorca:
        return jsonify({"success": False})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # Sprawdź czy nie jest zablokowany
    c.execute("SELECT id FROM zablokowani WHERE blokujacy=? AND (blokowany=? OR blokowany='ALL')",
             (odbiorca, session['user']))
    if c.fetchone():
        conn.close()
        return jsonify({"success": False, "error": "Jesteś zablokowany"})
    
    # Sprawdź czy już istnieje otwarta rozmowa
    c.execute("SELECT id FROM conversations WHERE ministrant=? AND odbiorca=? AND status='open'",
             (session['user'], odbiorca))
    existing = c.fetchone()
    
    if existing:
        conn.close()
        return jsonify({"success": True, "conversation_id": existing[0]})
    
    # Utwórz nową rozmowę
    c.execute("INSERT INTO conversations (ministrant, odbiorca, created_at) VALUES (?,?,?)",
             (session['user'], odbiorca, datetime.now()))
    conn.commit()
    conv_id = c.lastrowid
    conn.close()
    
    return jsonify({"success": True, "conversation_id": conv_id})

@app.route("/send_message", methods=["POST"])
def send_message():
    if 'user' not in session:
        return jsonify({"success": False})
    
    conversation_id = request.form.get("conversation_id")
    tresc = request.form.get("tresc")
    
    if not conversation_id or not tresc:
        return jsonify({"success": False})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # Sprawdź czy rozmowa jest zamknięta
    c.execute("SELECT status FROM conversations WHERE id=?", (conversation_id,))
    conv = c.fetchone()
    
    if conv and conv[0] == 'closed':
        conn.close()
        return jsonify({"success": False, "error": "Rozmowa jest zamknięta"})
    
    c.execute("INSERT INTO wiadomosci (conversation_id, nadawca, tresc, data_wysylania) VALUES (?,?,?,?)",
             (conversation_id, session['user'], tresc, datetime.now()))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route("/get_conversations")
def get_conversations():
    if 'user' not in session:
        return jsonify([])
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    role = session.get('role')
    
    if role == 'ministrant':
        c.execute("SELECT id, ministrant, odbiorca, status, created_at FROM conversations WHERE ministrant=? ORDER BY created_at DESC",
                 (session['user'],))
    else:
        # Ksiądz i admin widzą rozmowy skierowane do nich, admin widzi wszystkie
        if role == 'admin':
            c.execute("SELECT id, ministrant, odbiorca, status, created_at FROM conversations ORDER BY created_at DESC")
        else:
            c.execute("SELECT id, ministrant, odbiorca, status, created_at FROM conversations WHERE odbiorca=? ORDER BY created_at DESC",
                     (session['user'],))
    
    conversations = c.fetchall()
    conn.close()
    
    return jsonify([{'id': conv[0], 'ministrant': conv[1], 'odbiorca': conv[2], 'status': conv[3], 'created_at': str(conv[4])} for conv in conversations])

@app.route("/get_conversation/<int:conv_id>")
def get_conversation(conv_id):
    if 'user' not in session:
        return jsonify([])
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    c.execute("SELECT id, nadawca, tresc, data_wysylania FROM wiadomosci WHERE conversation_id=? AND is_deleted=0 ORDER BY data_wysylania",
             (conv_id,))
    messages = c.fetchall()
    conn.close()
    
    return jsonify([{'id': m[0], 'nadawca': m[1], 'tresc': m[2], 'data': str(m[3])} for m in messages])

@app.route("/close_conversation/<int:conv_id>", methods=["POST"])
def close_conversation(conv_id):
    if 'user' not in session:
        return jsonify({"success": False})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # Sprawdź dostęp
    c.execute("SELECT odbiorca, status FROM conversations WHERE id=?", (conv_id,))
    conv = c.fetchone()
    
    if not conv or (conv[0] != session['user'] and session.get('role') != 'admin'):
        conn.close()
        return jsonify({"success": False})
    
    if conv[1] == 'closed':
        conn.close()
        return jsonify({"success": False, "error": "Rozmowa już zamknięta"})
    
    c.execute("UPDATE conversations SET status='closed', closed_at=?, closed_by=? WHERE id=?",
             (datetime.now(), session['user'], conv_id))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route("/delete_message/<int:msg_id>", methods=["POST"])
def delete_message(msg_id):
    if 'user' not in session or session.get('role') not in ['ksiez', 'admin']:
        return jsonify({"success": False})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    c.execute("SELECT nadawca FROM wiadomosci WHERE id=?", (msg_id,))
    msg = c.fetchone()
    
    if not msg:
        conn.close()
        return jsonify({"success": False})
    
    c.execute("UPDATE wiadomosci SET is_deleted=1 WHERE id=?", (msg_id,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route("/block_user", methods=["POST"])
def block_user():
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    blokowany = request.form.get("blokowany")
    typ = request.form.get("typ", "specific")
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO zablokowani (blokujacy, blokowany, typ_blokady, data_blokady) VALUES (?,?,?,?)",
             (session['user'], blokowany, typ, datetime.today().date()))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/unblock_user/<blokowany>", methods=["POST"])
def unblock_user(blokowany):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM zablokowani WHERE blokowany=?", (blokowany,))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/add_penalty", methods=["POST"])
def add_penalty():
    if session.get('role') != 'admin':
        return jsonify({"success": False})
    
    ministrant = request.form.get("ministrant")
    typ_kary = request.form.get("typ_kary")
    opis = request.form.get("opis", "")
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("INSERT INTO kary (ministrant, typ_kary, opis, data_wydania, wydana_przez) VALUES (?,?,?,?,?)",
              (ministrant, typ_kary, opis, datetime.today().date(), session['user']))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route("/delete_penalty/<int:penalty_id>", methods=["POST"])
def delete_penalty(penalty_id):
    if session.get('role') != 'admin':
        return jsonify({"success": False})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("UPDATE kary SET status='removed' WHERE id=?", (penalty_id,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route("/get_user_penalties/<ministrant>")
def get_user_penalties(ministrant):
    if 'user' not in session:
        return jsonify([])
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT id, typ_kary, opis, data_wydania, wydana_przez FROM kary WHERE ministrant=? AND status='active'",
              (ministrant,))
    penalties = c.fetchall()
    conn.close()
    
    return jsonify([{'id': p[0], 'typ_kary': p[1], 'opis': p[2], 'data': str(p[3]), 'wydana_przez': p[4]} for p in penalties])

@app.route("/delete_conversation/<int:conv_id>", methods=["POST"])
def delete_conversation(conv_id):
    if session.get('role') != 'admin':
        return jsonify({"success": False})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # Usuń wiadomości
    c.execute("DELETE FROM wiadomosci WHERE conversation_id=?", (conv_id,))
    # Usuń rozmowę
    c.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

@app.route("/get_all_penalties")
def get_all_penalties():
    if session.get('role') != 'admin':
        return jsonify([])
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT id, ministrant, typ_kary, opis, data_wydania, wydana_przez, status FROM kary ORDER BY data_wydania DESC")
    penalties = c.fetchall()
    conn.close()
    
    return jsonify([{'id': p[0], 'ministrant': p[1], 'typ_kary': p[2], 'opis': p[3], 'data': str(p[4]), 'wydana_przez': p[5], 'status': p[6]} for p in penalties])

@app.route("/get_blocked_users")
def get_blocked_users():
    if session.get('role') != 'admin':
        return jsonify([])
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("SELECT id, blokowany, data_blokady FROM zablokowani ORDER BY data_blokady DESC")
    blocked = c.fetchall()
    conn.close()
    
    return jsonify([{'id': b[0], 'blokowany': b[1], 'data': str(b[2])} for b in blocked])

# -------------------- Eksport danych --------------------
@app.route("/export_attendance")
def export_attendance():
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    # Pobierz dane do eksportu
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('''
        SELECT u.username, u.role, o.data, o.punkty, o.typ_mszy, o.uwagi, o.status
        FROM obecnosci o 
        JOIN users u ON o.user = u.username 
        ORDER BY o.data DESC
    ''')
    records = c.fetchall()
    conn.close()
    
    # Utwórz CSV w pamięci
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Użytkownik', 'Rola', 'Data', 'Punkty', 'Typ mszy', 'Uwagi', 'Status'])
    
    for record in records:
        writer.writerow(record)
    
    output.seek(0)
    
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=obecnosci_export.csv"}
    )

# -------------------- API dla statystyk --------------------
@app.route("/api/user_stats/<username>")
def api_user_stats(username):
    if session.get('role') not in ['admin','ksiez']:
        return jsonify({"error": "Brak uprawnień"})
    
    stats = get_user_stats(username)
    return jsonify(stats)

# -------------------- Harmonogram mszy --------------------
@app.route("/add_mass_schedule", methods=["POST"])
def add_mass_schedule():
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    data = request.form["data"]
    godzina = request.form["godzina"]
    typ_mszy = request.form["typ_mszy"]
    uwagi = request.form.get("uwagi", "")
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("INSERT INTO harmonogram (data, godzina, typ_mszy, uwagi) VALUES (?,?,?,?)",
             (data, godzina, typ_mszy, uwagi))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/edit_mass_schedule/<int:schedule_id>", methods=["GET", "POST"])
def edit_mass_schedule(schedule_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    if request.method == "POST":
        data = request.form["data"]
        godzina = request.form["godzina"]
        typ_mszy = request.form["typ_mszy"]
        uwagi = request.form.get("uwagi", "")
        
        c.execute("UPDATE harmonogram SET data=?, godzina=?, typ_mszy=?, uwagi=? WHERE id=?",
                 (data, godzina, typ_mszy, uwagi, schedule_id))
        conn.commit()
        conn.close()
        return redirect(url_for("dashboard"))
    
    c.execute("SELECT id, data, godzina, typ_mszy, uwagi FROM harmonogram WHERE id=?", (schedule_id,))
    schedule = c.fetchone()
    conn.close()
    
    if not schedule:
        return redirect(url_for("dashboard"))
    
    return render_template("edit_mass_schedule.html", schedule=schedule, mass_types=get_mass_types())

@app.route("/delete_mass_schedule/<int:schedule_id>")
def delete_mass_schedule(schedule_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM harmonogram WHERE id=?", (schedule_id,))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

# -------------------- Zarządzanie konfiguracją --------------------
@app.route("/admin/update_config", methods=["POST"])
def update_config():
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    for key in request.form:
        if key.startswith('config_'):
            config_key = key[7:]  # Usuń prefix 'config_'
            value = request.form[key]
            c.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (config_key, value))
    
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

# -------------------- Zarządzanie typami mszy --------------------
@app.route("/admin/add_mass_type", methods=["POST"])
def add_mass_type():
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    name = request.form["name"]
    points = request.form["points"]
    description = request.form.get("description", "")
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO mass_types (name, points, description) VALUES (?, ?, ?)",
                 (name, points, description))
        conn.commit()
    except sqlite3.IntegrityError:
        pass  # Typ już istnieje
    finally:
        conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/admin/update_mass_type/<int:mass_type_id>", methods=["POST"])
def update_mass_type(mass_type_id):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    try:
        points = int(request.form.get("points", 1))
        description = request.form.get("description", "")
        bonus_second_mass = 1 if request.form.get("bonus_second_mass") == "on" else 0
        bonus_points = int(request.form.get("bonus_points", 0)) if bonus_second_mass else 0
        
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        c.execute("UPDATE mass_types SET points=?, is_active=1, description=?, bonus_second_mass=?, bonus_points=? WHERE id=?",
                 (points, description, bonus_second_mass, bonus_points, mass_type_id))
        conn.commit()
        conn.close()
    except:
        pass
    
    return redirect(url_for("dashboard"))

@app.route("/admin/delete_mass_type/<int:mass_type_id>")
def delete_mass_type(mass_type_id):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM mass_types WHERE id=?", (mass_type_id,))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

# -------------------- Zarządzanie sezonami punktów --------------------
@app.route("/admin/add_season", methods=["POST"])
def add_season():
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    name = request.form["name"]
    start_date = request.form["start_date"]
    end_date = request.form["end_date"]
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("INSERT INTO point_seasons (name, start_date, end_date) VALUES (?, ?, ?)",
             (name, start_date, end_date))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/admin/set_current_season/<int:season_id>")
def set_current_season(season_id):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("UPDATE config SET value=? WHERE key='current_season_id'", (str(season_id),))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/admin/delete_season/<int:season_id>")
def delete_season(season_id):
    if session.get('role') != 'admin':
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM point_seasons WHERE id=?", (season_id,))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

# -------------------- Akceptacja i odrzucanie punktów --------------------
@app.route("/approve_points/<int:points_id>")
def approve_points(points_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("UPDATE obecnosci SET status=?, approved_by=?, approved_date=? WHERE id=?",
             ('approved', session['user'], datetime.today().date(), points_id))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/reject_points/<int:points_id>")
def reject_points(points_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("UPDATE obecnosci SET status=? WHERE id=?", ('rejected', points_id))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

@app.route("/edit_points/<int:points_id>", methods=["GET", "POST"])
def edit_points(points_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    if request.method == "POST":
        punkty = request.form["punkty"]
        typ_mszy = request.form["typ_mszy"]
        uwagi = request.form.get("uwagi", "")
        
        c.execute("UPDATE obecnosci SET punkty=?, typ_mszy=?, uwagi=? WHERE id=?",
                 (punkty, typ_mszy, uwagi, points_id))
        conn.commit()
        conn.close()
        return redirect(url_for("dashboard"))
    
    c.execute("SELECT id, user, data, punkty, typ_mszy, uwagi FROM obecnosci WHERE id=?", (points_id,))
    points = c.fetchone()
    mass_types = get_mass_types(only_active=False)
    conn.close()
    
    if not points:
        return redirect(url_for("dashboard"))
    
    return render_template("edit_points.html", points=points, mass_types=mass_types)

@app.route("/delete_points/<int:points_id>")
def delete_points(points_id):
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("DELETE FROM obecnosci WHERE id=?", (points_id,))
    conn.commit()
    conn.close()
    
    return redirect(url_for("dashboard"))

# -------------------- Raporty zaawansowane --------------------
@app.route("/reports")
def reports():
    if session.get('role') not in ['admin','ksiez']:
        return redirect(url_for("dashboard"))
    
    report_type = request.args.get('type', 'monthly')
    month_filter = request.args.get('month', '')
    user_filter = request.args.get('user', '')
    week_filter = request.args.get('week_start', '')
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    if report_type == 'monthly':
        # Raport miesięczny - z filtrem miesiąca
        if month_filter:
            query = '''
                SELECT strftime('%Y-%m', data) as month, 
                       user, 
                       SUM(punkty) as total_points,
                       COUNT(*) as attendance_count
                FROM obecnosci 
                WHERE status='approved' AND strftime('%Y-%m', data) = ?
                GROUP BY month, user 
                ORDER BY total_points DESC
            '''
            c.execute(query, (month_filter,))
        else:
            query = '''
                SELECT strftime('%Y-%m', data) as month, 
                       user, 
                       SUM(punkty) as total_points,
                       COUNT(*) as attendance_count
                FROM obecnosci 
                WHERE status='approved'
                GROUP BY month, user 
                ORDER BY month DESC, total_points DESC
            '''
            c.execute(query)
        report_data = c.fetchall()
    elif report_type == 'user_ranking':
        # Ranking użytkowników - z filtrem użytkownika
        if user_filter:
            query = '''
                SELECT user, 
                       SUM(punkty) as total_points,
                       COUNT(*) as attendance_count,
                       AVG(punkty) as avg_points
                FROM obecnosci 
                WHERE status='approved' AND user = ?
                GROUP BY user 
                ORDER BY total_points DESC
            '''
            c.execute(query, (user_filter,))
        else:
            query = '''
                SELECT user, 
                       SUM(punkty) as total_points,
                       COUNT(*) as attendance_count,
                       AVG(punkty) as avg_points
                FROM obecnosci 
                WHERE status='approved'
                GROUP BY user 
                ORDER BY total_points DESC
            '''
            c.execute(query)
        report_data = c.fetchall()
    elif report_type == 'weekly_stats':
        # Statystyki tygodniowe - z filtrem tygodnia
        if week_filter:
            # Konwertuj datę na numer tygodnia
            week_date = datetime.strptime(week_filter, '%Y-%m-%d').date()
            week_start = week_date - timedelta(days=week_date.weekday())
            week_end = week_start + timedelta(days=6)
            query = '''
                SELECT strftime('%Y-%W', data) as week, 
                       user, 
                       SUM(punkty) as total_points,
                       COUNT(*) as attendance_count
                FROM obecnosci 
                WHERE status='approved' AND data BETWEEN ? AND ?
                GROUP BY week, user 
                ORDER BY total_points DESC
            '''
            c.execute(query, (week_start, week_end))
        else:
            query = '''
                SELECT strftime('%Y-%W', data) as week, 
                       user, 
                       SUM(punkty) as total_points,
                       COUNT(*) as attendance_count
                FROM obecnosci 
                WHERE status='approved'
                GROUP BY week, user 
                ORDER BY week DESC, total_points DESC
            '''
            c.execute(query)
        report_data = c.fetchall()
    else:
        report_data = []
    
    conn.close()
    
    # Pobierz dzisiejszą datę dla domyślnych wartości
    today = datetime.today().date()
    today_month = today.strftime('%Y-%m')
    
    return render_template("reports.html", report_data=report_data, report_type=report_type, 
                         today_month=today_month, today_date=today, all_users=get_all_users())

# -------------------- Funkcje systemowe --------------------
@app.route("/admin/clear_old_data", methods=["POST"])
def clear_old_data():
    if session.get('role') != 'admin':
        return jsonify({"success": False, "message": "Brak uprawnień"})
    
    try:
        # Usuń dane starsze niż 1 rok
        one_year_ago = (datetime.today() - timedelta(days=365)).date()
        
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        c.execute("DELETE FROM obecnosci WHERE data < ?", (one_year_ago,))
        deleted_rows = c.rowcount
        conn.commit()
        conn.close()
        
        return jsonify({"success": True, "message": f"Usunięto {deleted_rows} starych rekordów"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Błąd: {str(e)}"})

@app.route("/admin/reset_system", methods=["POST"])
def reset_system():
    if session.get('role') != 'admin':
        return jsonify({"success": False, "message": "Brak uprawnień"})
    
    try:
        confirmation = request.json.get('confirmation')
        if confirmation != 'RESET':
            return jsonify({"success": False, "message": "Nieprawidłowe potwierdzenie"})
        
        conn = sqlite3.connect(DB)
        c = conn.cursor()
        
        # Zachowaj tylko użytkowników i konfigurację
        c.execute("DELETE FROM obecnosci")
        c.execute("DELETE FROM ogloszenia")
        c.execute("DELETE FROM harmonogram")
        c.execute("DELETE FROM wydarzenia")
        
        conn.commit()
        conn.close()
        
        return jsonify({"success": True, "message": "System został zresetowany"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Błąd: {str(e)}"})

@app.route("/emergency_contact", methods=["POST"])
def emergency_contact():
    name = request.form.get("name")
    email = request.form.get("email", "")
    messenger = request.form.get("messenger", "")
    problem = request.form.get("problem")
    priority = request.form.get("priority", "")
    description = request.form.get("description")
    date = request.form.get("date", "")
    actions = request.form.get("actions", "")
    device = request.form.get("device", "")
    cache = request.form.get("cache") == "on"
    reload = request.form.get("reload") == "on"
    incognito = request.form.get("incognito") == "on"
    other_device = request.form.get("other_device") == "on"
    
    if not name or not problem or not description or (not email and not messenger):
        return jsonify({"success": False, "error": "Brak wymaganych danych"})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    # Drop old table if it exists (to rebuild with new schema)
    try:
        c.execute("DROP TABLE IF EXISTS emergency_contacts")
    except:
        pass
    c.execute('''CREATE TABLE IF NOT EXISTS emergency_contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    email TEXT,
                    messenger TEXT,
                    problem TEXT,
                    priority TEXT,
                    description TEXT,
                    actions TEXT,
                    device TEXT,
                    cache_cleared INTEGER,
                    page_reloaded INTEGER,
                    incognito_tested INTEGER,
                    other_device_tested INTEGER,
                    last_login_date TEXT,
                    contact_date DATETIME,
                    status TEXT DEFAULT 'new'
                 )''')
    try:
        c.execute("""INSERT INTO emergency_contacts 
                     (name, email, messenger, problem, priority, description, actions, device, 
                      cache_cleared, page_reloaded, incognito_tested, other_device_tested, last_login_date, contact_date) 
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (name, email, messenger, problem, priority, description, actions, device,
                   1 if cache else 0, 1 if reload else 0, 1 if incognito else 0, 1 if other_device else 0,
                   date, datetime.now()))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)})

@app.route("/get_emergency_contacts")
def get_emergency_contacts():
    if session.get('role') != 'admin':
        return jsonify([])
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        # Try new schema first, fallback to old
        c.execute("""SELECT id, name, email, messenger, problem, priority, description, actions, device,
                            cache_cleared, page_reloaded, incognito_tested, other_device_tested,
                            last_login_date, contact_date, status 
                     FROM emergency_contacts ORDER BY contact_date DESC""")
        contacts = c.fetchall()
        conn.close()
        return jsonify([{'id': c[0], 'name': c[1], 'email': c[2], 'messenger': c[3], 'problem': c[4], 
                        'priority': c[5], 'description': c[6], 'actions': c[7], 'device': c[8],
                        'cache': bool(c[9]), 'reload': bool(c[10]), 'incognito': bool(c[11]), 'other': bool(c[12]),
                        'last_login': str(c[13]), 'contact_date': str(c[14]), 'status': c[15]} for c in contacts])
    except:
        conn.close()
        return jsonify([])

@app.route("/update_emergency_contact/<int:contact_id>", methods=["POST"])
def update_emergency_contact(contact_id):
    if session.get('role') != 'admin':
        return jsonify({"success": False})
    
    data = request.get_json()
    status = data.get('status', 'resolved')
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute("UPDATE emergency_contacts SET status=? WHERE id=?", (status, contact_id))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except:
        conn.close()
        return jsonify({"success": False})

@app.route("/delete_emergency_contact/<int:contact_id>", methods=["POST"])
def delete_emergency_contact(contact_id):
    if session.get('role') != 'admin':
        return jsonify({"success": False})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute("DELETE FROM emergency_contacts WHERE id=?", (contact_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except:
        conn.close()
        return jsonify({"success": False})

@app.route("/get_user_info/<user>")
def get_user_info(user):
    if session.get('role') != 'admin':
        return jsonify({"success": False, "error": "Brak dostępu"})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    # Dane użytkownika
    c.execute("SELECT username, role, is_active, created_date FROM users WHERE username=?", (user,))
    u = c.fetchone()
    
    if not u:
        conn.close()
        return jsonify({"success": False, "error": "Użytkownik nie znaleziony"})
    
    username, role, is_active, created_date = u
    
    # Statystyki - TYLKO ZATWIERDZONE OBECNOŚCI (status='approved')
    c.execute("SELECT COUNT(*) FROM obecnosci WHERE user=? AND status='approved'", (user,))
    attendance_count = c.fetchone()[0]
    
    # Punkty tego miesiąca - TYLKO ZATWIERDZONE
    c.execute("SELECT COALESCE(SUM(punkty), 0) FROM obecnosci WHERE user=? AND status='approved' AND strftime('%Y-%m', data) = strftime('%Y-%m', 'now')", (user,))
    monthly_points = int(c.fetchone()[0])
    
    # Kary aktywne
    c.execute("SELECT COUNT(*) FROM kary WHERE ministrant=? AND status='active'", (user,))
    penalty_count = c.fetchone()[0]
    
    # Ostatni login - ostatnia ZATWIERDZONA obecność
    c.execute("SELECT MAX(data) FROM obecnosci WHERE user=? AND status='approved'", (user,))
    result = c.fetchone()
    last_login = result[0] if result and result[0] else None
    last_login_display = last_login if last_login else "Nigdy"
    
    conn.close()
    
    return jsonify({
        "success": True,
        "username": username,
        "role": role,
        "status": "✓ Aktywny" if is_active else "✗ Nieaktywny",
        "created_date": created_date,
        "last_login_date": last_login_display,
        "attendance_count": attendance_count,
        "monthly_points": monthly_points,
        "penalty_count": penalty_count
    })

# ==================== SYSTEM NOTYFIKACJI ====================

import uuid

@app.route("/register_device", methods=["POST"])
def register_device():
    data = request.json
    device_name = data.get('device_name', 'Nieznane urządzenie')
    device_id = str(uuid.uuid4())
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute('''INSERT INTO devices (device_id, device_name, registered_date, last_ping, is_active) 
                     VALUES (?, ?, datetime('now'), datetime('now'), 1)''', 
                  (device_id, device_name))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "device_id": device_id, "message": f"Urządzenie zarejestrowane! ID: {device_id}"})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)})

@app.route("/get_notifications/<device_id>")
def get_notifications(device_id):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute('''SELECT id, event_type, title, message, sent_date, is_read 
                     FROM notifications WHERE device_id=? ORDER BY sent_date DESC LIMIT 50''', (device_id,))
        notif = c.fetchall()
        c.execute("UPDATE devices SET last_ping=datetime('now') WHERE device_id=?", (device_id,))
        conn.commit()
        conn.close()
        return jsonify({
            "success": True,
            "notifications": [{"id": n[0], "type": n[1], "title": n[2], "msg": n[3], "time": n[4], "read": n[5]} for n in notif]
        })
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)})

@app.route("/send_notification", methods=["POST"])
def send_notification():
    if session.get('role') != 'admin':
        return jsonify({"success": False, "error": "Brak dostępu"})
    
    data = request.json
    event_type = data.get('event_type', 'info')
    title = data.get('title', 'Powiadomienie')
    message = data.get('message', '')
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute("SELECT device_id FROM devices WHERE is_active=1")
        devices = c.fetchall()
        count = 0
        for (dev_id,) in devices:
            c.execute('''INSERT INTO notifications (device_id, event_type, title, message, sent_date, is_read) 
                         VALUES (?, ?, ?, ?, datetime('now'), 0)''',
                      (dev_id, event_type, title, message))
            count += 1
        conn.commit()
        conn.close()
        return jsonify({"success": True, "sent_to": count})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)})

@app.route("/get_registered_devices")
def get_registered_devices():
    if session.get('role') != 'admin':
        return jsonify({"success": False, "error": "Brak dostępu"})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('''SELECT id, device_id, device_name, registered_date, last_ping, is_active 
                 FROM devices ORDER BY registered_date DESC''')
    devices = c.fetchall()
    conn.close()
    return jsonify({
        "success": True,
        "devices": [{"id": d[0], "device_id": d[1], "name": d[2], "reg_date": d[3], "last_ping": d[4], "active": d[5]} for d in devices]
    })

# ==================== API DOKUMENTACJA ====================

@app.route("/api/docs")
def api_docs():
    """Zwraca pełną dokumentację API"""
    return jsonify({
        "title": "Ministranci - Notification System API",
        "version": "1.0",
        "base_url": request.host_url.rstrip('/'),
        "endpoints": {
            "register_device": {
                "method": "POST",
                "path": "/register_device",
                "description": "Rejestruje nowe urządzenie w systemie notyfikacji",
                "auth_required": False,
                "request_body": {
                    "device_name": "string (nazwa urządzenia)"
                },
                "response": {
                    "success": "boolean",
                    "device_id": "string (UUID)",
                    "message": "string"
                },
                "example_request": {
                    "device_name": "Moja Aplikacja Kościelna"
                },
                "example_response": {
                    "success": True,
                    "device_id": "a1b2c3d4-e5f6-4g7h-8i9j-k0l1m2n3o4p5",
                    "message": "Urządzenie zarejestrowane! ID: a1b2c3d4-e5f6-4g7h-8i9j-k0l1m2n3o4p5"
                }
            },
            "get_notifications": {
                "method": "GET",
                "path": "/get_notifications/<device_id>",
                "description": "Pobiera powiadomienia dla urządzenia i aktualizuje last_ping",
                "auth_required": False,
                "parameters": {
                    "device_id": "string (UUID z register_device)"
                },
                "response": {
                    "success": "boolean",
                    "notifications": [
                        {
                            "id": "integer",
                            "type": "string (admin/emergency/event/alert)",
                            "title": "string",
                            "msg": "string",
                            "time": "datetime",
                            "read": "boolean"
                        }
                    ]
                },
                "limit": "ostatnie 50 powiadomień",
                "example_response": {
                    "success": True,
                    "notifications": [
                        {
                            "id": 1,
                            "type": "admin",
                            "title": "⚠️ Kontakt awaryjny",
                            "msg": "Zgłoszono problem z logowaniem",
                            "time": "2025-11-29 19:40:00",
                            "read": False
                        }
                    ]
                },
                "polling_recommendation": "co 30-60 sekund"
            },
            "send_notification": {
                "method": "POST",
                "path": "/send_notification",
                "description": "Wysyła powiadomienie do WSZYSTKICH zarejestrowanych urządzeń (tylko dla admin)",
                "auth_required": True,
                "auth_type": "Admin session required",
                "request_body": {
                    "event_type": "string (admin/emergency/event/alert)",
                    "title": "string",
                    "message": "string"
                },
                "response": {
                    "success": "boolean",
                    "sent_to": "integer (liczba urządzeń)"
                },
                "example_request": {
                    "event_type": "admin",
                    "title": "📅 Nowa msza",
                    "message": "Zmiana harmonogramu na piątek"
                },
                "example_response": {
                    "success": True,
                    "sent_to": 5
                }
            },
            "get_registered_devices": {
                "method": "GET",
                "path": "/get_registered_devices",
                "description": "Pobiera listę wszystkich zarejestrowanych urządzeń (tylko dla admin)",
                "auth_required": True,
                "auth_type": "Admin session required",
                "response": {
                    "success": "boolean",
                    "devices": [
                        {
                            "id": "integer",
                            "device_id": "string (UUID)",
                            "name": "string",
                            "reg_date": "datetime",
                            "last_ping": "datetime",
                            "active": "boolean"
                        }
                    ]
                }
            }
        },
        "event_types": {
            "admin": "Zwykłe powiadomienie administracyjne",
            "emergency": "Kontakt awaryjny",
            "event": "Ereignis/Msza/Wydarzenie",
            "alert": "Alert systemowy"
        },
        "error_handling": {
            "description": "Wszystkie błędy zwracają JSON z success:false i error message",
            "example_error": {
                "success": False,
                "error": "Brak dostępu / Device not found / ..."
            }
        },
        "implementation_guide": {
            "step_1": "POST /register_device - pobierz device_id",
            "step_2": "Zapisz device_id w localStorage/bazie",
            "step_3": "GET /get_notifications/<device_id> - polluj co 30-60 sekund",
            "step_4": "Wyświetl powiadomienia użytkownikowi",
            "step_5": "(Opcjonalnie) Obsługuj różne event_types"
        },
        "code_examples": {
            "python": """
import requests
import time

BASE_URL = "https://ministranci.replit.dev"

# 1. Rejestracja
response = requests.post(f"{BASE_URL}/register_device", json={
    "device_name": "Moja Aplikacja"
})
device_id = response.json()["device_id"]
print(f"✓ Zarejestrowano: {device_id}")

# 2. Polling powiadomień
while True:
    response = requests.get(f"{BASE_URL}/get_notifications/{device_id}")
    notifications = response.json()["notifications"]
    for notif in notifications:
        if not notif["read"]:
            print(f"🔔 {notif['title']}: {notif['msg']}")
    time.sleep(30)
            """,
            "javascript": """
const BASE_URL = "https://ministranci.replit.dev";

// 1. Rejestracja
const registerResponse = await fetch(`${BASE_URL}/register_device`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ device_name: "Moja Aplikacja" })
});
const { device_id } = await registerResponse.json();
localStorage.setItem("deviceId", device_id);

// 2. Polling powiadomień
setInterval(async () => {
  const response = await fetch(`${BASE_URL}/get_notifications/${device_id}`);
  const { notifications } = await response.json();
  notifications.forEach(notif => {
    if (!notif.read) {
      console.log(`🔔 ${notif.title}: ${notif.msg}`);
    }
  });
}, 30000);
            """
        }
    })

@app.route("/api/spec.json")
def api_spec():
    """OpenAPI/Swagger specification"""
    return jsonify({
        "openapi": "3.0.0",
        "info": {
            "title": "Ministranci Notification API",
            "version": "1.0.0",
            "description": "API for mobile app notification system integration"
        },
        "servers": [{"url": request.host_url.rstrip('/')}],
        "paths": {
            "/register_device": {
                "post": {
                    "summary": "Register new device",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "device_name": {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Device registered successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "success": {"type": "boolean"},
                                            "device_id": {"type": "string"},
                                            "message": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/get_notifications/{device_id}": {
                "get": {
                    "summary": "Get notifications for device",
                    "parameters": [
                        {
                            "name": "device_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"}
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Notifications retrieved"
                        }
                    }
                }
            },
            "/send_notification": {
                "post": {
                    "summary": "Send notification to all devices (admin only)",
                    "security": [{"session": []}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "event_type": {"type": "string"},
                                        "title": {"type": "string"},
                                        "message": {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Notifications sent"
                        }
                    }
                }
            },
            "/get_registered_devices": {
                "get": {
                    "summary": "Get list of registered devices (admin only)",
                    "security": [{"session": []}],
                    "responses": {
                        "200": {
                            "description": "List of devices"
                        }
                    }
                }
            }
        }
    })

@app.route("/export_all_data")
def export_all_data():
    if session.get('role') != 'admin':
        return jsonify({"success": False, "error": "Brak dostępu"})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    
    try:
        tables = ['users', 'obecnosci', 'ogloszenia', 'harmonogram', 'config', 'mass_types', 'kary']
        export_data = {}
        
        for table in tables:
            c.execute(f"SELECT * FROM {table}")
            cols = [desc[0] for desc in c.description]
            rows = c.fetchall()
            export_data[table] = [dict(zip(cols, row)) for row in rows]
        
        conn.close()
        return jsonify({"success": True, "data": export_data})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)})

@app.route("/import_all_data", methods=["POST"])
def import_all_data():
    if session.get('role') != 'admin':
        return jsonify({"success": False, "error": "Brak dostępu"})
    
    data = request.json.get('data', {})
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    total = 0
    
    try:
        for table, records in data.items():
            if not records:
                continue
            for record in records:
                cols = ', '.join(record.keys())
                vals = ', '.join(['?' for _ in record.values()])
                sql = f"INSERT OR IGNORE INTO {table} ({cols}) VALUES ({vals})"
                c.execute(sql, tuple(record.values()))
                total += 1
        
        conn.commit()
        conn.close()
        return jsonify({"success": True, "imported": total})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)})

@app.route("/delete_all_schedules", methods=["POST"])
def delete_all_schedules():
    if session.get('role') != 'admin':
        return jsonify({"success": False, "error": "Brak dostępu"})
    
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    try:
        c.execute("SELECT COUNT(*) FROM harmonogram")
        count = c.fetchone()[0]
        c.execute("DELETE FROM harmonogram")
        conn.commit()
        conn.close()
        return jsonify({"success": True, "deleted": count})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, debug=True)


