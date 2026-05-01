import datetime as dt
import hashlib
import os
import secrets
import sqlite3
from dataclasses import dataclass
from typing import Optional

import requests
from flask import Flask, jsonify, request, session


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "myfitnesspal.db")

USDA_API_KEY = os.getenv("USDA_API_KEY", "").strip()
FATSECRET_CLIENT_ID = os.getenv("FATSECRET_CLIENT_ID", "").strip()
FATSECRET_CLIENT_SECRET = os.getenv("FATSECRET_CLIENT_SECRET", "").strip()

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
            created_at TEXT NOT NULL
        )
        """
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


@dataclass
class FoodResult:
    name: str
    grams: float
    calories: float
    protein: float
    fat: float
    carbs: float
    source: str


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
        return extract_usda_nutrients(foods[0])
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
        return FoodResult(
            name=first_food.get("food_name", query),
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


def lookup_food(query: str) -> FoodResult:
    usda = fetch_usda_food(query)
    if usda:
        return usda

    fatsecret = fetch_fatsecret_food(query)
    if fatsecret:
        return fatsecret

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
        user = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        if not user:
            session.clear()
            return jsonify({"authenticated": False})
        return jsonify({"authenticated": True, "user": {"id": int(user["id"]), "email": user["email"]}})

    @app.post("/api/food/estimate")
    def estimate_food():
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error

        payload = request.get_json(silent=True) or {}
        query = (payload.get("query") or "").strip()
        grams = float(payload.get("grams") or 100)
        if not query:
            return jsonify({"error": "Не вказано назву/опис страви"}), 400

        food = lookup_food(query)
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
            }
        )

    @app.post("/api/diary/entries")
    def create_entry():
        user_id, auth_error = auth_required()
        if auth_error:
            return auth_error

        payload = request.get_json(silent=True) or {}
        food_name = (payload.get("foodName") or "").strip()
        grams = float(payload.get("grams") or 0)
        calories = float(payload.get("calories") or 0)
        protein = float(payload.get("protein") or 0)
        fat = float(payload.get("fat") or 0)
        carbs = float(payload.get("carbs") or 0)
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
