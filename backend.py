import base64
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import socket
import sqlite3
from dataclasses import dataclass
from typing import Optional

import requests
from flask import Flask, jsonify, request, session
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_local_env_file(path: str) -> None:
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as env_file:
            for raw_line in env_file:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key:
                    continue
                cleaned_value = value.strip().strip("\"'")
                existing_value = os.getenv(key, "").strip()
                if not existing_value:
                    os.environ[key] = cleaned_value
    except OSError:
        return


load_local_env_file(os.path.join(BASE_DIR, ".env"))
DB_PATH = os.getenv("MYFITNESSPAL_DB_PATH", os.path.join(BASE_DIR, "myfitnesspal.db"))

USDA_API_KEY = os.getenv("USDA_API_KEY", "").strip()
FATSECRET_CLIENT_ID = os.getenv("FATSECRET_CLIENT_ID", "").strip()
FATSECRET_CLIENT_SECRET = os.getenv("FATSECRET_CLIENT_SECRET", "").strip()
EDAMAM_APP_ID = os.getenv("EDAMAM_APP_ID", os.getenv("EDAMAM_ID", "")).strip()
EDAMAM_APP_KEY = os.getenv("EDAMAM_APP_KEY", os.getenv("EDAMAM_KEY", "")).strip()
OPENAI_API_KEY = os.getenv(
    "OPENAI_API_KEY",
    os.getenv("OPENAI_KEY", os.getenv("OPENAI_TOKEN", "")),
).strip()
OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini").strip()
def get_huggingface_token() -> str:
    for key in (
        "HUGGINGFACE_API_TOKEN",
        "HUGGINGFACE_TOKEN",
        "HF_TOKEN",
        "HUGGINGFACEHUB_API_TOKEN",
        "HF_API_TOKEN",
        "HUGGINGFACE_ACCESS_TOKEN",
    ):
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


HUGGINGFACE_API_TOKEN = get_huggingface_token()
HUGGINGFACE_FOOD_MODELS = [
    model.strip()
    for model in os.getenv(
        "HUGGINGFACE_FOOD_MODELS",
        "nateraw/food,Kaludi/food-category-classification-v2.0",
    ).split(",")
    if model.strip()
]
try:
    socket.gethostbyname("router.huggingface.co")
    HUGGINGFACE_DNS_AVAILABLE = True
except OSError:
    HUGGINGFACE_DNS_AVAILABLE = False
try:
    socket.gethostbyname("api-inference.huggingface.co")
    HUGGINGFACE_LEGACY_DNS_AVAILABLE = True
except OSError:
    HUGGINGFACE_LEGACY_DNS_AVAILABLE = False
CLARIFAI_PAT = os.getenv("CLARIFAI_PAT", "").strip()
CLARIFAI_USER_ID = os.getenv("CLARIFAI_USER_ID", "clarifai").strip()
CLARIFAI_APP_ID = os.getenv("CLARIFAI_APP_ID", "main").strip()
CLARIFAI_MODEL_ID = os.getenv("CLARIFAI_FOOD_MODEL_ID", "food-item-recognition").strip()
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "").strip()

DEFAULT_CALORIES_BY_LABEL = {
    "salad": ("Mixed salad", 120, 4, 7, 10),
    "apple": ("Apple", 95, 0.5, 0.3, 25),
    "banana": ("Banana", 105, 1.3, 0.4, 27),
    "orange": ("Orange", 62, 1.2, 0.2, 15.4),
    "pizza": ("Pizza slice", 285, 12, 10, 36),
    "burger": ("Cheeseburger", 354, 17, 17, 31),
    "fries": ("French fries", 312, 3.4, 15, 41),
    "rice": ("Cooked rice", 205, 4.3, 0.4, 45),
    "chicken": ("Chicken breast", 220, 40, 5, 0),
    "beef": ("Beef steak", 271, 25, 19, 0),
    "pasta": ("Cooked pasta", 221, 8, 1.3, 43),
    "soup": ("Soup", 150, 8, 5, 18),
    "fish": ("Fish", 233, 25, 14, 0),
    "cake": ("Cake", 350, 4, 18, 43),
}
LOCAL_FOOD_LIBRARY = [
    {"name": "Chicken breast", "aliases": ["chicken breast", "chicken", "куряча грудка", "куриная грудка"], "calories": 165, "protein": 31, "fat": 3.6, "carbs": 0},
    {"name": "Turkey fillet", "aliases": ["turkey", "turkey fillet", "індичка", "индейка"], "calories": 150, "protein": 29, "fat": 3, "carbs": 0},
    {"name": "Beef steak", "aliases": ["beef steak", "steak", "beef", "стейк", "говядина"], "calories": 271, "protein": 25, "fat": 19, "carbs": 0},
    {"name": "Pork chop", "aliases": ["pork chop", "pork", "свинина"], "calories": 242, "protein": 23, "fat": 16, "carbs": 0},
    {"name": "Meatballs", "aliases": ["meatballs", "тефтелі", "тефтели"], "calories": 220, "protein": 14, "fat": 16, "carbs": 5},
    {"name": "Cutlet", "aliases": ["cutlet", "котлета"], "calories": 250, "protein": 15, "fat": 18, "carbs": 7},
    {"name": "Salmon", "aliases": ["salmon", "лосось", "семга"], "calories": 208, "protein": 20, "fat": 13, "carbs": 0},
    {"name": "Tuna", "aliases": ["tuna", "тунец"], "calories": 132, "protein": 28, "fat": 1.3, "carbs": 0},
    {"name": "White fish", "aliases": ["white fish", "fish fillet", "риба", "рыба"], "calories": 120, "protein": 23, "fat": 3, "carbs": 0},
    {"name": "Egg boiled", "aliases": ["egg", "boiled egg", "яйце", "яйцо"], "calories": 155, "protein": 13, "fat": 11, "carbs": 1.1},
    {"name": "Omelette", "aliases": ["omelette", "омлет"], "calories": 154, "protein": 10, "fat": 12, "carbs": 1.9},
    {"name": "Fried eggs", "aliases": ["fried eggs", "яєчня", "яичница"], "calories": 196, "protein": 14, "fat": 15, "carbs": 1.5},
    {"name": "Rice cooked", "aliases": ["rice", "white rice", "рис"], "calories": 130, "protein": 2.7, "fat": 0.3, "carbs": 28},
    {"name": "Buckwheat cooked", "aliases": ["buckwheat", "гречка", "гречневая каша"], "calories": 110, "protein": 4.2, "fat": 1.1, "carbs": 21.3},
    {"name": "Oatmeal", "aliases": ["oatmeal", "oats", "вівсянка", "овсянка"], "calories": 88, "protein": 3, "fat": 1.4, "carbs": 15},
    {"name": "Quinoa cooked", "aliases": ["quinoa", "кіноа", "киноа"], "calories": 120, "protein": 4.4, "fat": 1.9, "carbs": 21.3},
    {"name": "Bulgur cooked", "aliases": ["bulgur", "булгур"], "calories": 83, "protein": 3.1, "fat": 0.2, "carbs": 18.6},
    {"name": "Couscous cooked", "aliases": ["couscous", "кус-кус", "кускус"], "calories": 112, "protein": 3.8, "fat": 0.2, "carbs": 23},
    {"name": "Pasta cooked", "aliases": ["pasta", "макарони", "макароны"], "calories": 158, "protein": 5.8, "fat": 0.9, "carbs": 31},
    {"name": "Spaghetti bolognese", "aliases": ["spaghetti bolognese", "болоньезе"], "calories": 165, "protein": 7, "fat": 6, "carbs": 21},
    {"name": "Pasta carbonara", "aliases": ["carbonara", "паста карбонара"], "calories": 210, "protein": 8, "fat": 10, "carbs": 22},
    {"name": "Potato boiled", "aliases": ["potato", "boiled potato", "картопля", "картофель"], "calories": 87, "protein": 1.9, "fat": 0.1, "carbs": 20},
    {"name": "Mashed potato", "aliases": ["mashed potato", "пюре", "картофельное пюре"], "calories": 95, "protein": 2.1, "fat": 3.5, "carbs": 15},
    {"name": "Fried potato", "aliases": ["fried potato", "жареная картошка", "смажена картопля"], "calories": 190, "protein": 3, "fat": 9, "carbs": 24},
    {"name": "French fries", "aliases": ["fries", "french fries", "картопля фрі", "картофель фри"], "calories": 312, "protein": 3.4, "fat": 15, "carbs": 41},
    {"name": "Borscht", "aliases": ["borscht", "борщ"], "calories": 49, "protein": 2, "fat": 2.2, "carbs": 6},
    {"name": "Chicken soup", "aliases": ["chicken soup", "курячий суп", "куриный суп"], "calories": 60, "protein": 4, "fat": 2.5, "carbs": 5},
    {"name": "Mushroom soup", "aliases": ["mushroom soup", "грибний суп", "грибной суп"], "calories": 45, "protein": 1.8, "fat": 2.3, "carbs": 4.8},
    {"name": "Lentil soup", "aliases": ["lentil soup", "суп з сочевиці", "чечевичный суп"], "calories": 85, "protein": 5, "fat": 2, "carbs": 12},
    {"name": "Cabbage rolls", "aliases": ["cabbage rolls", "голубці", "голубцы"], "calories": 120, "protein": 7, "fat": 6, "carbs": 10},
    {"name": "Dumplings (pelmeni)", "aliases": ["pelmeni", "пельмені", "пельмени"], "calories": 275, "protein": 11, "fat": 12, "carbs": 31},
    {"name": "Varenyky", "aliases": ["varenyky", "вареники"], "calories": 185, "protein": 5, "fat": 4, "carbs": 32},
    {"name": "Pancakes", "aliases": ["pancakes", "млинці", "блины"], "calories": 227, "protein": 6, "fat": 9, "carbs": 28},
    {"name": "Syrniki", "aliases": ["syrniki", "сирники"], "calories": 220, "protein": 13, "fat": 10, "carbs": 20},
    {"name": "Cheesecake", "aliases": ["cheesecake", "чизкейк"], "calories": 321, "protein": 5.5, "fat": 22, "carbs": 25},
    {"name": "Pizza", "aliases": ["pizza", "піца", "пицца"], "calories": 266, "protein": 11, "fat": 10, "carbs": 33},
    {"name": "Burger", "aliases": ["burger", "hamburger", "бургер"], "calories": 295, "protein": 17, "fat": 14, "carbs": 24},
    {"name": "Hot dog", "aliases": ["hot dog", "хот-дог"], "calories": 290, "protein": 10, "fat": 18, "carbs": 22},
    {"name": "Shawarma", "aliases": ["shawarma", "шаурма"], "calories": 250, "protein": 13, "fat": 12, "carbs": 23},
    {"name": "Kebab", "aliases": ["kebab", "кебаб"], "calories": 215, "protein": 18, "fat": 12, "carbs": 8},
    {"name": "Caesar salad", "aliases": ["caesar salad", "салат цезарь", "цезар"], "calories": 190, "protein": 10, "fat": 14, "carbs": 7},
    {"name": "Greek salad", "aliases": ["greek salad", "грецький салат", "греческий салат"], "calories": 120, "protein": 4, "fat": 9, "carbs": 6},
    {"name": "Olivier salad", "aliases": ["olivier", "олів'є", "оливье"], "calories": 187, "protein": 6, "fat": 15, "carbs": 8},
    {"name": "Cobb salad", "aliases": ["cobb salad"], "calories": 160, "protein": 11, "fat": 10, "carbs": 6},
    {"name": "Avocado salad", "aliases": ["avocado salad", "салат з авокадо", "салат с авокадо"], "calories": 155, "protein": 2.5, "fat": 13, "carbs": 8},
    {"name": "Buckwheat with chicken", "aliases": ["гречка з куркою", "гречка с курицей", "buckwheat with chicken"], "calories": 145, "protein": 11, "fat": 3.4, "carbs": 18},
    {"name": "Rice with chicken", "aliases": ["рис з куркою", "рис с курицей", "rice with chicken"], "calories": 150, "protein": 11, "fat": 3.2, "carbs": 19},
    {"name": "Pilaf", "aliases": ["pilaf", "plov", "плов"], "calories": 190, "protein": 6, "fat": 7, "carbs": 27},
    {"name": "Beans boiled", "aliases": ["beans", "квасоля", "фасоль"], "calories": 127, "protein": 8.7, "fat": 0.5, "carbs": 23},
    {"name": "Chickpeas boiled", "aliases": ["chickpeas", "нут"], "calories": 164, "protein": 8.9, "fat": 2.6, "carbs": 27},
    {"name": "Lentils boiled", "aliases": ["lentils", "сочевиця", "чечевица"], "calories": 116, "protein": 9, "fat": 0.4, "carbs": 20},
    {"name": "Tofu", "aliases": ["tofu", "тофу"], "calories": 76, "protein": 8, "fat": 4.8, "carbs": 1.9},
    {"name": "Cottage cheese 5%", "aliases": ["cottage cheese", "творог", "сир кисломолочний"], "calories": 121, "protein": 17, "fat": 5, "carbs": 2.8},
    {"name": "Greek yogurt", "aliases": ["greek yogurt", "yogurt", "йогурт"], "calories": 73, "protein": 10, "fat": 2, "carbs": 3.9},
    {"name": "Kefir 2.5%", "aliases": ["kefir", "кефір", "кефир"], "calories": 53, "protein": 3, "fat": 2.5, "carbs": 4},
    {"name": "Milk 2.5%", "aliases": ["milk", "молоко"], "calories": 52, "protein": 2.8, "fat": 2.5, "carbs": 4.7},
    {"name": "Banana", "aliases": ["banana", "банан"], "calories": 89, "protein": 1.1, "fat": 0.3, "carbs": 23},
    {"name": "Apple", "aliases": ["apple", "яблуко", "яблоко"], "calories": 52, "protein": 0.3, "fat": 0.2, "carbs": 14},
    {"name": "Orange", "aliases": ["orange", "апельсин"], "calories": 47, "protein": 0.9, "fat": 0.1, "carbs": 12},
    {"name": "Grapes", "aliases": ["grapes", "виноград"], "calories": 69, "protein": 0.7, "fat": 0.2, "carbs": 18},
    {"name": "Bread", "aliases": ["bread", "хліб", "хлеб"], "calories": 265, "protein": 9, "fat": 3.2, "carbs": 49},
    {"name": "Wholegrain bread", "aliases": ["wholegrain bread", "цельнозерновой хлеб", "цільнозерновий хліб"], "calories": 247, "protein": 13, "fat": 4.2, "carbs": 41},
    {"name": "Croissant", "aliases": ["croissant", "круасан", "круассан"], "calories": 406, "protein": 8.2, "fat": 21, "carbs": 45},
    {"name": "Chocolate", "aliases": ["chocolate", "шоколад"], "calories": 546, "protein": 4.9, "fat": 31, "carbs": 61},
]
ALLOWED_SEX_VALUES = {"male", "female"}
ALLOWED_GOAL_MODES = {"loss", "maintain", "gain"}
DEFAULT_USER_PROFILE = {
    "sex": "female",
    "heightCm": 165.0,
    "weightKg": 65.0,
    "ageYears": 30,
    "goalMode": "maintain",
}


def db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = db_connect()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            firebase_uid TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "firebase_uid" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN firebase_uid TEXT")
    if "sex" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN sex TEXT")
    if "height_cm" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN height_cm REAL")
    if "weight_kg" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN weight_kg REAL")
    if "age_years" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN age_years INTEGER")
    if "goal_mode" not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN goal_mode TEXT")
    cur.execute(
        """
        UPDATE users
        SET
            sex = COALESCE(sex, ?),
            height_cm = COALESCE(height_cm, ?),
            weight_kg = COALESCE(weight_kg, ?),
            age_years = COALESCE(age_years, ?),
            goal_mode = COALESCE(goal_mode, ?)
        """,
        (
            DEFAULT_USER_PROFILE["sex"],
            DEFAULT_USER_PROFILE["heightCm"],
            DEFAULT_USER_PROFILE["weightKg"],
            DEFAULT_USER_PROFILE["ageYears"],
            DEFAULT_USER_PROFILE["goalMode"],
        ),
    )
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL"
    )
    cur.execute(
        """
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
        )
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, digest = password_hash.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return secrets.compare_digest(candidate, digest)


def current_user_id() -> Optional[int]:
    uid = session.get("user_id")
    if isinstance(uid, int):
        return uid
    return None


def auth_required():
    user_id = current_user_id()
    if not user_id:
        return None, (jsonify({"error": "Потрібна авторизація"}), 401)
    return user_id, None


def verify_firebase_token(raw_token: str) -> Optional[dict]:
    token = (raw_token or "").strip()
    if not token:
        return None
    if not FIREBASE_PROJECT_ID:
        return None
    try:
        return google_id_token.verify_firebase_token(
            token,
            google_requests.Request(),
            audience=FIREBASE_PROJECT_ID,
        )
    except Exception:
        return None


def upsert_firebase_user(firebase_uid: str, email: str) -> tuple[int, str]:
    conn = db_connect()
    cur = conn.cursor()
    existing_by_uid = cur.execute(
        "SELECT id, email FROM users WHERE firebase_uid = ?",
        (firebase_uid,),
    ).fetchone()
    if existing_by_uid:
        user_id = int(existing_by_uid["id"])
        user_email = existing_by_uid["email"]
        conn.close()
        return user_id, user_email

    existing_by_email = cur.execute(
        "SELECT id, email FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    if existing_by_email:
        user_id = int(existing_by_email["id"])
        cur.execute(
            "UPDATE users SET firebase_uid = ? WHERE id = ?",
            (firebase_uid, user_id),
        )
        conn.commit()
        conn.close()
        return user_id, existing_by_email["email"]

    placeholder_password_hash = hash_password(secrets.token_urlsafe(24))
    cur.execute(
        "INSERT INTO users(email, password_hash, firebase_uid, created_at) VALUES(?,?,?,?)",
        (email, placeholder_password_hash, firebase_uid, dt.datetime.utcnow().isoformat()),
    )
    conn.commit()
    user_id = int(cur.lastrowid)
    conn.close()
    return user_id, email


@dataclass
class FoodResult:
    name: str
    grams: float
    calories: float
    protein: float
    fat: float
    carbs: float
    source: str


def extract_image_bytes(data_url: str) -> Optional[bytes]:
    if not data_url:
        return None
    match = re.match(r"^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$", data_url.strip())
    if not match:
        return None
    try:
        return base64.b64decode(match.group(1), validate=True)
    except Exception:
        return None


def normalize_label(label: str) -> str:
    return re.sub(r"\s+", " ", (label or "").replace("_", " ").strip())


def tokenize_text(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9а-яА-ЯіІїЇєЄґҐ]+", (text or "").lower())


def is_query_match(query: str, candidate_name: str) -> bool:
    query_tokens = [token for token in tokenize_text(query) if len(token) >= 3]
    if not query_tokens:
        return False
    candidate_text = (candidate_name or "").lower()
    return any(token in candidate_text for token in query_tokens)


def search_local_food_library(query: str) -> Optional[FoodResult]:
    query_text = (query or "").strip().lower()
    if not query_text:
        return None
    query_tokens = [token for token in tokenize_text(query_text) if len(token) >= 2]
    best_item = None
    best_score = 0
    for item in LOCAL_FOOD_LIBRARY:
        aliases = [str(alias).lower() for alias in item.get("aliases", [])]
        score = 0
        for alias in aliases:
            if query_text == alias:
                score = max(score, 8)
            elif query_text in alias or alias in query_text:
                score = max(score, 6)
            if query_tokens:
                token_hits = sum(1 for token in query_tokens if token in alias)
                score = max(score, token_hits * 2)
        if score > best_score:
            best_score = score
            best_item = item
    if not best_item or best_score < 3:
        return None
    return FoodResult(
        name=best_item["name"],
        grams=100.0,
        calories=float(best_item["calories"]),
        protein=float(best_item["protein"]),
        fat=float(best_item["fat"]),
        carbs=float(best_item["carbs"]),
        source="Local food library",
    )


def search_food_suggestions(query: str, limit: int = 8) -> list[str]:
    query_text = (query or "").strip().lower()
    if len(query_text) < 2:
        return []
    query_tokens = [token for token in tokenize_text(query_text) if len(token) >= 2]
    scored: list[tuple[int, str]] = []

    for item in LOCAL_FOOD_LIBRARY:
        best_score = 0
        for alias in [str(a).lower() for a in item.get("aliases", [])]:
            if query_text == alias:
                best_score = max(best_score, 10)
            elif query_text in alias or alias in query_text:
                best_score = max(best_score, 7)
            if query_tokens:
                hits = sum(1 for token in query_tokens if token in alias)
                best_score = max(best_score, hits * 2)
        if best_score > 0:
            scored.append((best_score, item["name"]))

    for alias, values in DEFAULT_CALORIES_BY_LABEL.items():
        alias_l = alias.lower()
        score = 0
        if query_text == alias_l:
            score = 6
        elif query_text in alias_l or alias_l in query_text:
            score = 4
        if query_tokens:
            hits = sum(1 for token in query_tokens if token in alias_l)
            score = max(score, hits * 2)
        if score > 0:
            scored.append((score, values[0]))

    scored.sort(key=lambda item: (-item[0], item[1]))
    unique = []
    seen = set()
    for _, name in scored:
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(name)
        if len(unique) >= limit:
            break
    return unique


def unique_labels(candidates: list[str], limit: int = 5) -> list[str]:
    labels = []
    seen = set()
    for raw in candidates:
        label = normalize_label(raw)
        key = label.casefold()
        if not label or key in seen:
            continue
        seen.add(key)
        labels.append(label)
        if len(labels) >= limit:
            break
    return labels


def safe_number(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def response_error_text(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return (response.text or response.reason or "Unknown error").strip()
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if message:
                return str(message)
        if payload.get("message"):
            return str(payload.get("message"))
        if payload.get("error") and isinstance(payload.get("error"), str):
            return str(payload.get("error"))
    return str(payload)


def estimate_portion_grams(label: str) -> float:
    text = (label or "").lower()
    for aliases, grams in [
        (("salad",), 220.0),
        (("soup",), 320.0),
        (("pizza",), 180.0),
        (("burger", "cheeseburger"), 220.0),
        (("fries",), 140.0),
        (("pasta",), 250.0),
        (("rice",), 200.0),
        (("chicken",), 170.0),
        (("steak", "beef"), 190.0),
        (("fish", "salmon"), 180.0),
        (("cake",), 130.0),
        (("apple", "orange", "banana"), 150.0),
    ]:
        if any(alias in text for alias in aliases):
            return grams
    return 200.0


def is_generic_non_food_label(label: str) -> bool:
    text = (label or "").lower()
    generic = (
        "plate",
        "dish",
        "table",
        "cup",
        "spoon",
        "fork",
        "knife",
        "bowl",
        "container",
        "restaurant",
        "kitchen",
        "lunch",
        "dinner",
        "meal",
        "food",
    )
    return any(token in text for token in generic)


def choose_best_fallback_candidate(candidates: list[str], default_label: str) -> str:
    normalized = unique_labels(candidates, limit=8)
    for candidate in normalized:
        if not is_generic_non_food_label(candidate):
            return candidate
    return normalize_label(default_label or (normalized[0] if normalized else "unknown food"))


def fetch_huggingface_food_labels(image_bytes: bytes) -> tuple[list[str], Optional[str]]:
    if not HUGGINGFACE_DNS_AVAILABLE and not HUGGINGFACE_LEGACY_DNS_AVAILABLE:
        return [], "HuggingFace hosts are unreachable in current network"
    if not HUGGINGFACE_FOOD_MODELS:
        return [], None
    endpoints = []
    if HUGGINGFACE_DNS_AVAILABLE:
        endpoints.append("https://router.huggingface.co/hf-inference/models/{model_name}")
    if HUGGINGFACE_LEGACY_DNS_AVAILABLE:
        endpoints.append("https://api-inference.huggingface.co/models/{model_name}")
    hf_token = get_huggingface_token()
    headers = {"Content-Type": "application/octet-stream"}
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token}"

    last_error = None
    for model_name in HUGGINGFACE_FOOD_MODELS:
        for endpoint_template in endpoints:
            endpoint = endpoint_template.format(model_name=model_name)
            try:
                response = requests.post(endpoint, headers=headers, data=image_bytes, timeout=20)
                if response.status_code == 503:
                    response = requests.post(endpoint, headers=headers, data=image_bytes, timeout=30)
                if response.status_code == 401 and not hf_token:
                    last_error = "HuggingFace token is required for this endpoint"
                    continue
                if response.status_code >= 400:
                    last_error = f"HuggingFace HTTP {response.status_code}: {response_error_text(response)}"
                    continue
                payload = response.json()
                if isinstance(payload, dict) and payload.get("error"):
                    last_error = f"HuggingFace error: {payload.get('error')}"
                    continue
                if not isinstance(payload, list):
                    last_error = "HuggingFace returned unexpected payload"
                    continue
                labels = unique_labels([item.get("label", "") for item in payload if isinstance(item, dict)])
                if labels:
                    return labels, None
            except requests.RequestException as exc:
                last_error = f"HuggingFace failed ({exc.__class__.__name__})"
    return [], last_error


def fetch_openai_food_insights(image_bytes: bytes) -> tuple[list[str], Optional[float], Optional[str]]:
    if not OPENAI_API_KEY:
        return [], None, None
    try:
        image_data_url = f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode('utf-8')}"
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": OPENAI_VISION_MODEL,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You identify food from photos. Return only JSON with keys: "
                            "foodName (string), alternatives (array of strings), estimatedGrams (number)."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Analyze the meal photo and estimate portion grams."},
                            {"type": "image_url", "image_url": {"url": image_data_url, "detail": "low"}},
                        ],
                    },
                ],
            },
            timeout=20,
        )
        if response.status_code >= 400:
            return [], None, f"OpenAI Vision HTTP {response.status_code}: {response_error_text(response)}"
        payload = response.json()
        content = payload.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        if not isinstance(content, str):
            return [], None, "OpenAI Vision returned invalid response content"
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            return [], None, "OpenAI Vision returned non-object JSON"
        food_name = normalize_label(parsed.get("foodName", ""))
        alternatives = parsed.get("alternatives", [])
        if not isinstance(alternatives, list):
            alternatives = []
        labels = unique_labels([food_name, *[str(item) for item in alternatives]])
        grams = safe_number(parsed.get("estimatedGrams"))
        return labels, (grams if grams > 0 else None), None
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        return [], None, f"OpenAI Vision failed ({exc.__class__.__name__})"


def fetch_clarifai_labels(image_bytes: bytes) -> tuple[list[str], Optional[str]]:
    if not CLARIFAI_PAT:
        return [], None
    try:
        payload = {
            "user_app_id": {"user_id": CLARIFAI_USER_ID, "app_id": CLARIFAI_APP_ID},
            "inputs": [{"data": {"image": {"base64": base64.b64encode(image_bytes).decode("utf-8")}}}],
        }
        response = requests.post(
            f"https://api.clarifai.com/v2/models/{CLARIFAI_MODEL_ID}/outputs",
            headers={
                "Authorization": f"Key {CLARIFAI_PAT}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        if response.status_code >= 400:
            return [], f"Clarifai HTTP {response.status_code}: {response_error_text(response)}"
        outputs = response.json().get("outputs", [])
        if not outputs:
            return [], "Clarifai returned no outputs"
        concepts = outputs[0].get("data", {}).get("concepts", [])
        labels = unique_labels([concept.get("name", "") for concept in concepts[:5]])
        if labels:
            return labels, None
        return [], "Clarifai returned empty labels"
    except requests.RequestException as exc:
        return [], f"Clarifai failed ({exc.__class__.__name__})"


def fetch_openfoodfacts_food(query: str) -> Optional[FoodResult]:
    try:
        response = requests.get(
            "https://world.openfoodfacts.org/cgi/search.pl",
            params={"search_terms": query, "search_simple": 1, "json": 1, "page_size": 1},
            timeout=8,
        )
        response.raise_for_status()
        products = response.json().get("products", [])
        if not products:
            return None
        product = products[0]
        nutriments = product.get("nutriments", {})
        calories = float(nutriments.get("energy-kcal_100g", 0) or 0)
        protein = float(nutriments.get("proteins_100g", 0) or 0)
        fat = float(nutriments.get("fat_100g", 0) or 0)
        carbs = float(nutriments.get("carbohydrates_100g", 0) or 0)
        if calories <= 0:
            return None
        product_name = product.get("product_name") or query
        if not is_query_match(query, product_name):
            return None
        return FoodResult(
            name=product_name,
            grams=100.0,
            calories=calories,
            protein=protein,
            fat=fat,
            carbs=carbs,
            source="OpenFoodFacts",
        )
    except requests.RequestException:
        return None


def extract_usda_nutrients(food_item: dict) -> Optional[FoodResult]:
    nutrients = food_item.get("foodNutrients", [])
    by_name = {}
    for nutrient in nutrients:
        name = (nutrient.get("nutrientName") or "").lower()
        value = nutrient.get("value")
        if isinstance(value, (int, float)):
            by_name[name] = float(value)

    grams = 100.0
    calories = by_name.get("energy", by_name.get("energy (kcal)", 0.0))
    protein = by_name.get("protein", 0.0)
    fat = by_name.get("total lipid (fat)", by_name.get("fatty acids, total saturated", 0.0))
    carbs = by_name.get("carbohydrate, by difference", 0.0)

    if calories <= 0:
        return None

    return FoodResult(
        name=food_item.get("description", "Unknown food"),
        grams=grams,
        calories=calories,
        protein=protein,
        fat=fat,
        carbs=carbs,
        source="USDA",
    )


def fetch_usda_food(query: str) -> Optional[FoodResult]:
    if not USDA_API_KEY:
        return None
    try:
        response = requests.post(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={"api_key": USDA_API_KEY},
            json={"query": query, "pageSize": 1},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
        foods = data.get("foods", [])
        if not foods:
            return None
        result = extract_usda_nutrients(foods[0])
        if not result:
            return None
        if not is_query_match(query, result.name):
            return None
        return result
    except requests.RequestException:
        return None


def fetch_edamam_food(query: str, grams: float) -> Optional[FoodResult]:
    if not EDAMAM_APP_ID or not EDAMAM_APP_KEY:
        return None
    portion_grams = max(1.0, float(grams or 100))
    try:
        response = requests.post(
            "https://api.edamam.com/api/food-database/v2/nutrients",
            params={"app_id": EDAMAM_APP_ID, "app_key": EDAMAM_APP_KEY},
            json={"ingredients": [f"{round(portion_grams, 1)} g {query}"]},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        calories = safe_number(payload.get("calories"))
        if calories <= 0:
            return None
        nutrients = payload.get("totalNutrients", {})
        protein = safe_number((nutrients.get("PROCNT") or {}).get("quantity"))
        fat = safe_number((nutrients.get("FAT") or {}).get("quantity"))
        carbs = safe_number((nutrients.get("CHOCDF") or {}).get("quantity"))
        actual_grams = safe_number(payload.get("totalWeight")) or portion_grams
        return FoodResult(
            name=query,
            grams=max(actual_grams, 1.0),
            calories=calories,
            protein=protein,
            fat=fat,
            carbs=carbs,
            source="Edamam",
        )
    except requests.RequestException:
        return None


def fetch_fatsecret_token() -> Optional[str]:
    if not FATSECRET_CLIENT_ID or not FATSECRET_CLIENT_SECRET:
        return None
    try:
        response = requests.post(
            "https://oauth.fatsecret.com/connect/token",
            data={"grant_type": "client_credentials", "scope": "basic"},
            auth=(FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET),
            timeout=8,
        )
        response.raise_for_status()
        return response.json().get("access_token")
    except requests.RequestException:
        return None


def parse_float(value: str) -> float:
    try:
        return float(str(value).replace(",", "."))
    except (ValueError, TypeError):
        return 0.0


def clamp_number(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def normalize_goal_mode(value: str) -> str:
    candidate = (value or "").strip().lower()
    return candidate if candidate in ALLOWED_GOAL_MODES else DEFAULT_USER_PROFILE["goalMode"]


def normalize_sex(value: str) -> str:
    candidate = (value or "").strip().lower()
    return candidate if candidate in ALLOWED_SEX_VALUES else DEFAULT_USER_PROFILE["sex"]


def normalize_profile_payload(payload: dict, current: Optional[dict] = None) -> dict:
    base = dict(DEFAULT_USER_PROFILE)
    if current:
        base.update(current)
    sex = normalize_sex(str(payload.get("sex", base["sex"])))
    goal_mode = normalize_goal_mode(str(payload.get("goalMode", base["goalMode"])))
    height_cm = clamp_number(parse_float(payload.get("heightCm", base["heightCm"])), 120.0, 230.0)
    weight_kg = clamp_number(parse_float(payload.get("weightKg", base["weightKg"])), 35.0, 250.0)
    age_years = int(clamp_number(parse_float(payload.get("ageYears", base["ageYears"])), 14.0, 100.0))
    return {
        "sex": sex,
        "heightCm": round(height_cm, 1),
        "weightKg": round(weight_kg, 1),
        "ageYears": age_years,
        "goalMode": goal_mode,
    }


def db_row_to_profile(row: Optional[sqlite3.Row]) -> dict:
    if not row:
        return dict(DEFAULT_USER_PROFILE)
    raw = {
        "sex": row["sex"],
        "heightCm": row["height_cm"],
        "weightKg": row["weight_kg"],
        "ageYears": row["age_years"],
        "goalMode": row["goal_mode"],
    }
    return normalize_profile_payload(raw)


def estimate_target_calories(profile: dict) -> float:
    weight = clamp_number(parse_float(profile.get("weightKg")), 35.0, 250.0)
    height = clamp_number(parse_float(profile.get("heightCm")), 120.0, 230.0)
    age = clamp_number(parse_float(profile.get("ageYears")), 14.0, 100.0)
    sex = normalize_sex(str(profile.get("sex")))
    goal_mode = normalize_goal_mode(str(profile.get("goalMode")))
    sex_adjustment = 5.0 if sex == "male" else -161.0
    bmr = (10.0 * weight) + (6.25 * height) - (5.0 * age) + sex_adjustment
    maintenance = max(1200.0, bmr * 1.35)
    adjustment = {"loss": -350.0, "maintain": 0.0, "gain": 300.0}[goal_mode]
    return round(max(1200.0, maintenance + adjustment), 1)


def parse_serving_description(serving_description: str) -> float:
    lower = (serving_description or "").lower()
    if " g" in lower:
        token = lower.split(" g", 1)[0].split()[-1]
        grams = parse_float(token)
        if grams > 0:
            return grams
    return 100.0


def fetch_fatsecret_food(query: str) -> Optional[FoodResult]:
    token = fetch_fatsecret_token()
    if not token:
        return None
    try:
        response = requests.get(
            "https://platform.fatsecret.com/rest/server.api",
            params={
                "method": "foods.search",
                "search_expression": query,
                "format": "json",
                "max_results": 1,
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=8,
        )
        response.raise_for_status()
        foods_data = response.json().get("foods", {}).get("food", [])
        if isinstance(foods_data, dict):
            foods_data = [foods_data]
        if not foods_data:
            return None

        first_food = foods_data[0]
        food_id = first_food.get("food_id")
        if not food_id:
            return None

        detail = requests.get(
            "https://platform.fatsecret.com/rest/server.api",
            params={"method": "food.get", "food_id": food_id, "format": "json"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=8,
        )
        detail.raise_for_status()
        servings = detail.json().get("food", {}).get("servings", {}).get("serving", [])
        if isinstance(servings, dict):
            servings = [servings]
        if not servings:
            return None

        serving = servings[0]
        grams = parse_serving_description(serving.get("serving_description", ""))
        food_name = first_food.get("food_name", query)
        if not is_query_match(query, food_name):
            return None
        return FoodResult(
            name=food_name,
            grams=grams,
            calories=parse_float(serving.get("calories")),
            protein=parse_float(serving.get("protein")),
            fat=parse_float(serving.get("fat")),
            carbs=parse_float(serving.get("carbohydrate")),
            source="FatSecret",
        )
    except requests.RequestException:
        return None


def fallback_food(query: str) -> FoodResult:
    key = query.lower().strip()
    for alias, values in DEFAULT_CALORIES_BY_LABEL.items():
        if alias in key:
            name, calories, protein, fat, carbs = values
            return FoodResult(name=name, grams=100.0, calories=calories, protein=protein, fat=fat, carbs=carbs, source="Fallback")
    return FoodResult(name=query or "Unknown food", grams=100.0, calories=220, protein=10, fat=8, carbs=25, source="Fallback")


def lookup_food_without_fallback(query: str, grams_hint: float = 100.0) -> Optional[FoodResult]:
    edamam = fetch_edamam_food(query, grams_hint)
    if edamam:
        return edamam

    usda = fetch_usda_food(query)
    if usda:
        return usda

    fatsecret = fetch_fatsecret_food(query)
    if fatsecret:
        return fatsecret

    off = fetch_openfoodfacts_food(query)
    if off:
        return off

    local_match = search_local_food_library(query)
    if local_match:
        return local_match

    return None


def lookup_food(query: str, grams_hint: float = 100.0) -> FoodResult:
    matched = lookup_food_without_fallback(query, grams_hint)
    if matched:
        return matched
    return fallback_food(query)


def apply_gram_multiplier(food: FoodResult, grams: float) -> FoodResult:
    grams = max(1.0, float(grams))
    multiplier = grams / max(food.grams, 1.0)
    return FoodResult(
        name=food.name,
        grams=grams,
        calories=food.calories * multiplier,
        protein=food.protein * multiplier,
        fat=food.fat * multiplier,
        carbs=food.carbs * multiplier,
        source=food.source,
    )


def create_app() -> Flask:
    app = Flask(__name__, static_folder=".", static_url_path="")
    app.secret_key = os.getenv("APP_SECRET_KEY", "dev-only-secret-change-me")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    init_db()

    @app.get("/")
    def root():
        return app.send_static_file("index.html")

    @app.post("/api/auth/register")
    def register():
        payload = request.get_json(silent=True) or {}
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        if "@" not in email or len(password) < 6:
            return jsonify({"error": "Некоректний email або пароль (мінімум 6 символів)"}), 400

        conn = db_connect()
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO users(email, password_hash, created_at) VALUES(?,?,?)",
                (email, hash_password(password), dt.datetime.utcnow().isoformat()),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "Користувач з таким email вже існує"}), 409

        user_id = cur.lastrowid
        conn.close()
        session["user_id"] = user_id
        return jsonify({"id": user_id, "email": email})

    @app.post("/api/auth/login")
    def login():
        payload = request.get_json(silent=True) or {}
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        conn = db_connect()
        row = conn.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()

        if not row or not verify_password(password, row["password_hash"]):
            return jsonify({"error": "Невірний email або пароль"}), 401

        session["user_id"] = int(row["id"])
        return jsonify({"id": int(row["id"]), "email": row["email"]})

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify({"ok": True})

    @app.get("/api/auth/me")
    def me():
        user_id = current_user_id()
        if not user_id:
            return jsonify({"authenticated": False})
        conn = db_connect()
        user = conn.execute("SELECT id, email, sex, height_cm, weight_kg, age_years, goal_mode FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        if not user:
            session.clear()
            return jsonify({"authenticated": False})
        profile = db_row_to_profile(user)
        return jsonify(
            {
                "authenticated": True,
                "user": {"id": int(user["id"]), "email": user["email"]},
                "profile": profile,
                "calorieTarget": estimate_target_calories(profile),
            }
        )

    @app.get("/api/profile")
    def get_profile():
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error
        conn = db_connect()
        row = conn.execute(
            "SELECT sex, height_cm, weight_kg, age_years, goal_mode FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        conn.close()
        profile = db_row_to_profile(row)
        return jsonify({"profile": profile, "calorieTarget": estimate_target_calories(profile)})

    @app.put("/api/profile")
    def update_profile():
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error
        payload = request.get_json(silent=True) or {}
        conn = db_connect()
        current_row = conn.execute(
            "SELECT sex, height_cm, weight_kg, age_years, goal_mode FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        current_profile = db_row_to_profile(current_row)
        profile = normalize_profile_payload(payload, current=current_profile)
        conn.execute(
            """
            UPDATE users
            SET sex = ?, height_cm = ?, weight_kg = ?, age_years = ?, goal_mode = ?
            WHERE id = ?
            """,
            (
                profile["sex"],
                profile["heightCm"],
                profile["weightKg"],
                profile["ageYears"],
                profile["goalMode"],
                user_id,
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({"profile": profile, "calorieTarget": estimate_target_calories(profile)})

    @app.get("/api/meta")
    def meta():
        return jsonify(
            {
                "databasePath": DB_PATH,
                "authProviders": {
                    "firebaseConfigured": bool(FIREBASE_PROJECT_ID),
                    "localPasswordAuth": True,
                },
                "recognitionProviders": {
                    "huggingFaceConfigured": True,
                    "huggingFaceDnsResolved": HUGGINGFACE_DNS_AVAILABLE,
                    "huggingFaceLegacyDnsResolved": HUGGINGFACE_LEGACY_DNS_AVAILABLE,
                    "huggingFaceTokenConfigured": bool(get_huggingface_token()),
                    "openAIVisionConfigured": bool(OPENAI_API_KEY),
                    "clarifaiConfigured": bool(CLARIFAI_PAT),
                    "fallbackMobileNet": True,
                    "priorityOrder": [
                        "HuggingFace food model (free)",
                        "OpenAI Vision",
                        "Clarifai food model",
                        "MobileNet fallback",
                    ],
                },
                "nutritionProviders": {
                    "edamamConfigured": bool(EDAMAM_APP_ID and EDAMAM_APP_KEY),
                    "usdaConfigured": bool(USDA_API_KEY),
                    "fatSecretConfigured": bool(FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET),
                    "openFoodFactsConfigured": True,
                },
            }
        )

    @app.post("/api/auth/firebase")
    def firebase_auth():
        payload = request.get_json(silent=True) or {}
        id_token_raw = payload.get("idToken", "")
        token_info = verify_firebase_token(id_token_raw)
        if not token_info:
            return jsonify(
                {
                    "error": "Firebase токен не валідний або FIREBASE_PROJECT_ID не налаштований на сервері."
                }
            ), 401

        firebase_uid = token_info.get("uid")
        if not firebase_uid:
            return jsonify({"error": "Firebase UID відсутній у токені."}), 401

        email = (token_info.get("email") or f"{firebase_uid}@firebase.local").strip().lower()
        user_id, user_email = upsert_firebase_user(firebase_uid, email)
        session["user_id"] = user_id
        return jsonify({"id": user_id, "email": user_email, "firebaseUid": firebase_uid})

    @app.post("/api/food/recognize")
    def recognize_food():
        payload = request.get_json(silent=True) or {}
        fallback_label = normalize_label(payload.get("fallbackLabel", ""))
        fallback_candidates_raw = payload.get("fallbackCandidates", [])
        fallback_candidates = (
            [normalize_label(item) for item in fallback_candidates_raw if isinstance(item, str)]
            if isinstance(fallback_candidates_raw, list)
            else []
        )
        image_data = payload.get("imageData", "")
        labels = []
        provider = "MobileNet fallback"
        diagnostics = ""
        estimated_grams = None
        hf_error = None
        openai_error = None
        clarifai_error = None

        image_bytes = extract_image_bytes(image_data)
        if image_bytes:
            labels, hf_error = fetch_huggingface_food_labels(image_bytes)
            if labels:
                provider = "HuggingFace food model"
                estimated_grams = estimate_portion_grams(labels[0])
            else:
                labels, estimated_grams, openai_error = fetch_openai_food_insights(image_bytes)
                if labels:
                    provider = "OpenAI Vision"
                else:
                    labels, clarifai_error = fetch_clarifai_labels(image_bytes)
                    if labels:
                        provider = "Clarifai food model"
                        estimated_grams = estimate_portion_grams(labels[0])
                    else:
                        all_errors = [hf_error, openai_error, clarifai_error]
                        diagnostics = " | ".join([err for err in all_errors if err]) or ""

        if not labels and fallback_label:
            selected_fallback = choose_best_fallback_candidate(fallback_candidates, fallback_label)
            labels = [selected_fallback]
            estimated_grams = estimate_portion_grams(selected_fallback)

        if not labels:
            labels = ["unknown food"]
            estimated_grams = estimate_portion_grams("unknown")

        if provider != "MobileNet fallback":
            diagnostics = ""

        return jsonify(
            {
                "labels": labels,
                "provider": provider,
                "providerDiagnostics": diagnostics,
                "estimatedGrams": round(estimated_grams, 1) if estimated_grams else None,
            }
        )

    @app.post("/api/food/estimate")
    def estimate_food():
        user_id = current_user_id()
        payload = request.get_json(silent=True) or {}
        query = (payload.get("query") or "").strip()
        grams = max(1.0, parse_float(payload.get("grams") or 100))
        strict_search = bool(payload.get("strictSearch"))
        if not query:
            return jsonify({"error": "Не вказано назву/опис страви"}), 400

        if strict_search:
            food = lookup_food_without_fallback(query, grams)
            if not food:
                return jsonify({"error": "Страву не знайдено у базах даних. Уточніть назву."}), 404
        else:
            food = lookup_food(query, grams)
        estimate = apply_gram_multiplier(food, grams)
        return jsonify(
            {
                "query": query,
                "foodName": estimate.name,
                "grams": round(estimate.grams, 1),
                "calories": round(estimate.calories, 1),
                "protein": round(estimate.protein, 1),
                "fat": round(estimate.fat, 1),
                "carbs": round(estimate.carbs, 1),
                "source": estimate.source,
                "userId": user_id,
                "guestMode": not bool(user_id),
            }
        )

    @app.get("/api/food/search")
    def search_food():
        query = (request.args.get("q") or "").strip()
        try:
            limit = int(request.args.get("limit", "8"))
        except ValueError:
            limit = 8
        limit = max(1, min(20, limit))
        return jsonify({"query": query, "suggestions": search_food_suggestions(query, limit)})

    @app.post("/api/diary/entries")
    def create_entry():
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error

        payload = request.get_json(silent=True) or {}
        food_name = (payload.get("foodName") or "").strip()
        grams = parse_float(payload.get("grams") or 0)
        calories = parse_float(payload.get("calories") or 0)
        protein = parse_float(payload.get("protein") or 0)
        fat = parse_float(payload.get("fat") or 0)
        carbs = parse_float(payload.get("carbs") or 0)
        source = (payload.get("source") or "Unknown").strip() or "Unknown"
        date_key = (payload.get("dateKey") or dt.date.today().isoformat()).strip()

        if not food_name or grams <= 0:
            return jsonify({"error": "Некоректні дані запису"}), 400

        created_at = dt.datetime.utcnow().isoformat()
        conn = db_connect()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO diary_entries(
                user_id, food_name, grams, calories, protein, fat, carbs, source, created_at, date_key
            )
            VALUES(?,?,?,?,?,?,?,?,?,?)
            """,
            (user_id, food_name, grams, calories, protein, fat, carbs, source, created_at, date_key),
        )
        conn.commit()
        entry_id = cur.lastrowid
        conn.close()
        return jsonify({"id": entry_id, "createdAt": created_at})

    @app.get("/api/diary/day")
    def get_day():
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error

        date_key = (request.args.get("date") or dt.date.today().isoformat()).strip()
        conn = db_connect()
        rows = conn.execute(
            """
            SELECT id, food_name, grams, calories, protein, fat, carbs, source, created_at, date_key
            FROM diary_entries
            WHERE user_id = ? AND date_key = ?
            ORDER BY created_at DESC
            """,
            (user_id, date_key),
        ).fetchall()
        conn.close()

        entries = [
            {
                "id": int(r["id"]),
                "foodName": r["food_name"],
                "grams": r["grams"],
                "calories": r["calories"],
                "protein": r["protein"],
                "fat": r["fat"],
                "carbs": r["carbs"],
                "source": r["source"],
                "createdAt": r["created_at"],
                "dateKey": r["date_key"],
            }
            for r in rows
        ]
        totals = {
            "calories": round(sum(e["calories"] for e in entries), 1),
            "protein": round(sum(e["protein"] for e in entries), 1),
            "fat": round(sum(e["fat"] for e in entries), 1),
            "carbs": round(sum(e["carbs"] for e in entries), 1),
        }
        return jsonify({"date": date_key, "entries": entries, "totals": totals})

    @app.get("/api/diary/history")
    def get_history():
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error

        days = int(request.args.get("days", "30"))
        days = min(max(days, 1), 365)
        today = dt.date.today()
        start = today - dt.timedelta(days=days - 1)

        conn = db_connect()
        rows = conn.execute(
            """
            SELECT date_key, SUM(calories) AS calories
            FROM diary_entries
            WHERE user_id = ? AND date_key BETWEEN ? AND ?
            GROUP BY date_key
            ORDER BY date_key DESC
            """,
            (user_id, start.isoformat(), today.isoformat()),
        ).fetchall()
        conn.close()

        by_date = {r["date_key"]: float(r["calories"] or 0) for r in rows}
        result = []
        week_values = []
        for i in range(days):
            current = start + dt.timedelta(days=i)
            key = current.isoformat()
            cals = round(by_date.get(key, 0.0), 1)
            result.append({"date": key, "calories": cals})
            if current >= today - dt.timedelta(days=6):
                week_values.append(cals)

        week_average = round(sum(week_values) / len(week_values), 1) if week_values else 0.0
        return jsonify({"days": result, "weeklyAverageCalories": week_average})

    @app.delete("/api/diary/entries/<int:entry_id>")
    def delete_entry(entry_id: int):
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error

        conn = db_connect()
        cur = conn.cursor()
        cur.execute("DELETE FROM diary_entries WHERE id = ? AND user_id = ?", (entry_id, user_id))
        conn.commit()
        deleted = cur.rowcount
        conn.close()
        if deleted == 0:
            return jsonify({"error": "Запис не знайдено"}), 404
        return jsonify({"ok": True})

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4173, debug=True)
