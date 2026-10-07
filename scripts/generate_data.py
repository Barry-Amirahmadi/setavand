# -*- coding: utf-8 -*-
"""
Setavand Group (fictional) - synthetic data generator.

Builds db/setavand.sqlite: a fictional Iranian investment & construction
holding with six subsidiaries, operations window 1402/01/01 - 1404/12/29
(36 Jalali months). Every name, number and event is synthetic.

Seven business problems are planted on purpose so the dashboard has something
real to find. docs/answer-key.md lists them; the dashboard must surface each
one from the data alone.

    python scripts/generate_data.py
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from datetime import date, timedelta

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "db", "setavand.sqlite")
rng = np.random.default_rng(1404)
T0 = time.time()


def log(msg):
    print(f"[{time.time() - T0:6.1f}s] {msg}", flush=True)


# ===================================================================== calendar
def g2j(gy, gm, gd):
    """Gregorian -> Jalali (jdf.scr.ir algorithm)."""
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = (355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100
            + (gy2 + 399) // 400 + gd + g_d_m[gm - 1])
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm, jd = 1 + days // 31, 1 + days % 31
    else:
        jm, jd = 7 + (days - 186) // 30, 1 + (days - 186) % 30
    return jy, jm, jd


assert g2j(2022, 3, 21) == (1401, 1, 1)
assert g2j(2023, 3, 21) == (1402, 1, 1)
assert g2j(2025, 3, 20) == (1403, 12, 30)
assert g2j(2026, 3, 20) == (1404, 12, 29)

CAL_START = date(2022, 3, 21)   # 1401/01/01 - early presale contracts only
WIN_START = date(2023, 3, 21)   # 1402/01/01 - operations window opens
WIN_END = date(2026, 3, 20)     # 1404/12/29 - "today" in the data
M = 36

MONTH_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
            "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
WEEKDAY_FA = {5: "شنبه", 6: "یکشنبه", 0: "دوشنبه", 1: "سه‌شنبه",
              2: "چهارشنبه", 3: "پنجشنبه", 4: "جمعه"}
HOLIDAYS = {(1, 1), (1, 2), (1, 3), (1, 4), (1, 12), (1, 13), (3, 14),
            (3, 15), (11, 22), (12, 29)}

rows = []
d = CAL_START
while d <= WIN_END:
    jy, jm, jd = g2j(d.year, d.month, d.day)
    wd = d.weekday()
    rows.append(dict(
        date_key=int(d.strftime("%Y%m%d")), gdate=d.isoformat(),
        jdate=f"{jy}/{jm:02d}/{jd:02d}", j_year=jy, j_month=jm, j_day=jd,
        month_fa=MONTH_FA[jm - 1], period=jy * 100 + jm, quarter=(jm - 1) // 3 + 1,
        weekday_fa=WEEKDAY_FA[wd],
        is_holiday=int(wd == 4 or (jm, jd) in HOLIDAYS),
        in_window=int(d >= WIN_START)))
    d += timedelta(days=1)
cal = pd.DataFrame(rows)

A0 = (WIN_START - CAL_START).days          # absolute day index of 1402/01/01
A_END = (WIN_END - CAL_START).days         # absolute day index of 1404/12/29
N_ABS = A_END + 1
ABS_M = ((cal.j_year - 1402) * 12 + cal.j_month - 1).to_numpy()   # -12 .. 35
M_FIRST = {m: int(np.argmax(ABS_M == m)) for m in range(-12, M)}
M_LAST = {m: int(N_ABS - 1 - np.argmax(ABS_M[::-1] == m)) for m in range(-12, M)}
WORK = (cal.is_holiday == 0).to_numpy()
JDAY = {(r.j_year, r.j_month, r.j_day): i for i, r in enumerate(cal.itertuples())}
EPOCH = np.datetime64(CAL_START.isoformat())


def dkey(a):
    """Absolute day index (any, may run past the window) -> yyyymmdd int."""
    a = np.asarray(a, dtype="int64")
    s = np.datetime_as_string(EPOCH + a.astype("timedelta64[D]"), unit="D")
    return np.char.replace(s, "-", "").astype("int64")


def month_of(a):
    a = np.asarray(a)
    return np.where(a <= A_END, ABS_M[np.clip(a, 0, A_END)], 99)


def next_workday(a):
    a = int(a)
    while a <= A_END and not WORK[a]:
        a += 1
    return a


def rand_day_in_month(m, size, workdays=True):
    lo, hi = M_FIRST[m], M_LAST[m]
    days = np.arange(lo, hi + 1)
    if workdays:
        days = days[WORK[lo:hi + 1]]
    return rng.choice(days, size=size)


# ======================================================== price & cost indices
def growth(r1401, r1402, r1403, r1404, sd):
    g = np.r_[np.full(12, r1401), np.full(12, r1402), np.full(12, r1403), np.full(12, r1404)]
    return g + rng.normal(0, sd, 48)


def index_from(g):
    lvl = np.cumprod(1 + g)
    return lvl / lvl[12]          # 1.0 at 1402/01


g_gen = growth(.030, .029, .026, .041, .004)
g_st = g_gen + rng.normal(0, .010, 48)
g_st[12 + 19] += .09              # rebar shock, 1403/08
g_st[12 + 26] += .12              # rebar shock, 1404/03
g_ce = g_gen - .002 + rng.normal(0, .006, 48)
g_ce[12 + 24] += .15              # cement repricing, 1404/01
CI = {"general": index_from(g_gen), "steel": index_from(g_st), "cement": index_from(g_ce)}
CPI_G = growth(.030, .028, .023, .035, .002)      # consumer inflation, monthly
CPI = index_from(CPI_G)
HP_G = growth(.030, .027, .025, .030, .003)       # housing price list, monthly
HP = index_from(HP_G)


def ix(series, m):
    return series[np.asarray(m) + 12]


def avg_escalation(g, n):
    n = max(n, 1)
    return ((1 + g) ** n - 1) / (g * n)


PENALTY_ANNUAL = 0.18             # contractual late fee on presale installments
PENALTY_MONTHLY = PENALTY_ANNUAL / 12

# ================================================================== reference
SUBS = pd.DataFrame([
    (0, "HQ", "ستاد هلدینگ", "Holding HQ", "ستاد و خزانه"),
    (1, "MSK", "ستاوند مسکن", "Setavand Residential", "توسعهٔ مسکونی"),
    (2, "TJR", "ستاوند تجاری", "Setavand Commercial", "توسعهٔ تجاری و اداری"),
    (3, "OMR", "ستاوند عمران", "Setavand Civil", "پیمانکاری زیرساخت"),
    (4, "BTN", "ستاوند بتن و مصالح", "Setavand Materials", "تولید بتن و مصالح"),
    (5, "AML", "ستاوند خدمات املاک", "Setavand Property Services", "مدیریت و اجارهٔ املاک"),
    (6, "SRM", "ستاوند سرمایه", "Setavand Capital", "سرمایه‌گذاری و فرصت‌ها"),
], columns=["sub_id", "code", "name_fa", "name_en", "business_line"])

CITIES = pd.DataFrame([
    (1, "تهران · منطقهٔ ۱", "تهران", 175, 1), (2, "تهران · منطقهٔ ۲", "تهران", 128, 1),
    (3, "تهران · منطقهٔ ۳", "تهران", 146, 1), (4, "تهران · منطقهٔ ۵", "تهران", 88, 1),
    (5, "تهران · منطقهٔ ۲۲", "تهران", 84, 1), (6, "لواسان", "تهران", 118, 1),
    (7, "کرج", "البرز", 46, 1), (8, "پردیس", "تهران", 33, 0),
    (9, "اصفهان", "اصفهان", 56, 1), (10, "شیراز", "فارس", 51, 1),
    (11, "مشهد", "خراسان رضوی", 47, 1), (12, "تبریز", "آذربایجان شرقی", 41, 0),
    (13, "کیش", "هرمزگان", 96, 0), (14, "قزوین", "قزوین", 29, 0),
    (15, "رشت", "گیلان", 38, 0), (16, "یزد", "یزد", 31, 0),
    (17, "کرمان", "کرمان", 27, 0), (18, "اهواز", "خوزستان", 26, 0),
    (19, "قم", "قم", 30, 0), (20, "ساری", "مازندران", 35, 0),
], columns=["city_id", "name_fa", "province_fa", "price_m2_1402", "target_zone"])
CITY_PRICE = dict(zip(CITIES.city_id, CITIES.price_m2_1402))
TEHRAN_REGION = {1, 2, 3, 4, 5, 6, 7, 8}

MATERIALS = pd.DataFrame([
    (1, "میلگرد", "کیلوگرم", "steel", 21_500, 10_500, 2, 6),
    (2, "تیرآهن و پروفیل", "کیلوگرم", "steel", 24_500, 8_000, 4, 9),
    (3, "سیمان", "تن", "cement", 2_400_000, 32, 1, 4),
    (4, "بتن آماده", "مترمکعب", "cement", 2_150_000, 12, 0, 1),
    (5, "شن و ماسه", "تن", "general", 520_000, 52, 1, 3),
    (6, "آجر و بلوک", "مترمربع", "general", 420_000, 400, 3, 7),
    (7, "کاشی و سرامیک", "مترمربع", "general", 680_000, 260, 8, 20),
    (8, "پنجره و شیشه", "مترمربع", "general", 3_900_000, 58, 18, 40),
    (9, "تأسیسات مکانیکی", "قلم", "general", 4_800_000, 26, 20, 50),
    (10, "تجهیزات برق و کابل", "قلم", "general", 2_900_000, 32, 12, 35),
], columns=["material_id", "name_fa", "unit_fa", "family", "base_price", "avg_order", "lead_min", "lead_max"])
MIX = {
    "building": np.array([.20, .12, .07, .16, .04, .06, .08, .09, .10, .08]),
    "civil": np.array([.26, .10, .12, .28, .10, 0, 0, 0, .08, .06]),
    "plant": np.array([0, .15, .05, .10, 0, 0, 0, 0, .45, .25]),
    "fitout": np.array([0, 0, 0, 0, 0, .10, .25, .20, .25, .20]),
}
MAT_RATIO = {"building": .52, "civil": .48, "plant": .60, "fitout": .55}
ROUND_Q = np.array([10, 10, .5, 1, 1, 1, 1, 1, 1, 1], dtype=float)


def bench(mat_idx, m):
    """Market benchmark price (Toman / unit) of material at month m."""
    fam = MATERIALS.family.iat[mat_idx]
    return MATERIALS.base_price.iat[mat_idx] * ix(CI[fam], m)


# ================================================================== suppliers
COINED = ["آرتین", "سپیدتاب", "کوهپایه", "ارس‌نو", "پارس‌کوه", "زاگرس‌پویا", "آذرخش",
          "ستیغ", "البرزان", "هیربد", "تیرداد", "مهرسان", "نوین‌پی", "رادمهر", "پرتوسازه",
          "آیین‌سازه", "سپاهان‌پی", "بنیان‌نو", "سازه‌پویا", "کیمیاگر", "مهرآذین", "تابان",
          "روشن‌پی", "آوند", "سروسازه", "پیشگام", "آسانبر", "فرازمند", "نیک‌اندیش", "پایاسازه",
          "استوار", "بهین‌سازان", "پگاه", "راستین", "آتیه‌سازان", "شایان", "مانا", "کاوه‌پی",
          "دیبا", "رهپویان", "آرسام", "هومان", "ونوس", "شهاب", "پویش", "اطلس"]
FAMILY_PREFIX = {1: ["فولاد", "آهن‌آلات"], 2: ["پروفیل", "فولاد"], 3: ["سیمان"],
                 4: ["بتن"], 5: ["معدن شن و ماسهٔ"], 6: ["آجر", "بلوک‌سازی"],
                 7: ["کاشی", "سرامیک"], 8: ["پنجره", "شیشه"], 9: ["تأسیسات"],
                 10: ["برق", "کابل"]}
sup_rows = [(1, "ستاوند بتن و مصالح", 4, "تهران", 1, 0, .06),
            (2, "بتن آبان‌سازه", 4, "تهران", 0, 1, .07)]
used = {"ستاوند بتن و مصالح", "بتن آبان‌سازه"}
sid = 3
for mid in range(1, 11):
    for k in range(24):
        while True:
            name = f"{rng.choice(FAMILY_PREFIX[mid])} {rng.choice(COINED)}"
            if name not in used:
                used.add(name)
                break
        city = rng.choice(["تهران", "اصفهان", "تبریز", "مشهد", "شیراز", "قزوین", "کرج", "یزد"],
                          p=[.42, .12, .1, .08, .08, .08, .07, .05])
        framework = int(k < 3)
        sup_rows.append((sid, name, mid, city, 0, framework, float(rng.uniform(.05, .18))))
        sid += 1
SUPPLIERS = pd.DataFrame(sup_rows, columns=["supplier_id", "name_fa", "material_id", "city_fa",
                                            "is_internal", "is_framework", "late_rate"])
SUP_BY_MAT = {mid: SUPPLIERS[(SUPPLIERS.material_id == mid) & (SUPPLIERS.supplier_id > 2)]
              for mid in range(1, 11)}
FW = {mid: g[g.is_framework == 1].supplier_id.to_numpy() for mid, g in SUP_BY_MAT.items()}
SPOT = {mid: g[g.is_framework == 0].supplier_id.to_numpy() for mid, g in SUP_BY_MAT.items()}
LATE_RATE = dict(zip(SUPPLIERS.supplier_id, SUPPLIERS.late_rate))
FW[4] = np.r_[FW[4], 2]          # the S7 concrete supplier holds a framework contract

# =================================================================== projects
NAME_POOL = ["سپیدار", "کوهسار", "ارغوان", "الوند", "آرمان", "مهتاب", "صدرا", "یاس",
             "ستاره", "بهار", "آبشار", "چنار", "مهرگان", "آفتاب", "نسترن", "ایوان", "کیان",
             "هامون", "پرند", "آریا", "کاج", "ترنج", "ماهان", "روشا", "آوا", "سورنا", "تیام",
             "دلارام", "آسا", "پردیس", "باران", "رویان", "سهند", "سبلان", "بهارستان", "سرو"]
used_names = {"سپهر", "سروناز", "آسمان", "افرا", "ماهور", "پارسه", "نگین"}


def take_name():
    while True:
        n = rng.choice(NAME_POOL)
        if n not in used_names:
            used_names.add(n)
            return n


PROJ = []


def add_project(**k):
    k.setdefault("story", "")
    k.setdefault("dev_share", 1.0)
    k.setdefault("indexed_from", None)
    k.setdefault("presold_early", None)
    k.setdefault("early_window", None)
    k.setdefault("investor", 0.0)
    k.setdefault("locked_price", False)
    k.setdefault("premium", float(rng.uniform(.95, 1.12)))
    k.setdefault("units", 0)
    k.setdefault("avg_m2", 0.0)
    PROJ.append(k)


# planted-story projects (see docs/answer-key.md)
add_project(code="MSK-01", name="برج سپهر", sub=1, city=3, kind="building", type_fa="مسکونی",
            units=168, avg_m2=165, start=-6, dur=44, presold_early=.84, early_window=(-5, 9),
            locked_price=True, investor=.12, premium=1.08, margin=.24, story="S1,S3")
add_project(code="MSK-02", name="مجتمع سروناز", sub=1, city=7, kind="building", type_fa="مسکونی",
            units=260, avg_m2=112, start=-4, dur=40, presold_early=.66, early_window=(-3, 10),
            investor=.22, margin=.21, story="S1")
add_project(code="MSK-03", name="برج‌های آسمان", sub=1, city=5, kind="building", type_fa="مسکونی",
            units=210, avg_m2=128, start=6, dur=40, margin=.23, story="S7")
add_project(code="TJR-01", name="مجتمع تجاری افرا", sub=2, city=4, kind="building", type_fa="تجاری",
            units=120, avg_m2=48, start=4, dur=38, margin=.26, story="S7")
add_project(code="TJR-02", name="برج اداری ماهور", sub=2, city=2, kind="building", type_fa="اداری",
            units=84, avg_m2=135, start=8, dur=40, margin=.25, story="S7")
add_project(code="TJR-03", name="مرکز تجاری پارسه", sub=2, city=10, kind="building", type_fa="تجاری",
            units=140, avg_m2=42, start=2, dur=36, indexed_from=15, margin=.22, story="pilot")
add_project(code="TJR-04", name="مجتمع تجاری نگین", sub=2, city=11, kind="building", type_fa="تجاری",
            units=110, avg_m2=46, start=4, dur=34, indexed_from=15, margin=.21, story="pilot")

RES_CITIES = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13]
RES_W = np.array([1, 2, 3, 3, 3, 1, 2, 2, 2, 2, 1, 1], dtype=float)
for i in range(19):
    c = int(rng.choice(RES_CITIES, p=RES_W / RES_W.sum()))
    tehran = c in TEHRAN_REGION
    add_project(code=f"MSK-{i + 4:02d}", name=f"{rng.choice(['برج', 'مجتمع', 'برج‌های', 'مجتمع مسکونی'])} {take_name()}",
                sub=1, city=c, kind="building", type_fa="مسکونی",
                units=int(rng.integers(48, 230)), avg_m2=float(rng.uniform(100, 175) if tehran else rng.uniform(95, 140)),
                start=int(rng.integers(-20, 19)), dur=int(rng.integers(30, 47)),
                margin=float(rng.uniform(.20, .31) if tehran else rng.uniform(.15, .25)))
for i in range(8):
    c = int(rng.choice(RES_CITIES, p=RES_W / RES_W.sum()))
    kind_fa = rng.choice(["تجاری", "اداری", "تجاری"])
    add_project(code=f"TJR-{i + 5:02d}", name=f"{rng.choice(['مرکز تجاری', 'مجتمع تجاری', 'برج اداری'])} {take_name()}",
                sub=2, city=c, kind="building", type_fa=str(kind_fa),
                units=int(rng.integers(30, 140)), avg_m2=float(rng.uniform(38, 140)),
                start=int(rng.integers(-18, 17)), dur=int(rng.integers(32, 50)),
                margin=float(rng.uniform(.19, .31)))
CIVIL = ["ایستگاه مترو", "تقاطع غیرهم‌سطح", "بیمارستان ۲۲۰ تخت‌خوابی", "پل بزرگراهی",
         "تصفیه‌خانهٔ آب", "مجموعهٔ آموزشی", "ورزشگاه سرپوشیده", "شبکهٔ فاضلاب",
         "پایانهٔ مسافربری", "تقاطع غیرهم‌سطح", "ایستگاه مترو", "مخزن ذخیرهٔ آب",
         "بیمارستان ۱۶۰ تخت‌خوابی", "پل عابر و زیرگذر"]
CIVIL_CITIES = [1, 3, 4, 5, 7, 9, 10, 11, 12, 14, 15, 16, 18, 20]
for i in range(14):
    c = int(CIVIL_CITIES[i])
    cname = CITIES.set_index("city_id").name_fa[c].split(" · ")[0]
    add_project(code=f"OMR-{i + 1:02d}", name=f"{CIVIL[i]} {cname}", sub=3, city=c, kind="civil",
                type_fa="زیرساخت", start=int(rng.integers(-18, 15)), dur=int(rng.integers(20, 41)),
                bac=float(rng.uniform(180, 720)))
for i, nm in enumerate(["خط تولید بتن شمارهٔ ۳", "سیلوی سیمان ۴۰۰۰ تنی", "نوسازی ناوگان میکسر"]):
    add_project(code=f"BTN-{i + 1:02d}", name=nm, sub=4, city=5, kind="plant", type_fa="سرمایه‌ای داخلی",
                start=int(rng.integers(0, 21)), dur=int(rng.integers(8, 15)), bac=float(rng.uniform(40, 110)))
for i, nm in enumerate(["بازسازی مجتمع تجاری کوهسار", "نوسازی تأسیسات برج اداری الوند",
                        "بهسازی پارکینگ مجتمع ترنج", "بازطراحی نما و لابی مجتمع صدرا"]):
    add_project(code=f"AML-{i + 1:02d}", name=nm, sub=5, city=int(rng.choice([2, 3, 4])), kind="fitout",
                type_fa="بازسازی", start=int(rng.integers(-2, 25)), dur=int(rng.integers(6, 13)),
                bac=float(rng.uniform(45, 170)))
for i in range(5):
    c = int(rng.choice([1, 2, 3, 6]))
    add_project(code=f"SRM-{i + 1:02d}", name=f"مشارکت در ساخت {take_name()}", sub=6, city=c,
                kind="building", type_fa="مسکونی · مشارکتی", units=int(rng.integers(60, 140)),
                avg_m2=float(rng.uniform(105, 160)), start=int(rng.integers(6, 25)),
                dur=int(rng.integers(30, 41)), dev_share=.65, margin=float(rng.uniform(.18, .27)))

K_S = 8.0


def s_curve(x):
    x = np.clip(x, 0, 1)
    lo, hi = 1 / (1 + np.exp(K_S / 2)), 1 / (1 + np.exp(-K_S / 2))
    return (1 / (1 + np.exp(-K_S * (x - .5))) - lo) / (hi - lo)


MM = np.arange(-24, M)          # months -24 .. 35
for pid, p in enumerate(PROJ, start=1):
    p["project_id"] = pid
    p["has_sales"] = p["kind"] == "building"
    if p["kind"] == "building":
        gross_factor = 1.38 if p["sub"] != 2 else 1.5
        p["gross_m2"] = p["units"] * p["avg_m2"] * gross_factor
        bc = (.28 * CITY_PRICE[p["city"]] + 11) * (1.12 if p["sub"] == 2 else 1.0)
        p["bac"] = p["gross_m2"] * bc / 1000                     # billion Toman, 1402/01 prices
        use_mult = {"تجاری": 2.1, "اداری": 1.45}.get(p["type_fa"], 1.0)
        p["base_price"] = CITY_PRICE[p["city"]] * p["premium"] * use_mult   # million Toman / m2, 1402/01
    else:
        p["gross_m2"] = 0.0
        p["base_price"] = 0.0
    p["mix"] = MIX[p["kind"]]
    p["mat_ratio"] = MAT_RATIO[p["kind"]]
    p["r"] = float(np.clip(rng.normal(.965, .045), .84, 1.06))
    p["cpi_o"] = float(np.clip(rng.normal(.975, .02), .93, 1.02))
    x_plan = (MM - p["start"] + 1) / p["dur"]
    rate = np.where(MM >= p["start"], p["r"], 0.0)
    if "S7" in p["story"]:
        rate[MM >= 24] *= .62                                     # 1404: concrete supply slips
    p["P_cum"] = s_curve(x_plan)
    p["A_cum"] = s_curve(np.cumsum(rate) / p["dur"])
    p["dA"] = np.diff(np.r_[0.0, p["A_cum"]])                    # per month, aligned to MM
    p["dP"] = np.diff(np.r_[0.0, p["P_cum"]])
    if p["has_sales"]:
        ufs = p["units"] * p["dev_share"]
        rev_plan = ufs * p["avg_m2"] * p["base_price"] * ix(HP, max(p["start"], -12)) \
            * avg_escalation(.02, p["dur"]) / 1000
        eac_plan = p["bac"] * ix(CI["general"], max(p["start"], -12)) * avg_escalation(.02, p["dur"])
        land = (1 - p["margin"]) * rev_plan - eac_plan
        if p["dev_share"] < 1:
            land = 0.0
        p["land"] = max(land, .08 * rev_plan) if p["dev_share"] == 1 else 0.0
        p["rev_plan"] = rev_plan
        p["eac_plan"] = eac_plan
        p["plan_margin"] = (rev_plan - p["land"] - eac_plan) / rev_plan
    else:
        p["land"] = 0.0
        p["rev_plan"] = p["bac"] * 1.12 if p["kind"] == "civil" else 0.0
        p["eac_plan"] = p["bac"] * avg_escalation(.02, p["dur"])
        p["plan_margin"] = .107 if p["kind"] == "civil" else None
log(f"projects: {len(PROJ)}")
IDX = lambda m: m + 24          # month -> position in MM arrays

# ================================================================ cash ledger
SUB_IDS = list(SUBS.sub_id)
NET = np.zeros((7, N_ABS))
OPEN_BAL = np.array([7200, 900, 650, 380, 260, 650, 1500], dtype=float) * 1e9
FLOOR = 60e9
cash_parts = []


def add_cash(days, sub, amount, category, direction, project=None, ref=None, counterparty=""):
    days = np.asarray(days, dtype="int64")
    amount = np.asarray(amount, dtype=float)
    sub = np.broadcast_to(np.asarray(sub), days.shape)
    keep = (days >= A0) & (days <= A_END)
    if not keep.any():
        return
    days, amount, sub = days[keep], amount[keep], sub[keep]
    np.add.at(NET, (sub, days), direction * amount)
    proj = np.broadcast_to(np.asarray(project if project is not None else -1), keep.shape)[keep]
    refs = np.broadcast_to(np.asarray(ref if ref is not None else -1), keep.shape)[keep]
    cash_parts.append(pd.DataFrame({
        "day": days, "sub_id": sub, "direction": direction, "category": category,
        "amount": np.round(amount, -3).astype("int64"), "project_id": proj, "ref_id": refs,
        "counterparty": counterparty}))


# =============================================================== presales
sale_rows, inst_rows = [], []
cust_rows = []
sale_id = 0
for p in PROJ:
    if not p["has_sales"]:
        continue
    ufs = int(round(p["units"] * p["dev_share"]))
    start = max(p["start"], -12)
    if p["presold_early"]:
        e0, e1 = p["early_window"]
        n_early = int(round(ufs * p["presold_early"]))
    else:
        e0, e1 = start, start + 7
        n_early = int(round(ufs * rng.uniform(.16, .40)))
    e0 = max(e0, -12)
    e1 = min(max(e1, e0), M - 1)
    em = np.arange(e0, e1 + 1)
    w = np.exp(-((em - em.mean()) / max(len(em) / 2.5, .8)) ** 2)
    sold = list(np.repeat(em, rng.multinomial(n_early, w / w.sum())))
    remaining = ufs - n_early
    rate = ufs * rng.uniform(.010, .026)
    for m in range(e1 + 1, M):
        if remaining <= 0:
            break
        k = int(min(remaining, rng.poisson(rate)))
        sold += [m] * k
        remaining -= k
    p["units_sold"] = len(sold)
    p["units_for_sale"] = ufs
    for m in sold:
        sale_id += 1
        a = int(rand_day_in_month(m, 1)[0])
        area = p["avg_m2"] * rng.uniform(.8, 1.2)
        if p["locked_price"] and e0 <= m <= e1:
            ppm = p["base_price"] * ix(HP, e0)                      # list frozen for the campaign
        else:
            q0 = m - ((m + 12) % 3)
            ppm = p["base_price"] * ix(HP, q0) * rng.uniform(.97, 1.03)
        value = area * ppm * 1e6
        investor = rng.random() < (.15 + p["investor"])
        indexed = p["indexed_from"] is not None and m >= p["indexed_from"]
        down = .25 if p["code"] == "MSK-01" else float(rng.uniform(.28, .35))
        n_inst = int(np.clip(p["start"] + p["dur"] - m - 3, 10, 30))
        base_inst = (1 - down) * value / n_inst
        cust_id = 100000 + sale_id
        cust_rows.append((cust_id, "خریدار پیش‌فروش", "سرمایه‌گذار" if investor else "مصرف‌کننده",
                          "حقوقی" if rng.random() < .1 else "حقیقی"))
        sale_rows.append((sale_id, p["project_id"], cust_id, int(dkey(a)), round(area, 1), round(ppm, 2),
                          int(round(value, -3)), round(down, 3), n_inst, int(indexed), PENALTY_ANNUAL, int(investor)))
        add_cash([a], p["sub"], [down * value], "پیش‌دریافت فروش", +1, p["project_id"], sale_id, "خریداران")
        dues = a + 30 * np.arange(1, n_inst + 1)
        m_due = np.clip(np.where(dues <= A_END, ABS_M[np.clip(dues, 0, A_END)], M - 1), -12, M - 1)
        if indexed:
            amt = base_inst * ix(CI["general"], m_due) / ix(CI["general"], m)
            p_late = np.full(n_inst, .07)
            mean_late = np.full(n_inst, 9.0)
        else:
            amt = np.full(n_inst, base_inst)
            gap = np.maximum(ix(CPI_G, m_due) - PENALTY_MONTHLY, 0)
            p_late = np.clip(.08 + 13 * gap, .06, .55) + (.20 if investor else 0) + p["investor"] * 1.2
            mean_late = (18 + 1700 * gap) * (1.6 if investor else 1.0) * (1 + 3 * p["investor"])
        is_late = rng.random(n_inst) < p_late
        late_days = np.where(is_late, np.ceil(rng.exponential(mean_late)), rng.integers(-2, 3, n_inst))
        paid = dues + late_days.astype(int)
        future = dues > A_END
        paid_ok = (~future) & (paid <= A_END)
        for k in range(n_inst):
            inst_rows.append((sale_id, k + 1, int(dkey(dues[k])), int(round(amt[k], -3)),
                              int(dkey(paid[k])) if paid_ok[k] else None,
                              int(round(amt[k], -3)) if paid_ok[k] else 0,
                              int(max(late_days[k], 0)) if paid_ok[k] else None,
                              "آتی" if future[k] else ("پرداخت‌شده" if paid_ok[k] else "معوق")))
        add_cash(paid[paid_ok], p["sub"], amt[paid_ok], "وصول اقساط پیش‌فروش", +1, p["project_id"], sale_id, "خریداران")
SALES = pd.DataFrame(sale_rows, columns=["sale_id", "project_id", "customer_id", "contract_date_key", "area_m2",
                                         "price_m2_mtoman", "contract_value", "down_payment_pct", "n_installments",
                                         "is_indexed", "late_fee_annual", "is_investor_buyer"])
INST = pd.DataFrame(inst_rows, columns=["sale_id", "installment_no", "due_date_key", "amount_due",
                                        "paid_date_key", "amount_paid", "days_late", "status"])
INST.insert(0, "installment_id", np.arange(1, len(INST) + 1))
log(f"presales: {len(SALES)} contracts, {len(INST)} installments")

# ========================================================= EVM: PV / EV / other cost
pm_rows = []
for p in PROJ:
    for m in range(M):
        i = IDX(m)
        if p["A_cum"][i] <= 0 and p["P_cum"][i] <= 0:
            continue
        ci_m = ix(CI["general"], m)
        pv = p["bac"] * p["dP"][i] * ci_m * 1e9
        ev = p["bac"] * p["dA"][i] * ci_m * 1e9
        ac_oth = ev * (1 - p["mat_ratio"]) / p["cpi_o"]
        pm_rows.append([p["project_id"], m, pv, ev, ac_oth, p["P_cum"][i], p["A_cum"][i]])
PM = pd.DataFrame(pm_rows, columns=["project_id", "m", "pv", "ev", "ac_other", "planned_pct", "actual_pct"])
PM["ac_material"] = 0.0
PROJ_BY_ID = {p["project_id"]: p for p in PROJ}

# land for projects launched inside the window: 35% in cash, the rest swapped for finished units
LAND_CASH = .35
for p in PROJ:
    if p["has_sales"] and p["land"] > 0 and p["start"] >= 0:
        day = M_FIRST[p["start"]] + 10
        add_cash([day, day + 120], p["sub"], [.6 * LAND_CASH * p["land"] * 1e9, .4 * LAND_CASH * p["land"] * 1e9],
                 "خرید زمین پروژه", -1, p["project_id"], -1, "مالکان زمین")

# subcontract & site labour - paid ~2 weeks after month end
for p in PROJ:
    sub_pm = PM[PM.project_id == p["project_id"]]
    for r in sub_pm.itertuples():
        if r.ac_other > 0:
            day = M_LAST[r.m] + int(rng.integers(8, 21))
            add_cash([day], p["sub"], [r.ac_other], "پیمانکاران جزء و دستمزد کارگاه", -1, p["project_id"], -1, "پیمانکاران")

# civil progress billing (government client, paid late)
bill_rows = []
for p in PROJ:
    if p["kind"] != "civil":
        continue
    for r in PM[PM.project_id == p["project_id"]].itertuples():
        if r.ev <= 0:
            continue
        amount = r.ev * 1.12
        inv_day = M_LAST[r.m] + int(rng.integers(6, 14))
        lag = int(rng.uniform(70, 190)) if rng.random() > .06 else 900
        instrument = "اسناد خزانه" if rng.random() < .25 else "نقد"
        bill_rows.append((p["project_id"], r.m, inv_day, amount, inv_day + lag, instrument))
        add_cash([inv_day + lag], 3, [amount], "وصول صورت‌وضعیت" + (" · اسناد خزانه" if instrument != "نقد" else ""),
                 +1, p["project_id"], -1, "کارفرمای دولتی")
BILLS = pd.DataFrame(bill_rows, columns=["project_id", "m", "inv_day", "amount", "pay_day", "instrument"])
log(f"civil billing rows: {len(BILLS)}")

# rents & service charges (property services)
PROPERTIES = ["مجتمع تجاری کوهسار", "برج اداری الوند", "مجتمع ترنج", "مرکز خرید صدرا", "برج اداری سهند", "بازارچهٔ سرو"]
tenants = []
for t in range(640):
    tenants.append((200000 + t, rng.choice(PROPERTIES), float(rng.lognormal(np.log(105e6), .55))))
rent_rows = []
for tid, prop, rent0 in tenants:
    for m in range(M):
        yr = m // 12
        rent = rent0 * (1.31 ** yr) * 1.12
        inv = M_FIRST[m]
        u = rng.random()
        lag = int(rng.integers(1, 11)) if u < .84 else (int(rng.integers(11, 46)) if u < .96 else int(rng.integers(46, 121)))
        rent_rows.append((tid, m, inv, rent, inv + lag))
RENT = pd.DataFrame(rent_rows, columns=["tenant_id", "m", "inv_day", "amount", "pay_day"])
add_cash(RENT.pay_day.to_numpy(), 5, RENT.amount.to_numpy(), "اجاره و شارژ", +1, None, RENT.tenant_id.to_numpy(), "مستأجران")
for tid, prop, rent0 in tenants:
    cust_rows.append((tid, "مستأجر", prop, "حقوقی" if rng.random() < .35 else "حقیقی"))

# external ready-mix concrete sales
ext_rows = []
for a in range(A0, A_END + 1):
    if not WORK[a]:
        continue
    m = ABS_M[a]
    n = rng.poisson(22 * (.55 if cal.j_month.iat[a] in (10, 11) else 1.0))
    for _ in range(n):
        qty = float(rng.integers(6, 41))
        price = bench(3, m) * rng.uniform(1.04, 1.14)
        u = rng.random()
        lag = int(rng.integers(3, 31)) if u < .7 else (int(rng.integers(31, 61)) if u < .95 else int(rng.integers(61, 101)))
        ext_rows.append((a, m, int(rng.integers(300000, 300180)), qty, price, qty * price, a + lag))
EXT = pd.DataFrame(ext_rows, columns=["day", "m", "customer_id", "qty_m3", "price", "amount", "pay_day"])
add_cash(EXT.pay_day.to_numpy(), 4, EXT.amount.to_numpy(), "فروش بتن به مشتریان بیرونی", +1, None, -1, "مشتریان بتن")
for c in range(300000, 300180):
    cust_rows.append((c, "مشتری بتن", "پیمانکار بیرونی", "حقوقی"))
log(f"external concrete orders: {len(EXT)}")

# payroll (G&A) - paid on the 26th
HEADCOUNT = {0: 120, 1: 420, 2: 260, 3: 640, 4: 180, 5: 190, 6: 48}
SAL = {1402: 27e6, 1403: 27e6 * 1.30, 1404: 27e6 * 1.30 * 1.34}
pay_rows = []
for m in range(M):
    jy, jm = 1402 + m // 12, m % 12 + 1
    day = JDAY[(jy, jm, 26)]
    while not WORK[day]:
        day -= 1
    for s, h in HEADCOUNT.items():
        amt = h * SAL[jy] * rng.uniform(.98, 1.02)
        pay_rows.append((s, m, amt))
        add_cash([day], s, [amt], "حقوق و دستمزد ستادی", -1, None, -1, "کارکنان")
PAYROLL = pd.DataFrame(pay_rows, columns=["sub_id", "m", "amount"])

# =========================================================== opportunities (S5)
STAGES = ["دریافت", "غربال اولیه", "بازدید و ارزیابی فنی", "ارزیابی مالی و حقوقی", "کمیتهٔ سرمایه‌گذاری", "مذاکره و قرارداد"]
OPP_TYPES = ["زمین خام", "ملک کلنگی", "پروژهٔ نیمه‌تمام", "مشارکت در ساخت", "خرید سهم شرکت"]
OPP_SOURCES = ["معرف و شبکهٔ آشنایان", "مشاور املاک و کارگزار", "مالک مستقیم", "وب‌سایت و فرم آنلاین", "مزایده‌ها و نهادها"]
LEGAL = ["سند تک‌برگ", "سند منگوله‌دار", "قولنامه‌ای", "مشاع", "وقفی"]
opp_rows, stage_rows, deals = [], [], []
oid = 0
for a in range(A0, A_END + 1):
    lam = 2.45 * (.3 if not WORK[a] else 1.0) * (.5 if cal.j_month.iat[a] == 1 else 1.0)
    for _ in range(rng.poisson(lam)):
        oid += 1
        typ = rng.choice(OPP_TYPES, p=[.28, .30, .14, .22, .06])
        city = int(rng.choice(CITIES.city_id, p=np.r_[[.07, .08, .09, .08, .08, .05, .07, .03, .07, .07, .06, .03, .02, .02],
                                                     np.full(6, .03)] / np.r_[[.07, .08, .09, .08, .08, .05, .07, .03, .07, .07, .06, .03, .02, .02], np.full(6, .03)].sum()))
        area = float(rng.lognormal(np.log(1400), .7))
        cprice = CITY_PRICE[city]
        appraisal = area * cprice * rng.uniform(.30, .55) * ix(HP, ABS_M[a]) / 1000       # billion Toman
        ask = appraisal * rng.choice([rng.uniform(.9, 1.18), rng.uniform(1.3, 1.75)], p=[.88, .12])
        legal = rng.choice(LEGAL, p=[.62, .18, .08, .08, .04])
        irr = float(np.clip(rng.normal(.44, .11), .1, .9))
        flags = []
        tz = int(CITIES.set_index("city_id").target_zone[city])
        if not tz:
            flags.append("خارج از مناطق هدف")
        if area < 600:
            flags.append("متراژ کمتر از حد نصاب")
        if legal in ("قولنامه‌ای", "مشاع", "وقفی"):
            flags.append("مشکل سند و وضعیت حقوقی")
        if ask / appraisal > 1.3:
            flags.append("قیمت بالاتر از ارزش کارشناسی")
        # explainable intake score (the proposed to-be model)
        s_loc = min(100, cprice / 1.75) if tz else 15
        s_legal = {"سند تک‌برگ": 100, "سند منگوله‌دار": 80, "قولنامه‌ای": 30, "مشاع": 25, "وقفی": 10}[legal]
        s_price = float(np.clip(100 - (ask / appraisal - .9) * 180, 0, 100))
        s_irr = float(np.clip((irr - .25) / .4 * 100, 0, 100))
        s_size = float(np.clip((area - 400) / 1600 * 100, 0, 100))
        s_speed = {"زمین خام": 45, "ملک کلنگی": 70, "پروژهٔ نیمه‌تمام": 90, "مشارکت در ساخت": 60, "خرید سهم شرکت": 75}[typ]
        score = .25 * s_loc + .20 * s_legal + .20 * s_price + .20 * s_irr + .10 * s_size + .05 * s_speed
        # as-is manual process
        t, hours, reached, outcome, reason = a, 0.0, 0, None, None
        stage_log = []

        dur_med = [0, 6, 9, 12, 7, 26]
        hrs = [0.3, 2.5, 9, 16, 4, 20]
        good = (not flags) and irr >= .40
        k = 0
        stage_rows_local = []
        stage_rows_local.append((oid, 0, STAGES[0], t, t, "ثبت", hrs[0]))
        hours += hrs[0]
        catch_prob = {1: .35, 2: .45, 3: 1.0}
        for k in range(1, 6):
            d_in = t
            if k == 4:
                wait = int(rng.integers(3, 15))
                t = t + wait
            else:
                t = t + max(1, int(rng.lognormal(np.log(dur_med[k]), .45)))
            hours += hrs[k]
            reached = k
            if flags and k in catch_prob and rng.random() < catch_prob[k]:
                outcome = ["", "رد در غربال اولیه", "رد پس از بازدید", "رد در ارزیابی مالی و حقوقی"][k]
                reason = flags[0]
                stage_rows_local.append((oid, k, STAGES[k], d_in, t, "رد", hrs[k]))
                break
            if k == 3 and irr < .38:
                outcome, reason = "رد در ارزیابی مالی و حقوقی", "بازده کمتر از نرخ هدف"
                stage_rows_local.append((oid, k, STAGES[k], d_in, t, "رد", hrs[k]))
                break
            if k == 2 and rng.random() < .08:
                outcome, reason = "رد پس از بازدید", "ریسک فنی و سازه‌ای"
                stage_rows_local.append((oid, k, STAGES[k], d_in, t, "رد", hrs[k]))
                break
            if k == 4:
                if good and (t - a) > 35 and rng.random() < .45:
                    outcome, reason = "ازدست‌رفته · خرید توسط رقیب", "طولانی شدن تصمیم‌گیری"
                    stage_rows_local.append((oid, k, STAGES[k], d_in, t, "ازدست‌رفته", hrs[k]))
                    break
                if rng.random() > (.26 if good else .06):
                    outcome, reason = "رد در کمیته", "عدم تأیید کمیته"
                    stage_rows_local.append((oid, k, STAGES[k], d_in, t, "رد", hrs[k]))
                    break
            if k == 5:
                if rng.random() < .55:
                    outcome, reason = "قرارداد بسته شد", None
                    stage_rows_local.append((oid, k, STAGES[k], d_in, t, "قرارداد", hrs[k]))
                    deals.append((oid, t, ask * rng.uniform(.86, .96) * (.3 if typ == "مشارکت در ساخت" else 1.0)))
                else:
                    outcome, reason = "عدم توافق در مذاکره", "عدم توافق قیمت"
                    stage_rows_local.append((oid, k, STAGES[k], d_in, t, "رد", hrs[k]))
                break
            stage_rows_local.append((oid, k, STAGES[k], d_in, t, "عبور", hrs[k]))
        end_day = t
        if end_day > A_END:     # still in the pipeline on 1404/12/29
            outcome, reason = "در جریان", None
            stage_rows_local = [r for r in stage_rows_local if r[3] <= A_END]
            stage_rows_local = [(r[0], r[1], r[2], r[3], r[4] if r[4] <= A_END else None, "در جریان" if r[4] > A_END else r[5], r[6])
                                for r in stage_rows_local]
            hours = sum(r[6] for r in stage_rows_local)
            reached = max(r[1] for r in stage_rows_local)
        stage_rows.extend(stage_rows_local)
        opp_rows.append((oid, a, typ, rng.choice(OPP_SOURCES, p=[.32, .30, .18, .12, .08]), city, round(area),
                         round(ask, 1), round(appraisal, 1), legal, round(irr, 3), int(tz), "، ".join(flags),
                         int(bool(flags)), reached, outcome, reason, min(end_day, A_END) if outcome != "در جریان" else None,
                         round(hours, 1), round(score, 1), round(s_loc), round(s_legal), round(s_price), round(s_irr),
                         round(s_size), round(s_speed)))
OPP = pd.DataFrame(opp_rows, columns=["opportunity_id", "received_day", "type_fa", "source_fa", "city_id", "area_m2",
                                      "ask_price_bn", "appraisal_bn", "legal_status", "expected_irr", "in_target_zone",
                                      "intake_flags", "has_intake_flag", "max_stage", "outcome", "reason",
                                      "decision_day", "analyst_hours", "intake_score", "s_location", "s_legal",
                                      "s_price", "s_irr", "s_size", "s_speed"])
OSTAGE = pd.DataFrame(stage_rows, columns=["opportunity_id", "stage_no", "stage_fa", "entered_day", "exited_day",
                                           "result_fa", "analyst_hours"])
log(f"opportunities: {len(OPP)}, stages: {len(OSTAGE)}, deals: {len(deals)}, deal value bn: {sum(d[2] for d in deals):,.0f}")
CO_INVEST = .55     # Setavand Capital funds 55% of each deal; a partner fund the rest
for oid_, day, amt in deals:
    amt = amt * CO_INVEST
    add_cash([day], 6, [amt * 1e9 * .6], "خرید دارایی و فرصت سرمایه‌گذاری", -1, None, oid_, "فروشندگان")
    add_cash([day + int(rng.integers(60, 121))], 6, [amt * 1e9 * .4], "خرید دارایی و فرصت سرمایه‌گذاری", -1, None, oid_, "فروشندگان")
EXITS = [(8, 620), (15, 780), (22, 540), (30, 910)]
for m_x, amt in EXITS:
    add_cash([M_FIRST[m_x] + 12], 6, [amt * 1e9], "فروش و خروج از سرمایه‌گذاری", +1, None, -1, "خریداران دارایی")

# ======================================================= purchase orders (monthly)
po_parts, grn_parts = [], []
po_seq = 0
CIVIL_STEEL_SPOT = .68
FW_SHARE = {0: .6, 1: .76, 2: .72, 3: .60, 4: .80, 5: .55, 6: .70}
S7_PROJECTS = {p["project_id"] for p in PROJ if "S7" in p["story"]}
credit_log = []
inject_rows = []
SUB_OF = {p["project_id"]: p["sub"] for p in PROJ}
mat_ids = MATERIALS.material_id.to_numpy()
lead_min = MATERIALS.lead_min.to_numpy()
lead_max = MATERIALS.lead_max.to_numpy()
avg_order = MATERIALS.avg_order.to_numpy().astype(float)
base_price = MATERIALS.base_price.to_numpy().astype(float)

# a monthly outflow scale per subsidiary, used as the "comfortable buffer"
BUFFER = np.array([150, 520, 380, 300, 140, 60, 120], dtype=float) * 1e9

EXT_M = EXT.groupby("m").amount.sum().to_dict()
plant_int = np.zeros(M)
for m in range(M):
    bal_start = OPEN_BAL + NET[:, A0:M_FIRST[m]].sum(axis=1)
    credit_share = np.clip(.10 + .70 * (1 - bal_start / BUFFER), .08, .78)
    credit_log.append((m, *credit_share, *bal_start))
    for p in PROJ:
        i = IDX(m)
        dA = p["dA"][i]
        if dA <= 0:
            continue
        need_real = p["bac"] * 1e9 * dA * p["mat_ratio"]
        for j in range(10):
            if p["mix"][j] <= 0:
                continue
            qty = need_real * p["mix"][j] / base_price[j] * (1 + max(rng.normal(.02, .01), 0))
            n = max(1, int(rng.poisson(max(qty / avg_order[j], .3))))
            q = qty * rng.dirichlet(np.ones(n)) if n > 1 else np.array([qty])
            q = np.maximum(np.round(q / ROUND_Q[j]) * ROUND_Q[j], ROUND_Q[j])
            mid = j + 1
            order_day = rand_day_in_month(m, n)
            # supplier & channel
            sup = np.empty(n, dtype=int)
            channel = np.empty(n, dtype=object)
            factor = np.empty(n)
            u = rng.random(n)
            if mid == 4:
                tehran = p["city"] in TEHRAN_REGION
                if p["project_id"] in S7_PROJECTS and m >= 12:
                    ext = u < .85
                    sup[ext] = 2
                    channel[ext] = "قرارداد چارچوب"
                    factor[ext] = rng.uniform(.98, 1.01, ext.sum())
                    rest = ~ext
                else:
                    internal = (u < .5) & tehran & (p["sub"] != 4)
                    sup[internal] = 1
                    channel[internal] = "درون‌گروهی"
                    factor[internal] = rng.uniform(.99, 1.02, internal.sum())
                    rest = ~internal
            else:
                rest = np.ones(n, dtype=bool)
            nr = rest.sum()
            if nr:
                fw_share = FW_SHARE[p["sub"]]
                if p["sub"] == 3 and mid in (1, 2):
                    fw_share = 1 - CIVIL_STEEL_SPOT
                is_fw = rng.random(nr) < fw_share
                s_r = np.where(is_fw, rng.choice(FW[mid], nr), rng.choice(SPOT[mid], nr))
                f_r = np.where(is_fw, rng.uniform(.97, 1.0, nr), 1 + np.clip(rng.normal(.05, .02, nr), 0, .12))
                if p["sub"] == 3 and mid in (1, 2):
                    f_r = np.where(is_fw, f_r, 1 + rng.normal(.145, .018, nr))
                sup[rest] = s_r
                channel[rest] = np.where(is_fw, "قرارداد چارچوب", "خرید موردی")
                factor[rest] = f_r
            price = bench(j, m) * factor * (1 + rng.normal(0, .012, n))
            internal = sup == 1
            credit = (rng.random(n) < credit_share[p["sub"]]) & ~internal
            cm = np.where(credit, rng.choice([1, 2, 3], n, p=[.4, .4, .2]), 0)
            prem = np.where(credit, 1.035 ** cm - 1, 0.0)
            price = price * (1 + prem)
            amount = q * price
            lead = rng.integers(lead_min[j], lead_max[j] + 1, n)
            promised = order_day + lead
            if mid == 4 and (sup == 2).any():
                yr = m // 12
                p_late = np.where(sup == 2, [.06, .12, .30][yr], [LATE_RATE.get(s, .1) for s in sup])
                mean_delay = np.where(sup == 2, [1.5, 2.5, 4.5][yr], 2.5)
                short_p = np.where(sup == 2, [.05, .08, .17][yr], .05)
            else:
                p_late = np.array([LATE_RATE.get(s, .1) for s in sup])
                mean_delay = np.full(n, 2.5)
                short_p = np.full(n, .05)
            delay = np.where(rng.random(n) < p_late, np.ceil(rng.exponential(mean_delay)), 0).astype(int)
            first = promised + delay
            short = rng.random(n) < short_p
            frac = np.where(short, rng.uniform(.78, .97, n), 1.0)
            second = first + rng.integers(1, 7, n)
            pay_day = np.where(internal, first + 45,
                               np.where(credit, first + 30 * cm, first + rng.integers(0, 7, n)))
            ids = np.arange(po_seq + 1, po_seq + n + 1)
            po_seq += n
            po_parts.append(pd.DataFrame({
                "po_id": ids, "order_day": order_day, "project_id": p["project_id"], "sub_id": p["sub"],
                "supplier_id": sup, "material_id": mid, "qty": q, "unit_price": np.round(price, -1),
                "amount": np.round(amount, -3), "channel": channel, "credit_months": cm,
                "credit_premium_pct": np.round(prem * 100, 2), "promised_day": promised,
                "first_receipt_day": first, "m": m, "short": short}))
            grn_parts.append(pd.DataFrame({"po_id": ids, "day": first, "qty": q * frac, "seq": 1}))
            if short.any():
                grn_parts.append(pd.DataFrame({"po_id": ids[short], "day": second[short], "qty": q[short] * (1 - frac[short]), "seq": 2}))
            # cash: pay supplier; internal concrete moves money to the plant
            ext = ~internal
            add_cash(pay_day[ext], p["sub"], amount[ext], "پرداخت به تأمین‌کنندهٔ مصالح", -1, p["project_id"], ids[ext], "تأمین‌کنندگان")
            add_cash(pay_day[internal], p["sub"], amount[internal], "خرید بتن از کارخانهٔ گروه", -1, p["project_id"], ids[internal], "ستاوند بتن و مصالح")
            if internal.any():
                plant_int[m] += amount[internal].sum()
                add_cash(pay_day[internal], 4, amount[internal], "فروش بتن درون‌گروهی", +1, p["project_id"], ids[internal], "شرکت‌های گروه")
    # plant operating cost (cement, aggregate, fuel, crews), paid early next month
    add_cash([M_LAST[m] + 5], 4, [(EXT_M.get(m, 0.0) + plant_int[m]) * .62], "هزینهٔ تولید بتن", -1, None, -1,
             "تأمین‌کنندگان کارخانه")
    # month-end: the holding tops up any subsidiary that ran dry (reactive, no pooling)
    lo_d, hi_d = M_FIRST[m], M_LAST[m]
    for s in range(1, 7):
        bal = OPEN_BAL[s] + NET[s, A0:lo_d].sum() + np.cumsum(NET[s, lo_d:hi_d + 1])
        if bal.min() < FLOOR:
            first_bad = int(np.argmax(bal < FLOOR))
            amt = 2 * FLOOR - bal[first_bad:].min()
            day = lo_d + first_bad
            add_cash([day], s, [amt], "تزریق منابع از ستاد", +1, None, -1, "ستاد هلدینگ")
            add_cash([day], 0, [amt], "تزریق منابع به شرکت‌ها", -1, None, s, SUBS.name_fa[s])
            inject_rows.append((s, m, day, amt))
    if m % 6 == 5:
        log(f"  month {m}: POs so far {po_seq:,}")

PO = pd.concat(po_parts, ignore_index=True)
GRN = pd.concat(grn_parts, ignore_index=True)
log(f"purchase orders: {len(PO):,}, receipts: {len(GRN):,}")

# material cost accrues on first receipt
PO["accrual_m"] = month_of(PO.first_receipt_day.to_numpy())
acc = PO[PO.accrual_m < 99].groupby(["project_id", "accrual_m"]).amount.sum()
PM = PM.set_index(["project_id", "m"])
for (pid_, m_), v in acc.items():
    if (pid_, m_) in PM.index:
        PM.loc[(pid_, m_), "ac_material"] += v
PM = PM.reset_index()
PM["ac"] = PM.ac_material + PM.ac_other

# dividends: surplus subsidiaries pay up once a year, in Tir - cash idles in between
div_rows = []
for jy in (1402, 1403, 1404):
    day = JDAY[(jy, 4, 15)]
    for s in (4, 5):
        bal = OPEN_BAL[s] + NET[s, A0:day].sum()
        amt = max(0.0, .6 * (bal - BUFFER[s]))
        if amt > 0:
            add_cash([day], s, [amt], "پرداخت سود سهام به ستاد", -1, None, -1, "ستاد هلدینگ")
            add_cash([day], 0, [amt], "دریافت سود سهام از شرکت‌ها", +1, None, s, SUBS.name_fa[s])
            div_rows.append((s, jy, amt))

CASH = pd.concat(cash_parts, ignore_index=True).sort_values(["day", "sub_id"]).reset_index(drop=True)
CASH.insert(0, "txn_id", np.arange(1, len(CASH) + 1))
log(f"cash transactions: {len(CASH):,}")

# daily balances & idle cash
bal_rows = []
BAL = OPEN_BAL[:, None] + np.cumsum(NET[:, A0:], axis=1)          # 7 x 1096
OUT = np.where(NET[:, A0:] < 0, -NET[:, A0:], 0)
trail = pd.DataFrame(OUT.T).rolling(90, min_periods=20).mean().to_numpy().T * 30
trail = np.where(np.isnan(trail), BUFFER[:, None], trail)
IDLE = np.maximum(BAL - np.maximum(trail, 20e9), 0)
for s in range(7):
    bal_rows.append(pd.DataFrame({"date_key": cal.date_key.to_numpy()[A0:], "sub_id": s,
                                  "closing_balance": np.round(BAL[s], -6), "buffer_30d": np.round(trail[s], -6),
                                  "idle_cash": np.round(IDLE[s], -6)}))
BALDF = pd.concat(bal_rows, ignore_index=True)

# ================================================================= e-invoices (S4)
inv_parts = []


def add_invoices(sub, issue_days, amounts, kind, median_lag, sigma, unreg_p, ref):
    issue_days = np.asarray(issue_days)
    amounts = np.asarray(amounts, dtype=float)
    n = len(issue_days)
    lag = np.maximum(np.round(rng.lognormal(np.log(median_lag), sigma, n)), 0).astype(int)
    unreg = rng.random(n) < unreg_p
    reg = issue_days + lag
    keep = issue_days <= A_END
    inv_parts.append(pd.DataFrame({
        "sub_id": sub, "issue_day": issue_days[keep], "amount": np.round(amounts[keep], -3), "kind": kind,
        "reg_day": np.where(unreg[keep] | (reg[keep] > A_END), -1, reg[keep]), "ref_id": np.asarray(ref)[keep] if np.ndim(ref) else ref}))


add_invoices(4, EXT.day.to_numpy(), EXT.amount.to_numpy(), "فروش بتن", 9.5, .75, .012, np.arange(len(EXT)))
add_invoices(5, RENT.inv_day.to_numpy(), RENT.amount.to_numpy(), "اجاره و شارژ", 12.5, .55, .02, RENT.tenant_id.to_numpy())
add_invoices(3, BILLS.inv_day.to_numpy(), BILLS.amount.to_numpy(), "صورت‌وضعیت", 3, .6, .0, BILLS.project_id.to_numpy())
sale_days = (pd.to_datetime(SALES.contract_date_key.astype(str)) - pd.Timestamp(CAL_START)).dt.days.to_numpy()
win_sales = sale_days >= A0
for s in (1, 2, 6):
    msk = win_sales & (SALES.project_id.map(SUB_OF).to_numpy() == s)
    add_invoices(s, sale_days[msk], SALES.contract_value.to_numpy()[msk] * SALES.down_payment_pct.to_numpy()[msk],
                 "پیش‌فروش واحد", 3, .6, .003, SALES.sale_id.to_numpy()[msk])
int_po = PO[(PO.supplier_id == 1) & (PO.first_receipt_day <= A_END)]
add_invoices(4, int_po.first_receipt_day.to_numpy(), int_po.amount.to_numpy(), "فروش بتن درون‌گروهی", 4, .5, .0, int_po.po_id.to_numpy())
INV = pd.concat(inv_parts, ignore_index=True).sort_values("issue_day").reset_index(drop=True)
INV.insert(0, "invoice_id", np.arange(1, len(INV) + 1))
INV["vat"] = np.round(INV.amount * .10, -3)
log(f"invoices: {len(INV):,}")

# ================================================================ ETL quality log
rej = []
dup = PO.sample(frac=.0025, random_state=7)
rej += [("fact_purchase_order", int(r), "ردیف تکراری با کد سفارش یکسان", "حذف") for r in dup.po_id]
miss = PO.sample(frac=.0008, random_state=8)
rej += [("fact_purchase_order", int(r), "شناسهٔ تأمین‌کننده خالی", "قرنطینه") for r in miss.po_id]
neg = PO.sample(frac=.0003, random_state=9)
rej += [("fact_purchase_order", int(r), "مقدار منفی", "قرنطینه") for r in neg.po_id]
early = GRN.sample(frac=.0005, random_state=10)
rej += [("fact_goods_receipt", int(r), "تاریخ رسید قبل از تاریخ سفارش", "قرنطینه") for r in early.po_id]
badinv = INST.sample(frac=.001, random_state=11)
rej += [("fact_installment", int(r), "مبلغ قسط با قرارداد هم‌خوانی ندارد", "اصلاح و بارگذاری") for r in badinv.installment_id]
REJ = pd.DataFrame(rej, columns=["source_table", "source_key", "rule_fa", "action_fa"])
REJ.insert(0, "rejected_id", np.arange(1, len(REJ) + 1))

# ===================================================================== write
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
con = sqlite3.connect(DB_PATH)
con.execute("PRAGMA journal_mode=OFF")
con.execute("PRAGMA synchronous=OFF")

ABS_KEY = cal.date_key.to_numpy()


def key_col(days):
    """Day index -> nullable yyyymmdd; negative means 'not yet'."""
    days = np.asarray(days, dtype="int64")
    return pd.Series(np.where(days >= 0, dkey(np.maximum(days, 0)), -1)).replace(-1, pd.NA).astype("Int64")


cal.to_sql("dim_date", con, index=False)
SUBS.to_sql("dim_subsidiary", con, index=False)
CITIES.to_sql("dim_city", con, index=False)
MATERIALS[["material_id", "name_fa", "unit_fa", "family", "base_price"]].rename(
    columns={"base_price": "base_price_1402"}).to_sql("dim_material", con, index=False)
SUPPLIERS.drop(columns=["late_rate"]).to_sql("dim_supplier", con, index=False)
pd.DataFrame(cust_rows, columns=["customer_id", "role_fa", "segment_fa", "legal_type_fa"]).to_sql("dim_customer", con, index=False)

proj_df = pd.DataFrame([{
    "project_id": p["project_id"], "code": p["code"], "name_fa": p["name"], "sub_id": p["sub"],
    "city_id": p["city"], "type_fa": p["type_fa"], "kind": p["kind"], "units": p["units"],
    "units_for_sale": p.get("units_for_sale", 0), "avg_unit_m2": round(p["avg_m2"], 1),
    "gross_m2": round(p["gross_m2"]), "start_period": (1402 + (p["start"] + 24) // 12 - 2) * 100 + (p["start"] + 24) % 12 + 1,
    "duration_months": p["dur"], "bac_bn_1402": round(p["bac"], 1), "land_cost_bn": round(p["land"], 1),
    "list_price_m2_1402_mtoman": round(p["base_price"], 1), "plan_margin": None if p["plan_margin"] is None else round(p["plan_margin"], 4),
    "revenue_plan_bn": round(p["rev_plan"], 1), "cost_plan_bn": round(p["eac_plan"], 1),
    "progress_at_1402": round(float(p["A_cum"][IDX(-1)]), 4), "is_indexed_pilot": int(p["indexed_from"] is not None),
    "client_fa": {"civil": "کارفرمای دولتی", "plant": "داخلی", "fitout": "داخلی"}.get(p["kind"], "فروش به خریدار"),
} for p in PROJ])
proj_df.to_sql("dim_project", con, index=False)

PM_out = PM.copy()
PM_out["period"] = (1402 + PM_out.m // 12) * 100 + PM_out.m % 12 + 1
for c in ("pv", "ev", "ac_other", "ac_material", "ac"):
    PM_out[c] = np.round(PM_out[c], -6)
PM_out[["project_id", "period", "m", "pv", "ev", "ac_material", "ac_other", "ac", "planned_pct", "actual_pct"]].rename(
    columns={"m": "month_index"}).to_sql("fact_project_month", con, index=False)

po_out = PO.copy()
po_out["order_date_key"] = dkey(po_out.order_day)
po_out["promised_date_key"] = dkey(po_out.promised_day)
po_out["first_receipt_date_key"] = key_col(np.where(po_out.first_receipt_day <= A_END, po_out.first_receipt_day, -1))
po_out["on_time"] = (po_out.first_receipt_day <= po_out.promised_day).astype(int)
po_out["in_full"] = (~po_out.short).astype(int)
po_out["status_fa"] = np.where(po_out.first_receipt_day <= A_END, "تحویل‌شده", "در انتظار تحویل")
po_out["payment_terms_fa"] = np.where(po_out.credit_months > 0, "اعتباری " + po_out.credit_months.astype(str) + " ماهه", "نقدی")
po_out = po_out[po_out.order_day <= A_END]
po_out[["po_id", "order_date_key", "project_id", "sub_id", "supplier_id", "material_id", "qty", "unit_price", "amount",
        "channel", "payment_terms_fa", "credit_months", "credit_premium_pct", "promised_date_key",
        "first_receipt_date_key", "on_time", "in_full", "status_fa"]].rename(columns={"channel": "channel_fa"}).to_sql(
    "fact_purchase_order", con, index=False, chunksize=50000)
grn_out = GRN[GRN.day <= A_END].copy()
grn_out["receipt_date_key"] = dkey(grn_out.day)
grn_out["qty"] = grn_out.qty.round(2)
grn_out = grn_out.sort_values(["po_id", "seq"]).reset_index(drop=True)
grn_out.insert(0, "receipt_id", np.arange(1, len(grn_out) + 1))
grn_out[["receipt_id", "po_id", "seq", "receipt_date_key", "qty"]].rename(columns={"seq": "receipt_seq", "qty": "qty_received"}).to_sql(
    "fact_goods_receipt", con, index=False, chunksize=50000)

SALES.to_sql("fact_unit_sale", con, index=False)

# ready-mix plant dispatches: external customers + deliveries to group projects
ext_out = pd.DataFrame({"date_key": dkey(EXT.day), "customer_id": EXT.customer_id, "project_id": pd.NA,
                        "qty_m3": EXT.qty_m3, "unit_price": np.round(EXT.price, -1), "amount": np.round(EXT.amount, -3),
                        "channel_fa": "مشتری بیرونی"})
int_out = PO[(PO.supplier_id == 1) & (PO.first_receipt_day <= A_END)]
int_out = pd.DataFrame({"date_key": dkey(int_out.first_receipt_day), "customer_id": pd.NA, "project_id": int_out.project_id,
                        "qty_m3": int_out.qty, "unit_price": int_out.unit_price, "amount": int_out.amount,
                        "channel_fa": "پروژه‌های گروه"})
DISP = pd.concat([ext_out, int_out], ignore_index=True).sort_values("date_key").reset_index(drop=True)
DISP.insert(0, "dispatch_id", np.arange(1, len(DISP) + 1))
DISP.to_sql("fact_plant_dispatch", con, index=False, chunksize=50000)
disp_m = DISP.assign(period=DISP.date_key // 100).groupby("period").qty_m3.sum()
PLANT_CAPACITY = float(np.ceil(max(disp_m.mean() / .70, disp_m.max() * 1.04) / 500) * 500)
INST.to_sql("fact_installment", con, index=False, chunksize=50000)

inv_out = INV.copy()
inv_out["issue_date_key"] = dkey(inv_out.issue_day)
inv_out["registered_date_key"] = key_col(inv_out.reg_day)
inv_out["registration_lag_days"] = np.where(inv_out.reg_day >= 0, inv_out.reg_day - inv_out.issue_day, np.nan)
inv_out["status_fa"] = np.where(inv_out.reg_day >= 0, "ثبت‌شده در سامانهٔ مودیان", "ثبت‌نشده")
inv_out[["invoice_id", "sub_id", "issue_date_key", "kind", "amount", "vat", "registered_date_key",
         "registration_lag_days", "status_fa"]].rename(columns={"kind": "invoice_type_fa"}).to_sql("fact_invoice", con, index=False, chunksize=50000)

cash_out = CASH.copy()
cash_out["date_key"] = dkey(cash_out.day)
cash_out["project_id"] = cash_out.project_id.replace(-1, pd.NA).astype("Int64")
cash_out["ref_id"] = cash_out.ref_id.replace(-1, pd.NA).astype("Int64")
cash_out[["txn_id", "date_key", "sub_id", "direction", "category", "amount", "project_id", "ref_id", "counterparty"]].rename(
    columns={"category": "category_fa", "counterparty": "counterparty_fa"}).to_sql("fact_cash_txn", con, index=False, chunksize=50000)
BALDF.to_sql("fact_cash_balance_daily", con, index=False, chunksize=50000)

opp_out = OPP.copy()
opp_out["received_date_key"] = dkey(opp_out.received_day)
opp_out["decision_date_key"] = key_col(opp_out.decision_day.fillna(-1).astype(int))
opp_out.drop(columns=["received_day", "decision_day"]).to_sql("fact_opportunity", con, index=False)
ost = OSTAGE.copy()
ost["entered_date_key"] = dkey(ost.entered_day)
ost["exited_date_key"] = key_col(ost.exited_day.fillna(-1).astype(int))
ost.drop(columns=["entered_day", "exited_day"]).to_sql("fact_opportunity_stage", con, index=False)

idx_rows = []
for m in range(-12, M):
    idx_rows.append(((1402 + (m + 12) // 12 - 1) * 100 + (m + 12) % 12 + 1, m, ix(CI["general"], m), ix(CI["steel"], m),
                     ix(CI["cement"], m), ix(CPI, m), ix(CPI_G, m), ix(HP, m)))
pd.DataFrame(idx_rows, columns=["period", "month_index", "construction_cost_index", "steel_index", "cement_index",
                                "cpi_index", "cpi_monthly_growth", "housing_price_index"]).to_sql("ref_price_index", con, index=False)
REJ.to_sql("etl_rejected_row", con, index=False)
checks = [
    ("fact_purchase_order", "کد سفارش یکتا", len(PO), int(len(dup))),
    ("fact_purchase_order", "شناسهٔ تأمین‌کننده معتبر", len(PO), int(len(miss))),
    ("fact_purchase_order", "مقدار مثبت", len(PO), int(len(neg))),
    ("fact_goods_receipt", "رسید بعد از سفارش", len(GRN), int(len(early))),
    ("fact_installment", "تطبیق مبلغ قسط با قرارداد", len(INST), int(len(badinv))),
    ("fact_cash_txn", "جمع گردش نقد با مانده‌ها", len(CASH), 0),
    ("fact_invoice", "تاریخ ثبت بعد از صدور", len(INV), 0),
]
pd.DataFrame(checks, columns=["table_name", "rule_fa", "rows_checked", "rows_failed"]).to_sql("etl_check", con, index=False)
pd.DataFrame(inject_rows, columns=["sub_id", "month_index", "day", "amount"]).to_sql("aux_injection", con, index=False)
pd.DataFrame(credit_log, columns=["month_index"] + [f"credit_share_{s}" for s in range(7)] + [f"bal_start_{s}" for s in range(7)]).to_sql(
    "aux_credit_policy", con, index=False)

meta = {
    "company_fa": "گروه سرمایه‌گذاری و ساختمانی ستاوند (ساختگی)",
    "window": "1402/01/01 - 1404/12/29",
    "generated": time.strftime("%Y-%m-%d %H:%M"),
    "seed": 1404,
    "late_fee_annual": PENALTY_ANNUAL,
    "credit_premium_monthly": .035,
    "plant_capacity_m3_month": PLANT_CAPACITY,
    "land_cash_share": LAND_CASH,
    "srm_co_invest": CO_INVEST,
    "subsidiary_floor_bn": FLOOR / 1e9,
    "opening_balances_bn": dict(zip(SUBS.code, (OPEN_BAL / 1e9).round(0).tolist())),
    "note_fa": "تمام نام‌ها، اعداد و رویدادها ساختگی‌اند.",
}
pd.DataFrame([(k, json.dumps(v, ensure_ascii=False)) for k, v in meta.items()], columns=["key", "value"]).to_sql("ref_meta", con, index=False)

for stmt in [
    "CREATE UNIQUE INDEX ix_po_id ON fact_purchase_order(po_id)", "CREATE INDEX ix_po_proj ON fact_purchase_order(project_id)", "CREATE INDEX ix_po_date ON fact_purchase_order(order_date_key)",
    "CREATE INDEX ix_po_sup ON fact_purchase_order(supplier_id)", "CREATE INDEX ix_grn_po ON fact_goods_receipt(po_id)",
    "CREATE INDEX ix_inst_sale ON fact_installment(sale_id)", "CREATE INDEX ix_sale_proj ON fact_unit_sale(project_id)",
    "CREATE INDEX ix_cash_date ON fact_cash_txn(date_key)", "CREATE INDEX ix_cash_sub ON fact_cash_txn(sub_id)",
    "CREATE INDEX ix_inv_sub ON fact_invoice(sub_id)", "CREATE INDEX ix_bal ON fact_cash_balance_daily(sub_id, date_key)",
    "CREATE UNIQUE INDEX ix_date ON dim_date(date_key)", "CREATE INDEX ix_pm ON fact_project_month(project_id, period)",
]:
    con.execute(stmt)
con.commit()
counts = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
          for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")}
con.close()
log("row counts: " + json.dumps(counts, ensure_ascii=False))
log(f"total rows: {sum(counts.values()):,}  size: {os.path.getsize(DB_PATH) / 1e6:.1f} MB")

# ================================================================ diagnostics
print("\n--- yearly cash by subsidiary (bn Toman) ---")
for s in range(7):
    b = BAL[s]
    yrs = []
    for y in range(3):
        sl = slice(y * 365, min((y + 1) * 365 + (1 if y == 1 else 0), 1096))
        yrs.append(f"{1402 + y}: min {b[sl].min() / 1e9:7.0f} avg {b[sl].mean() / 1e9:7.0f} idle {IDLE[s][sl].mean() / 1e9:6.0f}")
    print(SUBS.code[s], " | ".join(yrs))
cl = pd.DataFrame(credit_log, columns=["m"] + [f"c{s}" for s in range(7)] + [f"b{s}" for s in range(7)])
print("credit share by year (MSK, TJR, OMR):", [round(cl[cl.m // 12 == y][["c1", "c2", "c3"]].mean().mean(), 2) for y in range(3)])
inj = pd.DataFrame(inject_rows, columns=["s", "m", "d", "a"])
print("injections bn by sub:", (inj.groupby("s").a.sum() / 1e9).round(0).to_dict())
print("dividends:", [(s, y, round(a / 1e9)) for s, y, a in div_rows])
po_y = PO.assign(y=PO.m // 12)
prem = po_y[po_y.credit_months > 0]
print("credit premium paid bn by year:", (prem.groupby("y").apply(lambda g: (g.amount - g.amount / (1 + g.credit_premium_pct / 100)).sum()) / 1e9).round(1).to_dict())
for p in PROJ:
    if p["code"] in ("MSK-01", "MSK-02", "MSK-03", "TJR-01", "TJR-02", "TJR-03"):
        print(p["code"], "plan margin", round(p["plan_margin"], 3), "land", round(p["land"]), "bac", round(p["bac"]),
              "sold", p.get("units_sold"), "/", p.get("units_for_sale"))
