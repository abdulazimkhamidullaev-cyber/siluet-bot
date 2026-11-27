# Siluet store — Telegram bot + Mini App

Customers open the shop from the bot, browse the catalog, pick a size (S–6XL),
add items to the cart (savat / корзина) and place an order. The order is saved
to `orders.db` and sent to your Telegram; the customer gets a confirmation.

## 1. Create the bot
1. In Telegram open **@BotFather** → `/newbot` → copy the token.
2. Copy `.env.example` to `.env` and put the token in `BOT_TOKEN`.

## 2. Run it
```
pip install -r requirements.txt
python main.py
```
Telegram only opens Mini Apps over **https**. For testing use a tunnel:
```
cloudflared tunnel --url http://localhost:8000
```
Put the https address it prints into `WEBAPP_URL` in `.env` and restart.
For production host it on any VPS / Railway / Render with a domain.

## 3. Get orders in Telegram
Send `/id` to the bot (or add the bot to a group and send `/id` there),
put that number into `ADMIN_CHAT_ID`, restart.

## 4. Add your products
Edit `products.json` (no restart needed). Put photos in `webapp/img/` and
reference them as `/static/img/your-photo.jpg`. Fields:
`id`, `category`, `title {uz, ru}`, `price`, `old_price` (or null),
`sizes`, `images`, `in_stock`, `description {uz, ru}`.
Prices are always recalculated on the server, so customers can't change them.
