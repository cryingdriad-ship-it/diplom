-- MyFitnessPal SQLite schema
-- This schema reflects current backend init_db() structure.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    firebase_uid TEXT,
    created_at TEXT NOT NULL,
    sex TEXT DEFAULT 'female',
    height_cm REAL DEFAULT 165.0,
    weight_kg REAL DEFAULT 65.0,
    age_years INTEGER DEFAULT 30,
    goal_mode TEXT DEFAULT 'maintain'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid
ON users(firebase_uid)
WHERE firebase_uid IS NOT NULL;

CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    food_name TEXT NOT NULL,
    grams REAL NOT NULL,
    calories REAL NOT NULL,
    protein REAL NOT NULL,
    fat REAL NOT NULL,
    carbs REAL NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    date_key TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS custom_foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    grams_base REAL NOT NULL DEFAULT 100,
    calories REAL NOT NULL,
    protein REAL NOT NULL,
    fat REAL NOT NULL,
    carbs REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_custom_foods_user_id
ON custom_foods(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_foods_user_name
ON custom_foods(user_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_custom_foods_user_updated
ON custom_foods(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS weight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date_key TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weight_logs_user_date
ON weight_logs(user_id, date_key);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_updated
ON weight_logs(user_id, updated_at DESC);
