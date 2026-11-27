"""
Siluet Store — Telegram bot + Mini App backend.

One process runs:
  * aiogram bot (long polling): /start shows the "Open shop" button
  * FastAPI web server: serves the Mini App (webapp/) and its API
      GET  /api/catalog  -> products.json
      POST /api/order    -> validates Telegram initData, stores order,
                            sends it to the admin chat and confirms to the customer
"""
import asyncio
import hashlib
import hmac
import html
import json
import os
import sqlite3
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import parse_qsl

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "").rstrip("/")          # public https URL of this server
ADMIN_CHAT_ID = int(os.getenv("ADMIN_CHAT_ID", "0") or 0)       # where orders are sent
DEV_MODE = os.getenv("DEV_MODE", "0") == "1"                    # allow orders from a plain browser
PORT = int(os.getenv("PORT", "8000"))

CATALOG_FILE = BASE / "products.json"
DB_FILE = BASE / "orders.db"


# ---------------------------------------------------------------- storage
def db():
    con = sqlite3.connect(DB_FILE)
    con.execute(
        """CREATE TABLE IF NOT EXISTS orders(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER, user_id INTEGER, username TEXT,
            name TEXT, phone TEXT, region TEXT, address TEXT, comment TEXT,
            items TEXT, total INTEGER, prepay INTEGER, status TEXT DEFAULT 'new')"""
    )
    return con


def load_catalog() -> dict:
    cat = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    rate = cat["settings"].get("usd_rate", 0)
    for p in cat["products"]:
        # Dollar-priced items are converted to so'm and rounded to 1 000.
        if p.get("price_usd") is not None:
            p["price"] = int(round(p["price_usd"] * rate / 1000) * 1000)
        p.setdefault("options", [])
    return cat


def option_text(p: dict, chosen: dict) -> str:
    return ", ".join(chosen[o["key"]] for o in p["options"] if o["key"] in chosen)


def fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


# ---------------------------------------------------------------- telegram auth
def validate_init_data(init_data: str) -> dict:
    """Checks the Mini App initData signature. Returns the Telegram user dict."""
    if not init_data:
        if DEV_MODE:
            return {"id": 0, "first_name": "Dev"}
        raise HTTPException(401, "Open the shop from Telegram")
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received = pairs.pop("hash", "")
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise HTTPException(401, "Bad signature")
    if time.time() - int(pairs.get("auth_date", 0)) > 24 * 3600:
        raise HTTPException(401, "Session expired, reopen the shop")
    return json.loads(pairs.get("user", "{}"))


# ---------------------------------------------------------------- bot
bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML)) if BOT_TOKEN else None
dp = Dispatcher()


def shop_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🛍 Do'konni ochish / Открыть магазин",
                             web_app=WebAppInfo(url=WEBAPP_URL + "/"))
    ]])


@dp.message(CommandStart())
async def on_start(m: Message):
    await m.answer(
        "Assalomu alaykum! <b>Siluet store</b>ga xush kelibsiz 🤍\n\n"
        "▪️ Original sifat va tekshirilgan mahsulotlar\n"
        "▪️ O'zbekiston bo'ylab yetkazib berish 🇺🇿\n"
        "▪️ Yetkazish muddati: 7–14 kun ✈️\n"
        "▪️ Oldindan to'lov — 50%\n\n"
        "Pastdagi tugmani bosing, kiyimlarni tanlang va savatga qo'shing 👇\n\n"
        "<i>Нажмите кнопку ниже, выберите одежду и добавьте в корзину.</i>",
        reply_markup=shop_keyboard(),
    )


@dp.message(Command("id"))
async def on_id(m: Message):
    # Helper: send /id in the chat/group where you want to receive orders
    await m.answer(f"Chat ID: <code>{m.chat.id}</code>")


async def notify_order(order_id: int, user: dict, o: "OrderIn", lines: list, total: int, prepay: int):
    e = html.escape
    who = e(user.get("first_name", "")) + (f" (@{e(user['username'])})" if user.get("username") else "")
    items = "\n".join(
        f"• {e(l['title'])} — <b>{e(l['size'])}</b>"
        + (f", {e(l['options'])}" if l["options"] else "")
        + f" × {l['qty']} = {fmt(l['sum'])} so'm" for l in lines
    )
    text = (
        f"🛒 <b>Yangi buyurtma #{order_id}</b>\n\n"
        f"{items}\n\n"
        f"💰 Jami: <b>{fmt(total)} so'm</b>\n"
        f"💳 Oldindan to'lov (50%): <b>{fmt(prepay)} so'm</b>\n"
        f"📦 + kargo (14 000 so'm / 100 g) alohida\n\n"
        f"👤 {e(o.name)}\n📞 {e(o.phone)}\n📍 {e(o.region)}, {e(o.address)}\n"
        + (f"💬 {e(o.comment)}\n" if o.comment else "")
        + f"\nTelegram: {who}"
    )
    kb = None
    if user.get("id"):
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="✉️ Mijozga yozish", url=f"tg://user?id={user['id']}")
        ]])
    if ADMIN_CHAT_ID:
        await bot.send_message(ADMIN_CHAT_ID, text, reply_markup=kb)

    if user.get("id"):
        cat = load_catalog()
        confirm = (
            f"✅ Buyurtmangiz qabul qilindi! <b>#{order_id}</b>\n\n{items}\n\n"
            f"Jami: <b>{fmt(total)} so'm</b>\n"
            f"Oldindan to'lov: <b>{fmt(prepay)} so'm</b>\n\n"
            f"Tez orada menejerimiz siz bilan bog'lanadi: {e(cat['settings']['manager'])}\n"
            f"<i>Заказ принят! Менеджер скоро свяжется с вами.</i>"
        )
        try:
            await bot.send_message(user["id"], confirm)
        except Exception:
            pass  # user may not have started the bot


# ---------------------------------------------------------------- web
class CartItem(BaseModel):
    id: str
    size: str
    qty: int = Field(ge=1, le=50)
    opt: dict[str, str] = {}


class OrderIn(BaseModel):
    init_data: str = ""
    items: list[CartItem] = Field(min_length=1, max_length=50)
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=25)
    region: str = Field(min_length=2, max_length=60)
    address: str = Field(min_length=3, max_length=300)
    comment: str = Field("", max_length=500)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = None
    if bot:
        if WEBAPP_URL.startswith("https://"):
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(text="Do'kon", web_app=WebAppInfo(url=WEBAPP_URL + "/")))
        task = asyncio.create_task(dp.start_polling(bot, handle_signals=False))
    yield
    if task:
        await dp.stop_polling()
        task.cancel()


app = FastAPI(lifespan=lifespan)


@app.get("/api/catalog")
def catalog():
    return load_catalog()


@app.post("/api/order")
async def create_order(o: OrderIn):
    user = validate_init_data(o.init_data)
    cat = load_catalog()
    products = {p["id"]: p for p in cat["products"]}

    # Prices are always taken from the server catalog, never from the client.
    lines, total = [], 0
    for it in o.items:
        p = products.get(it.id)
        if not p or it.size not in p["sizes"] or not p.get("in_stock", True):
            raise HTTPException(400, f"Mahsulot mavjud emas: {it.id} {it.size}")
        for grp in p["options"]:
            if it.opt.get(grp["key"]) not in [v["uz"] for v in grp["values"]]:
                raise HTTPException(400, f"{p['title']['uz']}: {grp['name']['uz'].lower()} tanlanmagan")
        s = p["price"] * it.qty
        total += s
        lines.append({"id": p["id"], "title": p["title"]["uz"], "size": it.size,
                      "options": option_text(p, it.opt), "qty": it.qty, "price": p["price"], "sum": s})
    prepay = round(total * cat["settings"]["prepay_percent"] / 100)

    with db() as con:
        cur = con.execute(
            "INSERT INTO orders(created_at,user_id,username,name,phone,region,address,comment,items,total,prepay)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (int(time.time()), user.get("id"), user.get("username"), o.name, o.phone, o.region,
             o.address, o.comment, json.dumps(lines, ensure_ascii=False), total, prepay),
        )
        order_id = cur.lastrowid

    if bot:
        try:
            await notify_order(order_id, user, o, lines, total, prepay)
        except Exception as ex:  # order is saved anyway
            print("notify failed:", ex)
    return {"ok": True, "order_id": order_id, "total": total, "prepay": prepay}


app.mount("/static", StaticFiles(directory=BASE / "webapp"), name="static")


@app.get("/")
def index():
    return FileResponse(BASE / "webapp" / "index.html", headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    import uvicorn
    if not BOT_TOKEN:
        print("⚠️  BOT_TOKEN is empty — running the web shop only (no bot).")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
