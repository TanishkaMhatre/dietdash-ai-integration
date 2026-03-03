"""
DietDash AI Engine (V14.3)
- Strong Veg/Vegan/Non-Veg detection (better food intelligence)
- Goal-based macro scoring (protein/calorie, fat weighting, carb bias)
- Personalized calories using BMI + Mifflin-St Jeor BMR + activity + goal deficit/surplus
- Strong meal realism filter (removes powders, boosters, supplements, seasonings, etc.)
- Prioritizes restaurant dataset (restaurant_menu.csv) if available
"""

from __future__ import annotations
import os
import math
import re
from dataclasses import dataclass
from typing import Dict, Tuple

import pandas as pd

VERSION = "V14.3"

# Default fallback dataset (your current file)
DATA_PATH = "nutrition_master_macros.csv"

# OPTIONAL: restaurant dishes dataset (recommended for your final project)
# Create this file later from admin module exports
RESTAURANT_DATA_PATH = "restaurant_menu.csv"

TOP_N = 10


# -----------------------------
# User Profile + Calorie Logic
# -----------------------------
@dataclass
class UserProfile:
    age: int
    gender: str  # "male" / "female"
    height_cm: float
    weight_kg: float
    activity: str  # "sedentary" / "light" / "moderate" / "active"
    goal: str  # "Weight Loss" / "Maintenance" / "Weight Gain"
    diet: str  # "Veg" / "Vegan" / "Non-Veg"

def bmi(weight_kg: float, height_cm: float) -> float:
    h_m = height_cm / 100.0
    return weight_kg / (h_m * h_m)

def bmr_mifflin_st_jeor(age: int, gender: str, height_cm: float, weight_kg: float) -> float:
    # Mifflin-St Jeor
    g = gender.strip().lower()
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if g == "male":
        return base + 5
    return base - 161

def activity_multiplier(activity: str) -> float:
    a = activity.strip().lower()
    return {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725
    }.get(a, 1.2)

def daily_calorie_target(user: UserProfile) -> int:
    bmr = bmr_mifflin_st_jeor(user.age, user.gender, user.height_cm, user.weight_kg)
    tdee = bmr * activity_multiplier(user.activity)

    goal = user.goal.strip().lower()
    if goal == "weight loss":
        # Safe deficit
        tdee -= 400
    elif goal == "weight gain":
        tdee += 350

    # Safety clamp
    tdee = max(1200, min(tdee, 3500))
    return int(round(tdee))

def per_meal_target(daily_cals: int, meals_per_day: int = 3) -> int:
    return int(round(daily_cals / meals_per_day))


# -----------------------------
# Data Loading + Cleaning
# -----------------------------
def load_data() -> pd.DataFrame:
    # Prefer restaurant dataset if exists (THIS is what your app should use)
    if os.path.exists(RESTAURANT_DATA_PATH):
        path = RESTAURANT_DATA_PATH
    else:
        path = DATA_PATH

    print(f"[{VERSION}] Loading: {path}")

    df = pd.read_csv(path, low_memory=False)

    # Standardize expected columns
    # Your restaurant dataset should also include these columns:
    # description, calories, protein, fat, carbs
    rename_map = {}
    for c in df.columns:
        lc = c.strip().lower()
        if lc in ("name", "dish_name", "item_name"):
            rename_map[c] = "description"
        elif lc in ("kcal", "cal", "energy"):
            rename_map[c] = "calories"
        elif lc in ("prot", "proteins"):
            rename_map[c] = "protein"
    if rename_map:
        df = df.rename(columns=rename_map)

    need = ["description", "calories", "protein", "fat", "carbs"]
    missing = [c for c in need if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset missing required columns: {missing}")

    # Keep only needed columns for speed
    df = df[need].copy()

    # Clean types
    df["description"] = df["description"].astype(str)
    for c in ["calories", "protein", "fat", "carbs"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Drop bad rows
    df = df.dropna(subset=["calories", "protein", "fat", "carbs"])
    df = df[(df["calories"] > 0) & (df["calories"] < 2000)]  # remove extreme junk
    df = df.reset_index(drop=True)

    # Create normalized text field
    df["text"] = df["description"].str.lower()

    return df


# -----------------------------
# Strong Diet Detection
# -----------------------------
def add_diet_tags(df: pd.DataFrame) -> pd.DataFrame:
    t = df["text"]

    # Non-veg signals (animal meat/seafood)
    animal_terms = [
        "chicken","hen","egg","mutton","goat","lamb","beef","pork","bacon","ham","sausage",
        "fish","tuna","salmon","prawn","shrimp","crab","lobster","clam","oyster","squid",
        "gelatin","collagen","anchovy"
    ]
    animal_re = r"\b(?:%s)\b" % "|".join(map(re.escape, animal_terms))

    # Dairy terms (veg allowed, vegan not allowed)
    dairy_terms = [
        "milk","cheese","butter","ghee","curd","yogurt","paneer","cream","whey","casein"
    ]
    dairy_re = r"\b(?:%s)\b" % "|".join(map(re.escape, dairy_terms))

    # Vegan positive signals (explicit)
    vegan_pos_terms = ["vegan", "plant-based", "plant based", "dairy-free", "dairy free", "egg-free", "egg free"]
    vegan_pos_re = r"\b(?:%s)\b" % "|".join(map(re.escape, vegan_pos_terms))

    # Honey (not vegan)
    honey_re = r"\b(?:honey)\b"

    has_animal = t.str.contains(animal_re, na=False, regex=True)
    has_dairy = t.str.contains(dairy_re, na=False, regex=True)
    has_honey = t.str.contains(honey_re, na=False, regex=True)
    has_vegan_signal = t.str.contains(vegan_pos_re, na=False, regex=True)

    # Classification rules:
    # - Vegan: no animal, no dairy, no honey AND either explicitly vegan OR looks plant-based
    # - Non-veg: animal present
    # - Veg: default else (includes dairy)
    df["is_nonveg"] = has_animal
    df["is_vegan"] = (~has_animal) & (~has_dairy) & (~has_honey) & (has_vegan_signal | ~t.str.contains(r"\b(?:gelatin|collagen)\b", na=False, regex=True))
    df["is_veg"] = (~df["is_nonveg"]) & (~df["is_vegan"])  # veg includes dairy items

    return df


# -----------------------------
# Meal Realism Filter (CRITICAL)
# -----------------------------
def meal_realism_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Removes:
    - protein boosters, powders, supplements, seasonings, syrups, oils, raw ingredients, beverage mixes
    because your app is meal/dish recommender.
    """
    t = df["text"]

    # Hard remove patterns
    ban_terms = [
        # supplements / powders / boosters
        "protein booster","booster","supplement","whey protein","protein powder","mass gainer",
        "collagen","gelatin",
        "enhancer","mix","shake mix","meal replacement",
        # seasonings / spices
        "seasoning","spice","masala powder","extract",
        # raw ingredients / not a dish
        "oil","vegetable oil","cooking oil",
        "flour","maida","atta","rice flour",
        "sugar","salt",
        # beverages / juices
        "juice drink","juice cocktail","soda","soft drink","energy drink",
    ]
    ban_re = r"\b(?:%s)\b" % "|".join(map(re.escape, ban_terms))

    keep = ~t.str.contains(ban_re, na=False, regex=True)

    # Also remove too-short generic items like "fillets", "burgers" without context
    too_generic = t.str.fullmatch(r"(?:fillets|burgers|kabobs|slices|deli slices|seasoning)", na=False)
    keep = keep & (~too_generic)

    # Keep typical meal-ish keywords (helps Indian)
    meal_keywords = [
        "dal","rajma","chole","khichdi","poha","upma","idli","dosa","uttapam","paratha","roti",
        "sabzi","paneer","biryani","pulao","thali","curry","tikka","masala","bhaji","sambar","rasam",
        "salad","soup","wrap","sandwich","bowl","rice","noodles","pasta"
    ]
    meal_re = r"\b(?:%s)\b" % "|".join(map(re.escape, meal_keywords))

    # If you are using USDA fallback, this helps force meal-like options
    if not os.path.exists(RESTAURANT_DATA_PATH):
        keep = keep & (t.str.contains(meal_re, na=False, regex=True) | (df["calories"] > 150))

    return df[keep].copy()


# -----------------------------
# Scoring (Goal-based macro bias)
# -----------------------------
def macro_ratios(row: pd.Series) -> Tuple[float, float, float]:
    cal = float(row["calories"])
    p = float(row["protein"])
    f = float(row["fat"])
    c = float(row["carbs"])

    # Convert grams -> kcal for macro distribution
    p_k = p * 4.0
    c_k = c * 4.0
    f_k = f * 9.0
    total = max(1.0, (p_k + c_k + f_k))

    return (p_k / total, f_k / total, c_k / total)

def score_row(row: pd.Series, goal: str, target_cal: float) -> float:
    cal = float(row["calories"])
    p = float(row["protein"])
    f = float(row["fat"])
    c = float(row["carbs"])

    # Protein density (very important for weight loss)
    protein_per_100cal = (p / max(cal, 1.0)) * 100.0

    # Calories closeness
    cal_penalty = abs(cal - target_cal) / max(target_cal, 1.0)  # 0 is best
    cal_score = 1.0 - min(1.0, cal_penalty)  # 0..1

    p_ratio, f_ratio, c_ratio = macro_ratios(row)

    g = goal.strip().lower()
    if g == "weight loss":
        # Want higher protein density, lower fat ratio
        macro_score = (p_ratio * 1.3) + (c_ratio * 0.2) - (f_ratio * 0.6)
        base = protein_per_100cal * 1.3 + macro_score * 25 + cal_score * 30
    elif g == "weight gain":
        # Want calorie-dense + decent protein + allow fats
        macro_score = (p_ratio * 0.8) + (f_ratio * 0.8) + (c_ratio * 0.4)
        base = (cal / max(target_cal, 1.0)) * 25 + (p * 0.4) + macro_score * 25 + cal_score * 10
    else:
        # Maintenance balanced
        macro_score = (p_ratio * 1.0) + (f_ratio * 0.4) + (c_ratio * 0.4)
        base = protein_per_100cal * 0.8 + macro_score * 25 + cal_score * 35

    return float(base)


# -----------------------------
# Recommendation Pipeline
# -----------------------------
def apply_diet_filter(df: pd.DataFrame, diet: str) -> pd.DataFrame:
    d = diet.strip().lower()
    if d == "vegan":
        return df[df["is_vegan"]].copy()
    if d == "veg":
        return df[df["is_veg"] | df["is_vegan"]].copy()  # veg users can eat vegan too
    # Non-veg can eat everything
    return df.copy()
# recommendations.head(10).to_csv("dietdash_output_top10.csv", index=False)
# print("Saved: dietdash_output_top10.csv")
def diversify_results(df: pd.DataFrame, top_n: int) -> pd.DataFrame:
    # group key: remove noise, keep first 3 words
    tmp = df.copy()
    tmp["key"] = (
        tmp["description"]
        .str.lower()
        .str.replace(r"[^a-z0-9 ]", " ", regex=True)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )
    tmp["group"] = tmp["key"].str.split().str[:3].str.join(" ")
    tmp = tmp.sort_values("score", ascending=False)

    seen = set()
    rows = []
    for _, r in tmp.iterrows():
        g = r["group"]
        if g in seen:
            continue
        rows.append(r)
        seen.add(g)
        if len(rows) >= top_n:
            break
    out = pd.DataFrame(rows)
    return out[["description", "calories", "protein", "fat", "carbs", "score", "group"]]

def recommend(df: pd.DataFrame, goal: str, diet: str, target_cal: int, top_n: int = 10) -> pd.DataFrame:
    d = apply_diet_filter(df, diet)
    if len(d) == 0:
        return pd.DataFrame(columns=["description","calories","protein","fat","carbs","score","group"])

    d = d.copy()
    d["score"] = d.apply(lambda r: score_row(r, goal, target_cal), axis=1)
    d = d.sort_values("score", ascending=False).head(300)  # shortlist
    return diversify_results(d, top_n)


# -----------------------------
# Main Demo Run
# -----------------------------
def main():
    # Demo user (later this comes from login form)
    user = UserProfile(
        age=21,
        gender="female",
        height_cm=158,
        weight_kg=56,
        activity="light",
        goal="Weight Loss",
        diet="Veg"
    )

    df = load_data()
    df = add_diet_tags(df)
    df = meal_realism_filter(df)

    user_bmi = bmi(user.weight_kg, user.height_cm)
    daily = daily_calorie_target(user)
    meal = per_meal_target(daily, meals_per_day=3)

    print(f"\nUser BMI: {user_bmi:.2f}")
    print(f"Daily Calories Target: {daily}")
    print(f"Per-meal Target Calories: {meal}")
    print(f"Goal: {user.goal} | Diet: {user.diet}")

    out = recommend(df, user.goal, user.diet, meal, top_n=TOP_N)
    print("\n=== Recommendations ===")
    print(out.to_string(index=False))

if __name__ == "__main__":
    main()
