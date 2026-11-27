(() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTg = !!(tg && tg.initData);
  const $ = (s) => document.querySelector(s);

  // ---------------------------------------------------------------- i18n
  const T = {
    uz: {
      heroK: "Yangi kolleksiya", heroT: "Original sifat — sizning siluetingiz",
      perk1: "🇺🇿 Butun O'zbekiston bo'ylab", perk2: "✈️ 7–14 kun", perk3: "💳 50% oldindan to'lov",
      all: "Hammasi", chooseSize: "O'lchamni tanlang", qty: "Soni",
      cart: "Savat", empty: "Savatingiz bo'sh", toCatalog: "Katalogga qaytish",
      checkout: "Rasmiylashtirish", fName: "Ism va familiya", fPhone: "Telefon raqam",
      fRegion: "Viloyat", fAddress: "Manzil (shahar/tuman, ko'cha, uy)", fComment: "Izoh (ixtiyoriy)",
      size: "O'lcham", remove: "O'chirish", items: "Mahsulotlar", total: "Jami",
      prepay: "Oldindan to'lov (50%)", rest: "Qabul qilishda",
      note: "Yetkazish muddati 7–14 kun. Menejer to'lov bo'yicha siz bilan bog'lanadi.",
      add: "Savatga qo'shish", added: "Savatga qo'shildi ✓", pickSize: "Avval o'lchamni tanlang",
      goCart: "Savat", proceed: "Rasmiylashtirish", send: "Buyurtmani yuborish", sending: "Yuborilmoqda…",
      okT: "Buyurtma qabul qilindi!", okText: (id, m) => `Buyurtma raqami #${id}. Tez orada menejerimiz ${m} siz bilan bog'lanadi.`,
      fill: "Iltimos, barcha maydonlarni to'ldiring", fail: "Xatolik yuz berdi. Qayta urinib ko'ring.",
    },
    ru: {
      heroK: "Новая коллекция", heroT: "Оригинальное качество — ваш силуэт",
      perk1: "🇺🇿 По всему Узбекистану", perk2: "✈️ 7–14 дней", perk3: "💳 Предоплата 50%",
      all: "Все", chooseSize: "Выберите размер", qty: "Количество",
      cart: "Корзина", empty: "Ваша корзина пуста", toCatalog: "Вернуться в каталог",
      checkout: "Оформление", fName: "Имя и фамилия", fPhone: "Телефон",
      fRegion: "Регион", fAddress: "Адрес (город/район, улица, дом)", fComment: "Комментарий (необязательно)",
      size: "Размер", remove: "Удалить", items: "Товары", total: "Итого",
      prepay: "Предоплата (50%)", rest: "При получении",
      note: "Срок доставки 7–14 дней. Менеджер свяжется с вами по оплате.",
      add: "В корзину", added: "Добавлено в корзину ✓", pickSize: "Сначала выберите размер",
      goCart: "Корзина", proceed: "Оформить заказ", send: "Отправить заказ", sending: "Отправка…",
      okT: "Заказ принят!", okText: (id, m) => `Номер заказа #${id}. Наш менеджер ${m} скоро свяжется с вами.`,
      fill: "Пожалуйста, заполните все поля", fail: "Произошла ошибка. Попробуйте ещё раз.",
    },
  };
  const REGIONS = {
    uz: ["Toshkent shahri", "Toshkent viloyati", "Andijon", "Buxoro", "Farg'ona", "Jizzax", "Xorazm", "Namangan", "Navoiy", "Qashqadaryo", "Qoraqalpog'iston", "Samarqand", "Sirdaryo", "Surxondaryo"],
    ru: ["г. Ташкент", "Ташкентская обл.", "Андижан", "Бухара", "Фергана", "Джизак", "Хорезм", "Наманган", "Навои", "Кашкадарья", "Каракалпакстан", "Самарканд", "Сырдарья", "Сурхандарья"],
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const tgLang = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code;
  const S = {
    lang: store.get("lang", tgLang === "ru" ? "ru" : "uz"),
    data: null, cat: "all", view: "catalog",
    cart: store.get("cart", []),        // [{id, size, qty}]
    product: null, size: null, qty: 1,
  };
  const t = (k) => T[S.lang][k];
  const money = (n) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " " + S.data.settings.currency[S.lang];
  const prod = (id) => S.data.products.find((p) => p.id === id);
  const haptic = (type) => { try { tg.HapticFeedback.impactOccurred(type || "light"); } catch {} };

  // ---------------------------------------------------------------- telegram setup
  if (tg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor("#0D2C6B"); tg.setBackgroundColor(tg.colorScheme === "dark" ? "#0A1A3D" : "#F6F1E6"); } catch {}
    if (tg.colorScheme === "dark") document.documentElement.dataset.theme = "dark";
    tg.onEvent("themeChanged", () => { document.documentElement.dataset.theme = tg.colorScheme; });
    tg.BackButton.onClick(back);
  }

  // Main action button: Telegram MainButton inside Telegram, a fixed button in a normal browser.
  let actionFn = null;
  const fb = $("#fallbackBtn");
  function onAction() { if (actionFn) actionFn(); }
  if (inTg) tg.MainButton.onClick(onAction); else fb.onclick = onAction;
  function setAction(text, fn) {
    actionFn = fn;
    if (inTg) {
      if (!text) return tg.MainButton.hide();
      tg.MainButton.setParams({ text, color: "#0D2C6B", text_color: "#F6F1E6", is_visible: true, is_active: true });
    } else {
      fb.hidden = !text; fb.textContent = text || ""; fb.disabled = false;
    }
  }
  function setLoading(on) {
    if (inTg) { on ? tg.MainButton.showProgress(false) : tg.MainButton.hideProgress(); }
    else { fb.disabled = on; if (on) fb.textContent = t("sending"); }
  }
  function toast(msg) {
    const el = $("#toast"); el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 1600);
  }

  // ---------------------------------------------------------------- cart
  const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);
  const cartTotal = () => S.cart.reduce((a, i) => { const p = prod(i.id); return a + (p ? p.price * i.qty : 0); }, 0);
  function saveCart() {
    S.cart = S.cart.filter((i) => prod(i.id) && i.qty > 0);
    store.set("cart", S.cart);
    const n = cartCount(), b = $("#cartCount");
    b.hidden = !n; b.textContent = n;
  }
  function addToCart(id, size, qty) {
    const ex = S.cart.find((i) => i.id === id && i.size === size);
    if (ex) ex.qty = Math.min(50, ex.qty + qty); else S.cart.push({ id, size, qty });
    saveCart();
  }

  // ---------------------------------------------------------------- views
  const VIEWS = ["catalog", "product", "cart", "checkout", "success"];
  function go(view) {
    S.view = view;
    VIEWS.forEach((v) => ($("#v-" + v).hidden = v !== view));
    window.scrollTo(0, 0);
    if (tg) (view === "catalog" || view === "success") ? tg.BackButton.hide() : tg.BackButton.show();
    render();
  }
  function back() {
    go(S.view === "checkout" ? "cart" : "catalog");
  }

  function render() {
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $("#langBtn").textContent = S.lang === "uz" ? "RU" : "UZ";
    document.documentElement.lang = S.lang;
    ({ catalog: renderCatalog, product: renderProduct, cart: renderCart, checkout: renderCheckout, success: () => setAction(null) })[S.view]();
  }

  function renderCatalog() {
    const cats = [{ id: "all", uz: t("all"), ru: t("all") }, ...S.data.categories];
    $("#cats").innerHTML = cats.map((c) => `<button class="cat ${S.cat === c.id ? "on" : ""}" data-cat="${c.id}">${esc(c[S.lang])}</button>`).join("");
    const list = S.data.products.filter((p) => p.in_stock !== false && (S.cat === "all" || p.category === S.cat));
    $("#grid").innerHTML = list.map((p) => `
      <button class="card" data-id="${p.id}">
        <div class="card-wrap">
          <img src="${p.images[0]}" alt="${esc(p.title[S.lang])}" loading="lazy">
          ${p.old_price ? `<span class="sale">−${Math.round(100 - (p.price / p.old_price) * 100)}%</span>` : ""}
        </div>
        <div class="info"><p class="t">${esc(p.title[S.lang])}</p>
          <span class="pr">${money(p.price)}</span>${p.old_price ? `<s class="old">${money(p.old_price)}</s>` : ""}</div>
      </button>`).join("");
    const n = cartCount();
    setAction(n ? `${t("goCart")} (${n}) · ${money(cartTotal())}` : null, () => go("cart"));
  }

  function openProduct(id) { S.product = prod(id); S.size = null; S.qty = 1; go("product"); }
  function renderProduct() {
    const p = S.product;
    $("#pImg").src = p.images[0]; $("#pImg").alt = p.title[S.lang];
    $("#pTitle").textContent = p.title[S.lang];
    $("#pPrice").textContent = money(p.price);
    $("#pOld").textContent = p.old_price ? money(p.old_price) : "";
    $("#pDesc").textContent = (p.description && p.description[S.lang]) || "";
    $("#sizes").innerHTML = p.sizes.map((s) => `<button class="size ${S.size === s ? "on" : ""}" data-size="${s}">${s}</button>`).join("");
    $("#qVal").textContent = S.qty;
    setAction(`${t("add")} · ${money(p.price * S.qty)}`, () => {
      if (!S.size) {
        const el = $("#sizes"); el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
        try { tg.HapticFeedback.notificationOccurred("error"); } catch {}
        return toast(t("pickSize"));
      }
      addToCart(p.id, S.size, S.qty); haptic("medium"); toast(t("added")); go("catalog");
    });
  }

  function summaryHtml() {
    const total = cartTotal(), pre = Math.round(total * S.data.settings.prepay_percent / 100);
    return `<div class="row"><span>${t("items")} (${cartCount()})</span><span>${money(total)}</span></div>
      <div class="row"><span>${t("prepay")}</span><span>${money(pre)}</span></div>
      <div class="row"><span>${t("rest")}</span><span>${money(total - pre)}</span></div>
      <div class="row total"><span>${t("total")}</span><span>${money(total)}</span></div>
      <p class="note">${t("note")}</p>`;
  }

  function renderCart() {
    saveCart();
    const empty = !S.cart.length;
    $("#cartEmpty").hidden = !empty; $("#cartSum").hidden = empty;
    $("#cartList").innerHTML = S.cart.map((i, idx) => {
      const p = prod(i.id);
      return `<div class="line">
        <img src="${p.images[0]}" alt="">
        <div><p class="t">${esc(p.title[S.lang])}</p><p class="s">${t("size")}: <b>${i.size}</b> · ${money(p.price)}</p>
          <div class="stepper"><button data-dec="${idx}">−</button><span>${i.qty}</span><button data-inc="${idx}">+</button></div></div>
        <div class="r"><b>${money(p.price * i.qty)}</b><button class="del" data-del="${idx}">${t("remove")}</button></div>
      </div>`;
    }).join("");
    $("#cartSum").innerHTML = empty ? "" : summaryHtml();
    setAction(empty ? null : `${t("proceed")} · ${money(cartTotal())}`, () => go("checkout"));
  }

  function renderCheckout() {
    if (!S.cart.length) return go("cart");
    const sel = $("#region"), cur = sel.value;
    sel.innerHTML = `<option value="" disabled ${cur ? "" : "selected"}>—</option>` +
      REGIONS[S.lang].map((r) => `<option ${r === cur ? "selected" : ""}>${r}</option>`).join("");
    $("#checkoutSum").innerHTML = summaryHtml();
    $("#formErr").hidden = true;
    setAction(t("send"), submitOrder);
  }

  async function submitOrder() {
    const f = $("#form"), fd = Object.fromEntries(new FormData(f));
    let ok = true;
    for (const el of f.querySelectorAll("[required]")) {
      const bad = !el.value.trim() || (el.name === "phone" && el.value.replace(/\D/g, "").length < 9);
      el.classList.toggle("bad", bad); if (bad) ok = false;
    }
    if (!ok) { $("#formErr").textContent = t("fill"); $("#formErr").hidden = false; return; }
    store.set("customer", { name: fd.name, phone: fd.phone, region: fd.region, address: fd.address });

    setLoading(true);
    try {
      const r = await fetch("/api/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: tg ? tg.initData : "", items: S.cart, ...fd }),
      });
      const res = await r.json();
      if (!r.ok) throw new Error(res.detail || "error");
      S.cart = []; saveCart();
      try { tg.HapticFeedback.notificationOccurred("success"); } catch {}
      $("#okText").textContent = t("okText")(res.order_id, S.data.settings.manager);
      go("success");
    } catch (e) {
      $("#formErr").textContent = t("fail") + (typeof e.message === "string" && e.message !== "error" ? ` (${e.message})` : "");
      $("#formErr").hidden = false;
    } finally { setLoading(false); if (S.view === "checkout") setAction(t("send"), submitOrder); }
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------------------------------------------------------------- events
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button"); if (!el) return;
    const d = el.dataset;
    if (d.cat) { S.cat = d.cat; haptic(); renderCatalog(); }
    else if (d.id) openProduct(d.id);
    else if (d.size) { S.size = d.size; haptic(); renderProduct(); }
    else if (d.inc) { S.cart[+d.inc].qty = Math.min(50, S.cart[+d.inc].qty + 1); haptic(); renderCart(); }
    else if (d.dec) { const i = S.cart[+d.dec]; i.qty -= 1; haptic(); renderCart(); }
    else if (d.del) { S.cart.splice(+d.del, 1); haptic(); renderCart(); }
    else if (d.go) go(d.go);
  });
  $("#qPlus").onclick = () => { S.qty = Math.min(50, S.qty + 1); haptic(); renderProduct(); };
  $("#qMinus").onclick = () => { S.qty = Math.max(1, S.qty - 1); haptic(); renderProduct(); };
  $("#cartBtn").onclick = () => go("cart");
  $("#langBtn").onclick = () => { S.lang = S.lang === "uz" ? "ru" : "uz"; store.set("lang", S.lang); render(); };

  // ---------------------------------------------------------------- boot
  fetch("/api/catalog").then((r) => r.json()).then((data) => {
    S.data = data;
    const c = store.get("customer", null), f = $("#form");
    if (c) { for (const k in c) if (f.elements[k] && k !== "region") f.elements[k].value = c[k]; }
    else if (tg && tg.initDataUnsafe.user) f.elements.name.value = [tg.initDataUnsafe.user.first_name, tg.initDataUnsafe.user.last_name].filter(Boolean).join(" ");
    saveCart(); go("catalog");
  });
})();
