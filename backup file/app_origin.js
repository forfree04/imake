'use strict';

/* Icons */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

const getToday = () => new Date().toISOString().split('T')[0];

let currentLang = 'en';
let masterTasks = [{ id: 1, title: "Rent Hanbok", date: "", time: "", completed: false }];
let favorites = [{ id: 101, title: "Gyeongbokgung", cat: "Activity", img: "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=400", desc: "Main Palace" }];
let myProducts = [{ id: 501, title: "[GOV] Suwon Pass", desc: "Tourism Discount" }];
const tips = { Dining: 'Lunch peak 11:30~13:00.', Transport: 'Tag card twice!', Stay: 'Check-in 15:00.', Manner: 'No tips!' };

let currentTable = "";
let cart = {};
let confirmedOrders = [];

const placeDB = {
  Food: [
    {name:'Myeongdong Kyoja',img:'https://images.unsplash.com/photo-1534422298391-e4f8c170db06?w=400',cat:'Food',status:'yellow'},
    {name:'Gwangjang Market',img:'https://images.unsplash.com/photo-1563127616-52c3f8730b20?w=400',cat:'Food',status:'green'},
    {name:'Tosokchon',img:'https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=400',cat:'Food',status:'red'},
    {name:'Jinju Hoegwan',img:'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',cat:'Food',status:'green'}
  ],
  Activity: [
    {name:'Gyeongbokgung',img:'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=400',cat:'Act',status:'green'},
    {name:'N Tower',img:'https://images.unsplash.com/photo-1538669715515-583b15746a9a?w=400',cat:'Act',status:'yellow'},
    {name:'Lotte World',img:'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=400',cat:'Act',status:'red'},
    {name:'Han River',img:'https://images.unsplash.com/photo-1610448721566-47369c768e70?w=400',cat:'Act',status:'green'}
  ]
};

const statusMap = {
  green:  { color: '#10b981', bg: '#dcfce7', text: '🟢 Available' },
  yellow: { color: '#f59e0b', bg: '#fef3c7', text: '🟡 Busy (<15m)' },
  red:    { color: '#ef4444', bg: '#fee2e2', text: '🔴 Full (>30m)' }
};

let menuData = [
  { id: 1, name: { ko: "수원 왕갈비 통닭", en: "Suwon Galbi Chicken", ja: "水原カルビ", zh: "水原炸鸡" }, price: 22000, img: "https://images.unsplash.com/photo-1563127616-52c3f8730b20?w=200" },
  { id: 2, name: { ko: "후라이드 치킨", en: "Fried Chicken", ja: "フライド", zh: "炸鸡" }, price: 19000, img: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=200" },
  { id: 3, name: { ko: "코카콜라", en: "Coca Cola", ja: "コーラ", zh: "可乐" }, price: 2500, img: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200" },
  { id: 4, name: { ko: "생맥주 (500cc)", en: "Draft Beer", ja: "ビール", zh: "啤酒" }, price: 4500, img: "https://images.unsplash.com/photo-1586993451228-09818021e309?w=200" }
];

const translations = {
  ko: { checkTable: "입력하신 번호가 맞나요?", checkOrder: "주문하시겠습니까?", msgConfirmed: "주문 완료!", msgCooking: "맛있게 조리하겠습니다.", totalBill: "총 계산서" },
  en: { checkTable: "Is Table correct?", checkOrder: "Confirm Order?", msgConfirmed: "Order Accepted!", msgCooking: "Preparing your food.", totalBill: "Total Bill" }
};

/* [MODAL SYSTEM] */
function showModalHTML(html, title = "") {
  const header = `
    <div class="modal-header">
      <button class="modal-header-btn" onclick="closeModal()"><i data-lucide="x"></i></button>
      <h3>${title}</h3>
      <div style="width:30px;"></div>
    </div>`;
  document.getElementById('modalContent').innerHTML = header + html;
  document.getElementById('modalOverlay').style.display = 'flex';
  refreshIcons();
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

/* [USER LOGIC] */
function filterContent(cat, color) {
  document.querySelectorAll('.marker').forEach(m => {
    m.style.background = color;
    m.style.left = (Math.random() * 200 + 50) + "px";
  });

  const items = placeDB[cat] || placeDB.Activity;
  document.getElementById('recScroll').innerHTML = items.map(i => {
    const st = statusMap[i.status] || statusMap.green;
    return `
      <div class="rec-card" onclick="openActionSheet('${i.name}', '${i.cat}', '${i.img}', '${i.status}')">
        <img src="${i.img}" class="rec-img">
        <div class="status-badge">
          <div class="status-dot" style="background:${st.color}"></div>
          <span>${i.status}</span>
        </div>
        <div class="rec-info">
          <div class="rec-name">${i.name}</div>
          <i data-lucide="more-vertical" style="width:14px; color:#cbd5e1;"></i>
        </div>
      </div>`;
  }).join('');
  refreshIcons();
}

function openActionSheet(name, cat, img, status) {
  const isFav = favorites.some(f => f.title === name);
  const stInfo = statusMap[status] || statusMap.green;
  showModalHTML(
    `
      <img src="${img}" style="width:100%; border-radius:15px; margin-bottom:15px;">
      <h3>${name}</h3>
      <div style="background:${stInfo.bg}; color:${stInfo.color}; padding:10px; border-radius:10px; margin-bottom:10px; font-weight:bold; text-align:center;">
        ${stInfo.text}
      </div>
      <button class="action-sheet-btn" onclick="addToTodo('${name}')">To Do List</button>
      <button class="action-sheet-btn" onclick="toggleFavorite('${name}','${cat}','${img}')">
        <i data-lucide="star" style="fill:${isFav ? 'var(--primary)' : 'none'}"></i> ${isFav ? 'Unfavorite' : 'Favorite'}
      </button>
    `,
    name
  );
}

function addToTodo(name) {
  masterTasks.push({ id: Date.now(), title: name, completed: false });
  updateDash();
  closeModal();
}

function toggleFavorite(name, cat, img) {
  const idx = favorites.findIndex(f => f.title === name);
  if (idx > -1) favorites.splice(idx, 1);
  else favorites.push({ id: Date.now(), title: name, cat, img });

  updateDash();
  filterContent(cat, '#3b82f6');
  closeModal();
}

function updateDash() {
  const todoCountEl = document.getElementById('todoCount');
  const favCountEl = document.getElementById('favCount');
  const schCountEl = document.getElementById('schCount');

  if (todoCountEl) todoCountEl.innerText = masterTasks.length;
  if (favCountEl) favCountEl.innerText = favorites.length;

  // 스케줄 데이터가 아직 없으므로, date가 오늘인 항목만 카운트 (기본 0)
  const today = getToday();
  const sch = masterTasks.filter(t => t.date === today).length;
  if (schCountEl) schCountEl.innerText = sch;
}

/* [ORDER SYSTEM] */
function startQRScan() {
  document.getElementById('screen-table').style.display = 'flex';
}

function minimizeOrder() {
  document.getElementById('screen-table').style.display = 'none';
  document.getElementById('screen-menu').style.display = 'none';
  if (currentTable) {
    document.getElementById('floatBtn').style.display = 'flex';
    document.getElementById('floatTableNum').innerText = currentTable;
  }
}

function restoreOrderScreen() {
  document.getElementById('floatBtn').style.display = 'none';
  document.getElementById('screen-menu').style.display = 'flex';
}

function inputNum(val) {
  if (val === 'C') currentTable = "";
  else if (val === 'BS') currentTable = currentTable.slice(0, -1);
  else if (currentTable.length < 2) currentTable += val;

  document.getElementById('ticketDisplay').innerText = currentTable || "--";
}

/* 테이블 번호 확인 모달 */
function checkTableNum() {
  if (!currentTable) return;

  const html = `
    <h3 style="margin-bottom: 20px;">${translations[currentLang].checkTable}</h3>
    <div style="font-size: 50px; font-weight: 900; color: var(--primary); margin: 30px 0;">${currentTable}</div>
    <div class="modal-btns">
      <button class="m-btn m-cancel" onclick="closeModal()">수정</button>
      <button class="m-btn m-confirm" onclick="goToMenu()">OK</button>
    </div>
  `;

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <button class="modal-header-btn" onclick="closeModal()"><i data-lucide="x"></i></button>
      <div></div><div></div>
    </div>
    ${html}
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
  refreshIcons();
}

function goToMenu() {
  closeModal();
  document.getElementById('screen-table').style.display = 'none';
  document.getElementById('screen-menu').style.display = 'flex';
  document.getElementById('headerTableNum').innerText = currentTable;
  renderOrderMenu();
}

function renderOrderMenu() {
  document.getElementById('orderMenuList').innerHTML = menuData.map(m => `
    <div class="menu-item">
      <img src="${m.img}" class="menu-img">
      <div class="menu-info">
        <div>${m.name.en}</div>
        <div style="font-weight:bold;">₩ ${Math.floor(m.price * 0.95).toLocaleString()}</div>
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="updateQty(${m.id}, -1)">-</button>
          <span id="qty-${m.id}">${cart[m.id] || 0}</span>
          <button class="qty-btn" onclick="updateQty(${m.id}, 1)">+</button>
        </div>
      </div>
    </div>
  `).join('');
  refreshIcons();
}

function updateQty(id, chg) {
  if (!cart[id]) cart[id] = 0;
  cart[id] += chg;
  if (cart[id] < 0) cart[id] = 0;

  document.getElementById(`qty-${id}`).innerText = cart[id];
  calcTotal();
}

function calcTotal() {
  let t = 0, c = 0;
  for (let id in cart) {
    const m = menuData.find(x => x.id == id);
    if (m) t += Math.floor(m.price * 0.95) * cart[id];
    c += cart[id];
  }
  document.getElementById('totalPrice').innerText = t.toLocaleString();
  document.getElementById('btnOrder').disabled = c === 0;
  return t;
}

function openOrderSummary() {
  let html = `<div style="text-align:left; margin-bottom:20px;">`;
  for (let id in cart) {
    if (cart[id] > 0) {
      const m = menuData.find(x => x.id == id);
      html += `<div class="bill-list-item"><span>${m.name.en} x ${cart[id]}</span><span>₩ ${(Math.floor(m.price*0.95)*cart[id]).toLocaleString()}</span></div>`;
    }
  }
  html += `</div><div class="bill-total"><span>Total</span><span style="color:#ef4444;">₩ ${calcTotal().toLocaleString()}</span></div>`;
  html += `<div class="modal-btns"><button class="m-btn m-cancel" onclick="closeModal()">수정</button><button class="m-btn m-confirm" onclick="submitOrder()">Submit</button></div>`;
  showModalHTML(html, "Confirm Order");
}

function openBillModal() {
  let html = `<h3>Total Bill</h3><div style="text-align:left; margin-top:20px;">`, gt = 0;

  if (confirmedOrders.length > 0) {
    confirmedOrders.forEach(o => {
      html += `<div class="bill-list-item"><span>${o.name} x ${o.qty}</span><span>₩ ${o.totalPrice.toLocaleString()}</span></div>`;
      gt += o.totalPrice;
    });
  }

  let ct = 0, ch = "";
  for (let id in cart) {
    if (cart[id] > 0) {
      const m = menuData.find(x => x.id == id);
      const p = Math.floor(m.price * 0.95) * cart[id];
      ch += `<div class="bill-list-item" style="color:#3b82f6"><span>[New] ${m.name.en} x ${cart[id]}</span><span>₩ ${p.toLocaleString()}</span></div>`;
      ct += p;
    }
  }

  if (ch) html += `<div class="bill-divider"></div>` + ch;

  html += `</div><div class="bill-total"><span>Total</span><span style="color:#ef4444;">₩ ${(gt + ct).toLocaleString()}</span></div>`;
  html += `<div class="modal-btns" style="flex-direction:column"><button class="m-btn m-confirm" onclick="finishEating()">Pay & Finish</button><button class="m-btn m-cancel" onclick="closeModal()">Continue</button></div>`;
  showModalHTML(html, "Your Bill");
}

function submitOrder() {
  closeModal();
  document.getElementById('screen-menu').style.display = 'none';
  document.getElementById('screen-waiting').style.display = 'flex';

  setTimeout(() => {
    document.getElementById('screen-waiting').style.display = 'none';
    document.getElementById('screen-owner').style.display = 'flex';
    startKitchenSystem();
  }, 1500);
}

let alarmInterval, elapsed = 0;

function startKitchenSystem() {
  document.getElementById('kitchenCard').style.display = 'block';
  document.getElementById('kitchenTableNum').innerText = currentTable;

  let h = "";
  for (let id in cart) {
    if (cart[id] > 0) {
      const m = menuData.find(x => x.id == id);
      h += `<div>${m.name.en} <span style="color:red">x ${cart[id]}</span></div>`;
    }
  }

  document.getElementById('kitchenOrderList').innerHTML = h;
  elapsed = 0;

  if (alarmInterval) clearInterval(alarmInterval);
  alarmInterval = setInterval(() => {
    elapsed++;
    document.getElementById('timerText').innerText = `Elapsed: ${elapsed}s`;
    if (elapsed >= 5) document.getElementById('screen-owner').classList.add('blink-bg');
  }, 1000);

  refreshIcons();
}

function confirmOrderKitchen() {
  clearInterval(alarmInterval);
  document.getElementById('screen-owner').classList.remove('blink-bg');

  for (let id in cart) {
    if (cart[id] > 0) {
      const m = menuData.find(x => x.id == id);
      confirmedOrders.push({ name: m.name.en, qty: cart[id], totalPrice: Math.floor(m.price * 0.95) * cart[id] });
    }
  }

  cart = {};
  renderOrderMenu();
  calcTotal();

  document.getElementById('screen-owner').style.display = 'none';
  document.getElementById('screen-menu').style.display = 'flex';

  showModalHTML(`<h3>Order Accepted!</h3><p style="color:gray">Preparing your food.</p>`, "Success");
}

function finishEating() {
  const hBox = document.getElementById('historyList');
  hBox.innerHTML = `
    <div style="background:white; padding:15px; border-radius:15px; margin-bottom:10px; border:1px solid #e2e8f0; text-align:left;">
      <div style="font-size:10px; color:gray;">${new Date().toLocaleDateString()}</div>
      <div style="font-weight:bold;">Dining (Table ${currentTable})</div>
    </div>
  ` + hBox.innerHTML;

  currentTable = "";
  confirmedOrders = [];
  cart = {};

  closeModal();
  document.getElementById('screen-menu').style.display = 'none';
  document.getElementById('floatBtn').style.display = 'none';
  document.getElementById('screen-mypage').style.display = 'flex';
}

/* Language / Tips / Home Modals */
function openLangModal() {
  showModalHTML(
    `<div style="display:flex; flex-direction:column; gap:8px;">
      <button class="action-sheet-btn">한국어</button>
      <button class="action-sheet-btn">English</button>
    </div>`,
    "Language"
  );
}

function showTip(cat) {
  showModalHTML(
    `<p style="padding:15px 0; font-size:14px; line-height:1.6;">${tips[cat]}</p>`,
    `${cat} Tip`
  );
}

function openModal(type) {
  if (type === 'qr') {
    showModalHTML(`<i data-lucide="qr-code" style="width:100px; height:100px; margin:0 auto; display:block;"></i>`, "My QR Code");
    return;
  }
  if (type === 'fav') {
    showModalHTML(favorites.map(f => `<div class="list-item"><span class="cat-chip">${f.cat}</span>${f.title}</div>`).join(''), "Favorites");
    return;
  }
  if (type === 'products') {
    showModalHTML(myProducts.map(p => `<div style="background:#f1f5f9; padding:15px; border-radius:15px; margin-bottom:10px;"><b>${p.title}</b><p>${p.desc}</p></div>`).join(''), "Products");
    return;
  }
  if (type === 'todo') {
    showModalHTML(masterTasks.map(t => `<div class="list-item">${t.title}</div>`).join(''), "To-Do List");
    return;
  }
  if (type === 'sch') {
    const today = getToday();
    const todayItems = masterTasks.filter(t => t.date === today);
    const body = todayItems.length
      ? todayItems.map(t => `<div class="list-item">${t.time ? `${t.time} ` : ''}${t.title}</div>`).join('')
      : `<div style="color:#64748b; padding:10px 0;">No schedule for today.</div>`;
    showModalHTML(body, "Today Schedule");
    return;
  }
}

/* 누락되어 있던 함수 보강: My 버튼 */
function openMyHistory() {
  document.getElementById('screen-mypage').style.display = 'flex';
  refreshIcons();
}

/* Init */
document.addEventListener('DOMContentLoaded', () => {
  filterContent('Activity', '#3b82f6');
  updateDash();
  refreshIcons();
});
