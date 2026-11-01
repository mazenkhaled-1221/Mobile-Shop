// ===== الاتصال بالسيرفر (PHP + MySQL) =====
const API = "api.php";

async function api(action, { method = "GET", body, params = {} } = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${API}?${qs}`, {
    method,
    credentials: "same-origin",
    headers: method === "POST"
      ? { "Content-Type": "application/json", "X-Requested-With": "fetch" }
      : {},
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || "request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

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

const GOVERNORATES = [
  "القاهرة", "الجيزة", "القليوبية", "الإسكندرية", "الدقهلية", "الشرقية",
  "الغربية", "المنوفية", "البحيرة", "كفر الشيخ", "دمياط", "بورسعيد",
  "الإسماعيلية", "السويس", "شمال سيناء", "جنوب سيناء", "الفيوم",
  "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان",
  "البحر الأحمر", "الوادي الجديد", "مطروح",
];

const COND_LABEL = { new: "جديد", used: "مستعمل", refurb: "تجديد" };
const PAY_LABEL = { instapay: "إنستاباي", vodafone: "فودافون كاش" };

// بيانات التحويل بتيجي من config.php على السيرفر
let PAY_ACCOUNTS = {};

// ===== أدوات مساعدة =====
const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function toLatinDigits(str) {
  return String(str ?? "")
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776);
}

function formatPrice(n) {
  return Number(n).toLocaleString("ar-EG") + " جنيه";
}

function formatTime(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("ar-EG", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

// بنضغط الصورة في المتصفح قبل الرفع (السيرفر بيحفظها كملف مش جوه الداتابيز)
const MAX_IMG_CHARS = 700_000;

function compressImage(file, maxSize = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("not image"));
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let size = maxSize, q = quality, out = "";
        for (let i = 0; i < 6; i++) {
          let { width, height } = img;
          if (width > size || height > size) {
            const ratio = Math.min(size / width, size / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          out = canvas.toDataURL("image/jpeg", q);
          if (out.length <= MAX_IMG_CHARS) break;
          size = Math.round(size * 0.8);
          q = Math.max(0.4, q - 0.1);
        }
        out.length <= MAX_IMG_CHARS ? resolve(out) : reject(new Error("too big"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openImage(src) {
  window.open(src, "_blank", "noopener");
}

function setMsg(id, text, type) {
  const el = $(id);
  el.textContent = text;
  el.className = "msg" + (type ? " " + type : "");
  el.style.display = text ? "" : "none";
}

// ===== الحالة =====
let products = [];
let orders = [];
let productsLoaded = false;
let activeCat = "الكل";
let currentProduct = null;
let selectedPay = null;
let receiptData = "";
let newProductImg = "";
let currentUser = null;
let lastProductsJson = "";
let lastOrdersJson = "";

// ===== تحميل البيانات (polling كل 8 ثواني بدل onSnapshot) =====
async function loadProducts() {
  try {
    const list = await api("products");
    productsLoaded = true;
    const json = JSON.stringify(list);
    if (json === lastProductsJson) return;
    lastProductsJson = json;
    products = list;
    renderGrid();
    if (currentUser) renderAdminProducts();
  } catch (err) {
    console.error(err);
    if (!productsLoaded) {
      $("productGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">حصلت مشكلة في تحميل المنتجات</div>`;
    }
  }
}

async function loadOrders() {
  if (!currentUser) return;
  try {
    const list = await api("orders");
    const json = JSON.stringify(list);
    if (json === lastOrdersJson) return;
    lastOrdersJson = json;
    orders = list;
    renderOrders();
  } catch (err) {
    console.error(err);
    if (err.status === 401) setUser(null); // الجلسة انتهت
  }
}

async function loadPayAccounts() {
  try { PAY_ACCOUNTS = await api("pay_accounts"); } catch (err) { console.error(err); }
}

function setUser(user) {
  currentUser = user;
  if (user) {
    loadOrders();
  } else {
    orders = [];
    lastOrdersJson = "";
  }
  if ($("adminView").classList.contains("show")) showAdmin();
}

async function checkSession() {
  try {
    const r = await api("me");
    setUser(r.admin ? { email: r.email } : null);
  } catch {
    setUser(null);
  }
}

setInterval(() => {
  if (document.hidden) return;
  loadProducts();
  loadOrders();
}, 8000);

// ===== المتجر =====
function renderTabs() {
  const cats = ["الكل", ...CATEGORIES];
  $("catTabs").innerHTML = cats
    .map((c) => `<button class="tab ${c === activeCat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join("");
}

function renderGrid() {
  if (!productsLoaded) {
    $("productGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">جاري التحميل...</div>`;
    return;
  }
  const list = activeCat === "الكل" ? products : products.filter((p) => p.cat === activeCat);

  if (!list.length) {
    $("productGrid").innerHTML = `<div class="empty" style="grid-column:1/-1">مفيش منتجات في القسم ده حالياً</div>`;
    return;
  }

  $("productGrid").innerHTML = list
    .map((p) => {
      const badge = p.available
        ? `<span class="badge ${esc(p.cond)}">${COND_LABEL[p.cond] || ""}</span>`
        : `<span class="badge soldout">نفذت الكمية</span>`;
      const thumb = p.img
        ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">`
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
  $("submitOrderBtn").textContent = "تأكيد الطلب";
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
    setMsg("orderMsg", "", "");
  } catch {
    receiptData = "";
    setMsg("orderMsg", "الملف ده مش صورة أو حجمه كبير جداً، جرّب تاني", "err");
  }
});

["ofPhone", "ofAltPhone"].forEach((id) =>
  $(id).addEventListener("input", (e) => {
    e.target.value = toLatinDigits(e.target.value).replace(/[^\d]/g, "").slice(0, 11);
  })
);

const PHONE_RE = /^01[0125]\d{8}$/;

$("submitOrderBtn").addEventListener("click", async () => {
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

  // نتأكد إن المنتج لسه متاح (ممكن الأدمن يكون قفله وانت فاتح الفورم)
  const live = products.find((p) => p.id === currentProduct?.id);
  if (!live || !live.available) return setMsg("orderMsg", "المنتج ده بقى غير متاح حالياً", "err");

  const btn = $("submitOrderBtn");
  btn.disabled = true;
  btn.textContent = "جاري الإرسال...";

  try {
    await api("create_order", {
      method: "POST",
      body: {
        productId: live.id,
        name, phone, altPhone, gov, city, address,
        pay: selectedPay,
        receipt: receiptData,
      },
    });
    btn.textContent = "تم ✔";
    setMsg("orderMsg", "تم استلام طلبك ✔ هنتواصل معاك قريب لتأكيد الطلب", "ok");
    setTimeout(closeOrder, 2200);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "تأكيد الطلب";
    setMsg("orderMsg",
      err.status && err.status < 500 ? err.message : "حصلت مشكلة في الإرسال، اتأكد من النت وجرّب تاني",
      "err");
  }
});

// ===== لوحة التحكم =====
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
  if (currentUser) {
    $("adminLogin").style.display = "none";
    $("adminPanel").style.display = "";
    renderAdminProducts();
    renderOrders();
  } else {
    $("adminLogin").style.display = "";
    $("adminPanel").style.display = "none";
    $("adminPass").value = "";
    $("loginErr").style.display = "none";
    setTimeout(() => $("adminEmail").focus(), 50);
  }
}

$("toggleAdmin").addEventListener("click", () => {
  $("adminView").classList.contains("show") ? showStore() : showAdmin();
  window.scrollTo({ top: 0 });
});

async function tryLogin() {
  const email = $("adminEmail").value.trim();
  const pass = $("adminPass").value;
  const btn = $("adminLoginBtn");
  $("loginErr").style.display = "none";
  btn.disabled = true;
  try {
    const r = await api("login", { method: "POST", body: { email, pass } });
    setUser({ email: r.email });
  } catch {
    $("loginErr").style.display = "";
  } finally {
    btn.disabled = false;
  }
}
$("adminLoginBtn").addEventListener("click", tryLogin);
$("adminPass").addEventListener("keydown", (e) => e.key === "Enter" && tryLogin());

$("logoutBtn").addEventListener("click", async () => {
  try { await api("logout", { method: "POST" }); } catch {}
  setUser(null);
  showStore();
});

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
          ? `<img class="thumb60" src="${esc(p.img)}" data-view="${p.id}" alt="">`
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

$("adminProductsBody").addEventListener("click", async (e) => {
  const tgl = e.target.closest("[data-toggle]");
  const del = e.target.closest("[data-del]");
  const view = e.target.closest("[data-view]");

  try {
    if (tgl) {
      const p = products.find((x) => x.id === tgl.dataset.toggle);
      if (!p) return;
      tgl.disabled = true;
      await api("update_product", { method: "POST", body: { id: p.id, available: !p.available } });
      await loadProducts();
    } else if (del) {
      const p = products.find((x) => x.id === del.dataset.del);
      if (p && confirm(`حذف "${p.name}"؟`)) {
        await api("delete_product", { method: "POST", body: { id: p.id } });
        await loadProducts();
      }
    } else if (view) {
      const p = products.find((x) => x.id === view.dataset.view);
      if (p?.img) openImage(p.img);
    }
  } catch (err) {
    console.error(err);
    alert("حصلت مشكلة، اتأكد من النت وإنك داخل كأدمن");
    renderAdminProducts();
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
    setMsg("addErr", "", "");
  } catch {
    newProductImg = "";
    setMsg("addErr", "الملف ده مش صورة أو حجمه كبير جداً", "err");
  }
});

$("npPrice").addEventListener("input", (e) => {
  e.target.value = toLatinDigits(e.target.value).replace(/[^\d.]/g, "");
});

$("addProductBtn").addEventListener("click", async () => {
  const name = $("npName").value.trim();
  const price = Number(toLatinDigits($("npPrice").value.trim()));

  if (!name) return setMsg("addErr", "اكتب اسم المنتج", "err");
  if (!price || price <= 0) return setMsg("addErr", "اكتب سعر صحيح", "err");

  const btn = $("addProductBtn");
  btn.disabled = true;
  try {
    await api("add_product", {
      method: "POST",
      body: {
        name,
        cat: $("npCat").value,
        cond: $("npCond").value,
        price,
        desc: $("npDesc").value.trim(),
        img: newProductImg,
      },
    });
    await loadProducts();

    $("npName").value = "";
    $("npPrice").value = "";
    $("npDesc").value = "";
    $("npImage").value = "";
    $("npImagePreview").innerHTML = "";
    newProductImg = "";
    setMsg("addErr", "تمت الإضافة ✔", "ok");
    setTimeout(() => setMsg("addErr", "", ""), 2000);
  } catch (err) {
    console.error(err);
    setMsg("addErr", err.status && err.status < 500 ? err.message : "حصلت مشكلة في الإضافة، اتأكد من النت", "err");
  } finally {
    btn.disabled = false;
  }
});

// ===== الطلبات =====
function waLink(phone) {
  const intl = "2" + phone;
  return `<a class="walink" href="https://wa.me/${esc(intl)}" target="_blank" rel="noopener">${esc(phone)}</a>`;
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
        <td>${o.receipt ? `<img class="thumb60" src="${esc(o.receipt)}" data-receipt="${o.id}" alt="">` : "-"}</td>
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

$("adminOrdersBody").addEventListener("click", async (e) => {
  const r = e.target.closest("[data-receipt]");
  const d = e.target.closest("[data-done]");
  const del = e.target.closest("[data-delorder]");

  try {
    if (r) {
      const o = orders.find((x) => x.id === r.dataset.receipt);
      if (o?.receipt) openImage(o.receipt);
    } else if (d) {
      const o = orders.find((x) => x.id === d.dataset.done);
      if (!o) return;
      d.disabled = true;
      await api("update_order", { method: "POST", body: { id: o.id, done: !o.done } });
      await loadOrders();
    } else if (del) {
      if (del.disabled) return;
      const o = orders.find((x) => x.id === del.dataset.delorder);
      if (!o || !o.done) return;
      if (confirm(`حذف طلب "${o.name}" نهائياً؟`)) {
        await api("delete_order", { method: "POST", body: { id: o.id } });
        await loadOrders();
      }
    }
  } catch (err) {
    console.error(err);
    alert("حصلت مشكلة، اتأكد من النت");
    renderOrders();
  }
});

// ===== تشغيل =====
$("year").textContent = new Date().getFullYear();
fillGovernorates();
renderTabs();
renderGrid();
loadPayAccounts();
loadProducts();
checkSession();
