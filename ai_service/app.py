from flask import Flask, request, jsonify
import traceback
import re

import dietdash_engine as engine

app = Flask(__name__)

# Load dataset once when server starts (faster)
DF = None

# --- Strict filters (to avoid non-veg + unrealistic items) ---
NON_VEG_WORDS = [
    r"\bchicken\b", r"\bmutton\b", r"\bbeef\b", r"\bpork\b", r"\bham\b",
    r"\bfish\b", r"\btuna\b", r"\bsalmon\b", r"\bshrimp\b", r"\bprawn\b",
    r"\bcrab\b", r"\begg\b", r"\bgelatin\b",
    r"\bbone\b", r"\bbroth\b", r"\bbonito\b", r"\bdashi\b"
]

UNREALISTIC_WORDS = [
    r"\bwhey\b", r"\bprotein\b", r"\bpost[- ]?workout\b", r"\bsupplement\b",
    r"\bpowder\b", r"\bconcentrate\b", r"\bisolate\b", r"\bshake\b",
    r"\bgluten\b", r"\bvinegar\b", r"\bstock\b", r"\bbase\b"
]

def _contains_any(text: str, patterns) -> bool:
    if not text:
        return False
    t = text.lower()
    return any(re.search(p, t) for p in patterns)

def ensure_df_loaded():
    global DF
    if DF is None:
        df = engine.load_data()
        df = engine.add_diet_tags(df)
        df = engine.meal_realism_filter(df)  # your existing filter
        DF = df
    return DF

@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "dietdash-ai"})

@app.post("/recommend")
def recommend_api():
    """
    Expected JSON (example):
    {
      "goal": "Weight Loss",
      "diet": "Veg",
      "age": 21,
      "gender": "female",
      "height_cm": 160,
      "weight_kg": 58,
      "activity": "light",
      "meals_per_day": 3,
      "top_n": 10,

      // optional:
      "daily_calories": 1600,

      // optional:
      "strict_diet": true
    }
    """
    try:
        data = request.get_json(force=True) or {}

        goal = str(data.get("goal", "Weight Loss"))
        diet = str(data.get("diet", "Veg"))
        top_n = int(data.get("top_n", 10))
        meals_per_day = int(data.get("meals_per_day", 3))
        strict_diet = bool(data.get("strict_diet", True))  # default ON

        # normalize diet values coming from website
        diet_norm = diet.strip().lower()
        if diet_norm in ["vegetarian", "veg", "pure veg"]:
            diet = "Veg"
        elif diet_norm in ["nonveg", "non-veg", "non veg"]:
            diet = "Non-Veg"
        elif diet_norm in ["vegan"]:
            diet = "Vegan"

        # --- Target calories logic ---
        if "daily_calories" in data and data["daily_calories"] is not None:
            daily_cals = int(float(data["daily_calories"]))
        else:
            age = int(data.get("age", 21))
            gender = str(data.get("gender", "female"))
            height_cm = float(data.get("height_cm", 160))
            weight_kg = float(data.get("weight_kg", 60))
            activity = str(data.get("activity", "light"))

            user = engine.UserProfile(
                age=age,
                gender=gender,
                height_cm=height_cm,
                weight_kg=weight_kg,
                activity=activity,
                goal=goal,
                diet=diet,
            )
            daily_cals = engine.daily_calorie_target(user)

        target_cal = engine.per_meal_target(daily_cals, meals_per_day=meals_per_day)

        df = ensure_df_loaded()

        # ✅ STRICT FILTER BEFORE RECOMMEND
        # Works even if engine tags are imperfect, because we filter by description keywords.
        if strict_diet and diet == "Veg":
            if "description" in df.columns:
                df = df[~df["description"].fillna("").apply(lambda x: _contains_any(str(x), NON_VEG_WORDS))]
        if strict_diet:
            if "description" in df.columns:
                df = df[~df["description"].fillna("").apply(lambda x: _contains_any(str(x), UNREALISTIC_WORDS))]

        out_df = engine.recommend(df, goal=goal, diet=diet, target_cal=target_cal, top_n=top_n)

        # Convert dataframe to JSON
        results = out_df.to_dict(orient="records")

        return jsonify({
            "status": "success",
            "goal": goal,
            "diet": diet,
            "daily_calories": int(daily_cals),
            "per_meal_target": int(target_cal),
            "top_n": top_n,
            "strict_diet": strict_diet,
            "recommendations": results
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "trace": traceback.format_exc()
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)