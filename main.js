
const ADMIN_PASS = "1234"; // غيّرها قبل النشر
const LS_PRODUCTS = "st_products";
const LS_ORDERS = "st_orders";
const SS_ADMIN = "st_admin";

const CATEGORIES = [
  "تلفونات جديدة",
  "تلفونات مستعملة",
  "جرابات",
  "شواحن",
  "سماعات",
  "ساعات ذكية",
  "اكسسوارات كمبيوتر ولابتوب",
];

const CAT_ICONS = {
  "تلفونات جديدة": "📱",
  "تلفونات مستعملة": "📲",
  "جرابات": "🛡️",
  "شواحن": "🔌",
  "سماعات": "🎧",
  "ساعات ذكية": "⌚",
  "اكسسوارات كمبيوتر ولابتوب": "💻",
};

// محافظات مصر
const GOVERNORATES = [
  "القاهرة", "الجيزة", "القليوبية", "الإسكندرية", "الدقهلية", "الشرقية",
  "الغربية", "المنوفية", "البحيرة", "كفر الشيخ", "دمياط", "بورسعيد",
  "الإسماعيلية", "السويس", "شمال سيناء", "جنوب سيناء", "الفيوم",
  "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان",
  "البحر الأحمر", "الوادي الجديد", "مطروح",
];

const COND_LABEL = { new: "جديد", used: "مستعمل", refurb: "تجديد" };
const PAY_LABEL = { instapay: "إنستاباي", vodafone: "فودافون كاش" };

// ===== بيانات التحويل — غيّرها بأرقام المحل =====
const PAY_ACCOUNTS = {
  instapay: {
    label: "حوّل على حساب إنستاباي ده",
    number: "shop@instapay",
    owner: "باسم: سوق التلفونات",
  },
  vodafone: {
    label: "حوّل على رقم فودافون كاش ده",
    number: "01012345678",
    owner: "باسم: سوق التلفونات",
  },
};

const DEFAULT_PRODUCTS = [
  { id: uid(), name: "Samsung Galaxy A55", cat: "تلفونات جديدة", cond: "new", price: 17500, desc: "8GB رام - 256GB", img: "", available: true },
  { id: uid(), name: "iPhone 13", cat: "تلفونات مستعملة", cond: "used", price: 21000, desc: "بطارية 88% - بدون خدوش", img: "", available: true },
  { id: uid(), name: "جراب سيليكون", cat: "جرابات", cond: "new", price: 150, desc: "متاح لأغلب الموديلات", img: "", available: true },
  { id: uid(), name: "شاحن 25W Type-C", cat: "شواحن", cond: "new", price: 450, desc: "شحن سريع", img: "", available: true },
  { id: uid(), name: "AirPods Pro", cat: "سماعات", cond: "refurb", price: 3200, desc: "تجديد بضمان 3 شهور", img: "", available: false },
];

// ===== أدوات مساعدة =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// تحويل الأرقام العربية/الفارسية لإنجليزي
function toLatinDigits(str) {
  return String(str ?? "")
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776);
}

function formatPrice(n) {
  return Number(n).toLocaleString("ar-EG") + " جنيه";
}

function formatTime(ts) {
  return new Date(ts).toLocaleString("ar-EG", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(e);
    return false; // غالباً المساحة خلصت بسبب الصور
  }
}

// ضغط الصورة قبل التخزين عشان متملاش المساحة
function compressImage(file, maxSize = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("not image"));
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openImage(src) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<title>صورة</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh">
     <img src="${src}" style="max-width:100%;max-height:100vh"></body>`
  );
}

// ===== الحالة =====
let products = load(LS_PRODUCTS, null);
if (!products) {
  products = DEFAULT_PRODUCTS;
  save(LS_PRODUCTS, products);
}
let orders = load(LS_ORDERS, []);
let activeCat = "الكل";
let currentProduct = null;
let selectedPay = null;
let receiptData = "";
let newProductImg = "";

// ===== المتجر =====
function renderTabs() {
  const cats = ["الكل", ...CATEGORIES];
  $("catTabs").innerHTML = cats
    .map((c) => `<button class="tab ${c === activeCat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join("");
}

function renderGrid() {
  const list = activeCat === "الكل" ? products : products.filter((p) => p.cat === activeCat);

  if (!list.length) {
    $("productGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">مفيش منتجات في القسم ده حالياً</div>`;
    return;
  }

  $("productGrid").innerHTML = list
    .map((p) => {
      const badge = p.available
        ? `<span class="badge ${p.cond}">${COND_LABEL[p.cond] || ""}</span>`
        : `<span class="badge soldout">نفذت الكمية</span>`;
      const thumb = p.img
        ? `<img src="${p.img}" alt="${esc(p.name)}" loading="lazy">`
        : CAT_ICONS[p.cat] || "📦";
      return `
        <div class="card">
          ${badge}
          <div class="thumb">${thumb}</div>
          <div class="pname">${esc(p.name)}</div>
          <div class="pcat">${esc(p.cat)}${p.desc ? " · " + esc(p.desc) : ""}</div>
          <div class="pprice">${formatPrice(p.price)}</div>
          <button class="buybtn" data-buy="${p.id}" ${p.available ? "" : "disabled"}>
            ${p.available ? "اطلب الآن" : "غير متاح"}
          </button>
        </div>`;
    })
    .join("");
}

$("catTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  activeCat = btn.dataset.cat;
  renderTabs();
  renderGrid();
});

$("productGrid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-buy]");
  if (!btn || btn.disabled) return;
  openOrder(btn.dataset.buy);
});

// ===== نافذة الطلب =====
function fillGovernorates() {
  $("ofGov").innerHTML =
    `<option value="">اختار المحافظة</option>` +
    GOVERNORATES.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
}

function openOrder(id) {
  currentProduct = products.find((p) => p.id === id);
  if (!currentProduct) return;

  $("omProductName").textContent = currentProduct.name;
  $("omProductPrice").textContent = formatPrice(currentProduct.price);
  resetOrderForm();
  $("orderOverlay").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeOrder() {
  $("orderOverlay").classList.remove("show");
  document.body.style.overflow = "";
  currentProduct = null;
}

function resetOrderForm() {
  ["ofName", "ofPhone", "ofAltPhone", "ofCity", "ofAddress"].forEach((id) => ($(id).value = ""));
  $("ofGov").value = "";
  $("ofAgree").checked = false;
  $("ofReceipt").value = "";
  $("receiptPreviewWrap").innerHTML = "";
  document.querySelectorAll(".paymethod").forEach((m) => m.classList.remove("sel"));
  selectedPay = null;
  hidePayInfo();
  receiptData = "";
  setMsg("orderMsg", "", "");
  $("submitOrderBtn").disabled = false;
}

function setMsg(id, text, type) {
  const el = $(id);
  el.textContent = text;
  el.className = "msg" + (type ? " " + type : "");
  el.style.display = text ? "" : "none";
}

$("closeOrder").addEventListener("click", closeOrder);
$("orderOverlay").addEventListener("click", (e) => {
  if (e.target === $("orderOverlay")) closeOrder();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("orderOverlay").classList.contains("show")) closeOrder();
});

function showPayInfo(pay) {
  const acc = PAY_ACCOUNTS[pay];
  if (!acc) return hidePayInfo();
  $("payInfoLabel").textContent = acc.label;
  $("payInfoNumber").textContent = acc.number;
  $("payInfoOwner").textContent = acc.owner || "";
  $("payInfoOwner").style.display = acc.owner ? "" : "none";
  const btn = $("copyPayNumber");
  btn.textContent = "نسخ";
  btn.classList.remove("done");
  $("payInfo").style.display = "";
}

function hidePayInfo() {
  $("payInfo").style.display = "none";
}

document.querySelectorAll(".paymethod").forEach((m) =>
  m.addEventListener("click", () => {
    document.querySelectorAll(".paymethod").forEach((x) => x.classList.remove("sel"));
    m.classList.add("sel");
    selectedPay = m.dataset.pay;
    showPayInfo(selectedPay);
  })
);

$("copyPayNumber").addEventListener("click", async () => {
  const num = $("payInfoNumber").textContent;
  const btn = $("copyPayNumber");
  try {
    await navigator.clipboard.writeText(num);
  } catch {
    // متصفحات قديمة / بدون https
    const tmp = document.createElement("textarea");
    tmp.value = num;
    tmp.style.position = "fixed";
    tmp.style.opacity = "0";
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(tmp);
  }
  btn.textContent = "تم النسخ ✔";
  btn.classList.add("done");
  setTimeout(() => {
    btn.textContent = "نسخ";
    btn.classList.remove("done");
  }, 1800);
});

$("uploadBox").addEventListener("click", (e) => {
  if (e.target.tagName !== "IMG") $("ofReceipt").click();
});

$("ofReceipt").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    receiptData = await compressImage(file, 1000, 0.7);
    $("receiptPreviewWrap").innerHTML = `<img src="${receiptData}" alt="الإيصال">`;
  } catch {
    receiptData = "";
    setMsg("orderMsg", "الملف ده مش صورة، جرّب تاني", "err");
  }
});

// تنظيف أرقام التليفون أثناء الكتابة
["ofPhone", "ofAltPhone"].forEach((id) =>
  $(id).addEventListener("input", (e) => {
    e.target.value = toLatinDigits(e.target.value).replace(/[^\d]/g, "").slice(0, 11);
  })
);

const PHONE_RE = /^01[0125]\d{8}$/;

$("submitOrderBtn").addEventListener("click", () => {
  const name = $("ofName").value.trim().replace(/\s+/g, " ");
  const phone = toLatinDigits($("ofPhone").value.trim());
  const altPhone = toLatinDigits($("ofAltPhone").value.trim());
  const gov = $("ofGov").value;
  const city = $("ofCity").value.trim().replace(/\s+/g, " ");
  const address = $("ofAddress").value.trim();

  if (name.split(" ").length < 4) return setMsg("orderMsg", "اكتب الاسم رباعي", "err");
  if (!PHONE_RE.test(phone)) return setMsg("orderMsg", "رقم التليفون غير صحيح (11 رقم يبدأ بـ 01)", "err");
  if (!PHONE_RE.test(altPhone)) return setMsg("orderMsg", "رقم التليفون البديل غير صحيح", "err");
  if (altPhone === phone) return setMsg("orderMsg", "الرقم البديل لازم يكون مختلف عن الأساسي", "err");
  if (!gov) return setMsg("orderMsg", "اختار المحافظة", "err");
  if (city.length < 3) return setMsg("orderMsg", "اكتب اسم المدينة أو المركز", "err");
  if (address.length < 10) return setMsg("orderMsg", "اكتب العنوان بالتفصيل", "err");
  if (!selectedPay) return setMsg("orderMsg", "اختار طريقة الدفع", "err");
  if (!receiptData) return setMsg("orderMsg", "ارفع صورة إيصال التحويل", "err");
  if (!$("ofAgree").checked) return setMsg("orderMsg", "لازم توافق على شروط الطلب", "err");

  const order = {
    id: uid(),
    time: Date.now(),
    productId: currentProduct.id,
    productName: currentProduct.name,
    price: currentProduct.price,
    name, phone, altPhone, gov, city, address,
    pay: selectedPay,
    payTo: PAY_ACCOUNTS[selectedPay]?.number || "",
    receipt: receiptData,
    done: false,
  };

  orders.unshift(order);
  if (!save(LS_ORDERS, orders)) {
    orders.shift();
    return setMsg("orderMsg", "حصلت مشكلة في الحفظ، جرّب صورة إيصال أصغر", "err");
  }

  $("submitOrderBtn").disabled = true;
  setMsg("orderMsg", "تم استلام طلبك ✔ هنتواصل معاك قريب لتأكيد الطلب", "ok");
  renderOrders();
  setTimeout(closeOrder, 2200);
});

// ===== لوحة التحكم =====
function isAdmin() {
  return sessionStorage.getItem(SS_ADMIN) === "1";
}

function showStore() {
  $("storeView").style.display = "";
  $("adminView").classList.remove("show");
  $("toggleAdmin").textContent = "لوحة التحكم";
  renderGrid();
}

function showAdmin() {
  $("storeView").style.display = "none";
  $("adminView").classList.add("show");
  $("toggleAdmin").textContent = "رجوع للمتجر";
  if (isAdmin()) {
    $("adminLogin").style.display = "none";
    $("adminPanel").style.display = "";
    renderAdminProducts();
    renderOrders();
  } else {
    $("adminLogin").style.display = "";
    $("adminPanel").style.display = "none";
    $("adminPass").value = "";
    $("loginErr").style.display = "none";
    setTimeout(() => $("adminPass").focus(), 50);
  }
}

$("toggleAdmin").addEventListener("click", () => {
  $("adminView").classList.contains("show") ? showStore() : showAdmin();
  window.scrollTo({ top: 0 });
});

function tryLogin() {
  if ($("adminPass").value === ADMIN_PASS) {
    sessionStorage.setItem(SS_ADMIN, "1");
    showAdmin();
  } else {
    $("loginErr").style.display = "";
  }
}
$("adminLoginBtn").addEventListener("click", tryLogin);
$("adminPass").addEventListener("keydown", (e) => e.key === "Enter" && tryLogin());

// تبويبات الأدمن
document.querySelectorAll("[data-atab]").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll("[data-atab]").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const isProducts = t.dataset.atab === "products";
    $("aProducts").style.display = isProducts ? "" : "none";
    $("aOrders").style.display = isProducts ? "none" : "";
  })
);

// ===== إدارة المنتجات =====
function renderAdminProducts() {
  if (!products.length) {
    $("adminProductsBody").innerHTML = `<tr><td colspan="6" class="empty">مفيش منتجات</td></tr>`;
    return;
  }
  $("adminProductsBody").innerHTML = products
    .map((p) => `
      <tr>
        <td>${p.img
          ? `<img class="thumb60" src="${p.img}" data-view="${p.id}" alt="">`
          : `<div class="thumb60 noimg">${CAT_ICONS[p.cat] || "📦"}</div>`}</td>
        <td><strong>${esc(p.name)}</strong><br><span class="pcat">${COND_LABEL[p.cond] || ""}</span></td>
        <td>${esc(p.cat)}</td>
        <td>${formatPrice(p.price)}</td>
        <td><button class="pill ${p.available ? "avail" : "sold"}" data-toggle="${p.id}">
          ${p.available ? "متاح" : "نفذ"}</button></td>
        <td><button class="delbtn" data-del="${p.id}" title="حذف">🗑</button></td>
      </tr>`)
    .join("");
}

$("adminProductsBody").addEventListener("click", (e) => {
  const tgl = e.target.closest("[data-toggle]");
  const del = e.target.closest("[data-del]");
  const view = e.target.closest("[data-view]");

  if (tgl) {
    const p = products.find((x) => x.id === tgl.dataset.toggle);
    if (p) {
      p.available = !p.available;
      save(LS_PRODUCTS, products);
      renderAdminProducts();
      renderGrid();
    }
  } else if (del) {
    const p = products.find((x) => x.id === del.dataset.del);
    if (p && confirm(`حذف "${p.name}"؟`)) {
      products = products.filter((x) => x.id !== p.id);
      save(LS_PRODUCTS, products);
      renderAdminProducts();
      renderGrid();
    }
  } else if (view) {
    const p = products.find((x) => x.id === view.dataset.view);
    if (p?.img) openImage(p.img);
  }
});

$("npImageBox").addEventListener("click", (e) => {
  if (e.target.tagName !== "IMG") $("npImage").click();
});

$("npImage").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    newProductImg = await compressImage(file);
    $("npImagePreview").innerHTML = `<img src="${newProductImg}" alt="">`;
  } catch {
    newProductImg = "";
    setMsg("addErr", "الملف ده مش صورة", "err");
  }
});

$("npPrice").addEventListener("input", (e) => {
  e.target.value = toLatinDigits(e.target.value).replace(/[^\d.]/g, "");
});

$("addProductBtn").addEventListener("click", () => {
  const name = $("npName").value.trim();
  const price = Number(toLatinDigits($("npPrice").value.trim()));

  if (!name) return setMsg("addErr", "اكتب اسم المنتج", "err");
  if (!price || price <= 0) return setMsg("addErr", "اكتب سعر صحيح", "err");

  const product = {
    id: uid(),
    name,
    cat: $("npCat").value,
    cond: $("npCond").value,
    price,
    desc: $("npDesc").value.trim(),
    img: newProductImg,
    available: true,
  };

  products.unshift(product);
  if (!save(LS_PRODUCTS, products)) {
    products.shift();
    return setMsg("addErr", "المساحة خلصت، جرّب صورة أصغر أو امسح منتجات قديمة", "err");
  }

  // تفريغ الفورم
  $("npName").value = "";
  $("npPrice").value = "";
  $("npDesc").value = "";
  $("npImage").value = "";
  $("npImagePreview").innerHTML = "";
  newProductImg = "";
  setMsg("addErr", "تمت الإضافة ✔", "ok");
  setTimeout(() => setMsg("addErr", "", ""), 2000);

  renderAdminProducts();
  renderGrid();
});

// ===== الطلبات =====
function waLink(phone) {
  const intl = "2" + phone; // 01xxxxxxxxx -> 201xxxxxxxxx
  return `<a class="walink" href="https://wa.me/${intl}" target="_blank" rel="noopener">${esc(phone)}</a>`;
}

function renderOrders() {
  const count = orders.length;
  const pending = orders.filter((o) => !o.done).length;
  $("orderBadge").textContent = pending ? `(${pending})` : "";

  if (!count) {
    $("adminOrdersBody").innerHTML = "";
    $("ordersEmpty").style.display = "";
    return;
  }
  $("ordersEmpty").style.display = "none";

  $("adminOrdersBody").innerHTML = orders
    .map((o) => `
      <tr class="${o.done ? "orderdone" : ""}">
        <td>${formatTime(o.time)}</td>
        <td><strong>${esc(o.productName)}</strong><br><span class="pcat">${formatPrice(o.price)}</span></td>
        <td>${esc(o.name)}</td>
        <td>${waLink(o.phone)}</td>
        <td>${waLink(o.altPhone)}</td>
        <td>${esc(o.gov || "-")}</td>
        <td>${esc(o.city || "-")}</td>
        <td style="white-space:normal;min-width:180px">${esc(o.address)}</td>
        <td>${PAY_LABEL[o.pay] || esc(o.pay)}${o.payTo ? `<br><span class="pcat" style="direction:ltr">${esc(o.payTo)}</span>` : ""}</td>
        <td>${o.receipt ? `<img class="thumb60" src="${o.receipt}" data-receipt="${o.id}" alt="">` : "-"}</td>
        <td>
          <button class="pill ${o.done ? "avail" : "wait"}" data-done="${o.id}">
            ${o.done ? "تم التنفيذ ✔" : "قيد التنفيذ"}
          </button>
        </td>
        <td>
          <button class="delbtn" data-delorder="${o.id}" ${o.done ? "" : "disabled"}
            title="${o.done ? "حذف الطلب" : "علّم الطلب إنه اتنفذ الأول"}">🗑</button>
        </td>
      </tr>`)
    .join("");
}

$("adminOrdersBody").addEventListener("click", (e) => {
  const r = e.target.closest("[data-receipt]");
  const d = e.target.closest("[data-done]");
  const del = e.target.closest("[data-delorder]");

  if (r) {
    const o = orders.find((x) => x.id === r.dataset.receipt);
    if (o?.receipt) openImage(o.receipt);
  } else if (d) {
    const o = orders.find((x) => x.id === d.dataset.done);
    if (o) {
      o.done = !o.done;
      save(LS_ORDERS, orders);
      renderOrders();
    }
  } else if (del) {
    if (del.disabled) return;
    const o = orders.find((x) => x.id === del.dataset.delorder);
    if (!o) return;
    if (!o.done) return; // حماية زيادة
    if (confirm(`حذف طلب "${o.name}" نهائياً؟`)) {
      orders = orders.filter((x) => x.id !== o.id);
      save(LS_ORDERS, orders);
      renderOrders();
    }
  }
});

// ===== تشغيل =====
$("year").textContent = new Date().getFullYear();
fillGovernorates();
renderTabs();
renderGrid();
