'use strict';

/**
 * imake UI Prototype (Firebase Hosting friendly)
 * - SPA routing (history API)
 * - App-only: landing/QR entry routing disabled (focus on core app UI)
 * - Core: Header + Help panel + Home dashboard + Modals (ToDo/Fav/Schedule) + Saved/Weather stubs
 *
 * 주의: 결제/회원/QR그룹은 프로토타입용 UI/로직 스텁 포함(백엔드 연동 필요).
 */

/* ---------- Utils ---------- */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const nowISO = () => new Date().toISOString();
const today = () => nowISO().slice(0,10);

function fmtKRW(n){
  const v = Math.max(0, Math.floor(Number(n||0)));
  return v.toLocaleString('ko-KR');
}

function toast(msg){
  const id = 'imakeToast';
  let el = document.getElementById(id);
  if (!el){
    el = document.createElement('div');
    el.id = id;
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove('show'), 1200);
}

function safeJSONParse(s, fallback){
  try { return JSON.parse(s); } catch { return fallback; }
}

function setIcon(){
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function openModal({title, bodyHTML, rightHTML=""}){
  const overlay = $('#modalOverlay');
  const box = $('#modalBox');
  box.innerHTML = `
    <div class="modal-header">
      <button class="icon-btn" aria-label="Close" id="mClose"><i data-lucide="x"></i></button>
      <h3>${title||''}</h3>
      <div>${rightHTML||''}</div>
    </div>
    ${bodyHTML||''}
  `;
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden','false');
  setIcon();
  $('#mClose').onclick = closeModal;
  overlay.onclick = (e)=>{ if(e.target === overlay) closeModal(); };
}

function closeModal(){
  const overlay = $('#modalOverlay');
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden','true');
}

/* ---------- State (localStorage) ---------- */
const LS_KEY = 'imake_proto_v1';
const defaultState = {
  lang: 'KOR',
  isLoggedIn: false,
  isPaid: false,
  qrGroup: { size: 1, members: [] }, // UI placeholder
  todo: [
    { id: 1, title: 'Rent Hanbok', date: '', time: '', done: false, createdAt: nowISO() }
  ],
  favorites: [
    { id: 101, title: 'Gyeongbokgung', cat: 'Activity', img: 'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800' }
  ],
  schedule: [
    // {id, title, date, time, done}
  ],
  order: {
    partnerId: 'STORE001',
    table: '',
    cart: {},          // { [menuId]: qty }
    confirmed: []      // [{name, qty, unit, total}]
  },
  history: [],
  savedTotal: 0,
  weather: { city: 'Seoul', tempC: 3, icon: '⛅', updatedAt: nowISO() } // stub
};

let state = loadState();

// 이벤트 중복 바인딩 방지(렌더가 여러 번 호출되므로 1회만 등록)
let _escHandlerBound = false;

function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  const s = raw ? safeJSONParse(raw, defaultState) : defaultState;
  // 최소 보정
  s.qrGroup ||= { size: 1, members: [] };
  s.todo ||= [];
  s.favorites ||= [];
  s.schedule ||= [];
  s.history ||= [];
  if (typeof s.savedTotal !== 'number') s.savedTotal = 0;
  return s;
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/* ---------- Data (partners / places) ---------- */
const partnerDB = {
  'STORE001': {
    name: 'Myeongdong Kyoja',
    type: 'Food',
    wifi: { ssid: 'KYOJA_GUEST', pass: '1234-5678' },
    heroImg: 'https://images.unsplash.com/photo-1534422298391-e4f8c170db06?w=1200',
    desc: 'Famous noodles and dumplings.',
    menu: [
      { id: 1, name: 'Kalguksu', price: 12000, img:'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800' },
      { id: 2, name: 'Mandu', price: 11000, img:'https://images.unsplash.com/photo-1526318896980-cf78c088247c?w=800' },
    ]
  },
  'ACT001': {
    name: 'Gyeongbokgung',
    type: 'Activity',
    heroImg: 'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=1200',
    desc: 'Main palace of Joseon Dynasty.',
    activity: [
      { id: 11, name: 'Palace ticket', price: 3000, img:'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800' }
    ]
  }
};

const placeDB = {
  Food: [
    {name:'Myeongdong Kyoja',pid:'STORE001',img:'https://images.unsplash.com/photo-1534422298391-e4f8c170db06?w=800',cat:'Food',status:'yellow'},
    {name:'Gwangjang Market',pid:'STORE002',img:'https://images.unsplash.com/photo-1563127616-52c3f8730b20?w=800',cat:'Food',status:'green'},
    {name:'Tosokchon',pid:'STORE003',img:'https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=800',cat:'Food',status:'red'}
  ],
  Activity: [
    {name:'Gyeongbokgung',pid:'ACT001',img:'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800',cat:'Act',status:'green'},
    {name:'Han River',pid:'ACT002',img:'https://images.unsplash.com/photo-1610448721566-47369c768e70?w=800',cat:'Act',status:'yellow'}
  ]
};

const statusMap = {
  green:  { color: '#10b981', bg: '#dcfce7', text: '🟢 바로 입장' },
  yellow: { color: '#f59e0b', bg: '#fef3c7', text: '🟡 대기 < 30분' },
  red:    { color: '#ef4444', bg: '#fee2e2', text: '🔴 대기 ≥ 30분' }
};

/* ---------- Routing ---------- */
function parseURL(){
  const url = new URL(location.href);
  return { path: url.pathname, search: url.searchParams };
}

function nav(path, params = {}){
  const u = new URL(location.href);
  u.pathname = path;
  u.search = '';
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, String(v)));
  history.pushState({}, '', u.toString());
  render();
}

window.addEventListener('popstate', render);

/* ---------- Rendering ---------- */
const appRoot = document.getElementById('app');

function render(){
  // App-only build (Landing disabled)
  // - 랜딩/QR 진입(mode, pid, app) 로직은 일단 제외합니다.
  // - 모든 진입을 홈 SPA로 통일하여 UI/상태 로직 꼬임을 원천 차단합니다.
  const path = location.pathname || '/';
  if (path === '/order') return renderOrder();
  return renderHome();
}

/* ---------- UI: Shared Header + Help ---------- */
function closeHelpUI(){
  const helpDrawer = document.getElementById('helpDrawer');
  const helpBackdrop = document.getElementById('helpBackdrop');
  const helpBtn = document.getElementById('helpTabBtn');
  const frame = document.querySelector('.frame');
  if (!helpDrawer) return;
  helpDrawer.classList.remove('open');
  helpBackdrop?.classList.remove('show');
  frame?.classList.remove('help-open');
  if (helpBtn) helpBtn.textContent = 'HELP ▾';
}

function headerHTML(){
  const groupSize = Math.max(1, Number(state.qrGroup?.size || 1));
  const qrLabel = groupSize > 1 ? `My QR × ${groupSize}` : 'My QR';

  return `
    <div class="header" id="mainHeader">
      <div class="left">
        <div class="logo" id="goHome">imake</div>
      </div>
      <div class="center" id="openQR">
        <i data-lucide="qr-code" style="width:18px"></i>
        <span>${qrLabel}</span>
      </div>
      <div class="right">
        <button class="icon-btn" id="btnLang" aria-label="Language"><i data-lucide="globe"></i></button>
        <button class="icon-btn" id="btnLogin" aria-label="Login"><i data-lucide="${state.isLoggedIn ? 'user-check' : 'log-in'}"></i></button>
        <button class="icon-btn" id="btnMenu" aria-label="Menu"><i data-lucide="menu"></i></button>
      </div>    </div>

    <!-- HELP backdrop (dim + outside click close) -->
    <div class="help-backdrop" id="helpBackdrop" aria-hidden="true"></div>

    <!-- HELP: overlay 슬라이드 (body를 밀지 않고 덮음 / header는 항상 위) -->
    <div class="help-drawer" id="helpDrawer" aria-label="Help Drawer">
      <div class="help-panel" aria-label="Help Panel">
        <div class="help-panel-inner">
          <button class="btn primary" id="call1330">📞 1330 관광통역안내</button>
          <div class="small muted">ⓘ 정부기관 운영 실시간 통역서비스 24h / 이용료 무료 / 통화료 별도</div>

          <div class="section-title">EMBASSY (가입 국가기반: 스텁)</div>
          <div class="card" style="padding:10px">
            <div style="font-weight:900">Embassy of (TBD)</div>
            <div class="small muted">Phone: (TBD) / Address: (TBD)</div>
          </div>

          <div class="section-title">MY LOCATION</div>
          <div class="row">
            <button class="btn ghost small" id="btnLocCopy">복사</button>
            <button class="btn ghost small" id="btnLocSend">전송</button>
          </div>
          <div class="small muted">ⓘ 내 위치 정보 텍스트를 복사/전송(지정 번호)합니다.</div>

          <div class="section-title">TRANSLATOR (TBD)</div>
          <textarea class="input" rows="2" placeholder="Type to translate... (prototype only)"></textarea>

          <button class="btn danger" id="btnSOS">📍 SOS 전송(프로토타입)</button>
        </div>
      </div>

      <button class="help-tab-btn" id="helpTabBtn">HELP ▾</button>
    </div>
  `;
}

function bindHeader(){

  $('#goHome').onclick = ()=> nav('/');
  $('#openQR').onclick = ()=> openQRModal();
  $('#btnLang').onclick = ()=> openLangModal();
  $('#btnLogin').onclick = ()=> openLoginModal();
  $('#btnMenu').onclick = ()=> openMenuModal();


  $('#call1330').onclick = ()=> (location.href = 'tel:1330');

  $('#btnLocCopy').onclick = async ()=> {
    const txt = `My location: (prototype) ${new Date().toLocaleString()}`;
    try { await navigator.clipboard.writeText(txt); }
    catch { /* ignore */ }
    openModal({ title:'내 위치', bodyHTML:`<p class="muted">복사되었습니다(가능한 경우).</p><p class="small">${txt}</p>` });
  };
  $('#btnLocSend').onclick = ()=> openModal({ title:'전송', bodyHTML:`<p class="muted">지정 번호 전송은 백엔드/권한 설정 필요(TBD)</p>` });
  $('#btnSOS').onclick = ()=> openModal({ title:'SOS', bodyHTML:`<p class="muted">프로토타입: SOS 이벤트가 기록되었습니다.</p>` });
  // HELP overlay toggle + backdrop + scroll lock
  const helpDrawer = $('#helpDrawer');
  const helpBtn = $('#helpTabBtn');
  const helpBackdrop = $('#helpBackdrop');
  const frame = document.querySelector('.frame');

  const openHelp = ()=>{
    helpDrawer?.classList.add('open');
    helpBackdrop?.classList.add('show');
    frame?.classList.add('help-open');
    if (helpBtn) helpBtn.textContent = 'HELP ▴';
  };

  if (helpBtn && helpDrawer){
    helpBtn.onclick = ()=>{
      const isOpen = helpDrawer.classList.contains('open');
      if (isOpen) closeHelpUI(); else openHelp();
    };
  }

  // Outside click closes
  helpBackdrop?.addEventListener('click', closeHelpUI);

  // ESC closes (desktop convenience) — 1회만 등록
  if (!_escHandlerBound){
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape') closeHelpUI();
    });
    _escHandlerBound = true;
  }
  
}

/* ---------- Home ---------- */
function renderHome(){
  appRoot.innerHTML = `
    ${headerHTML()}
    <div class="content" id="content">
      <div class="dashboard">
        <div class="dash" id="dashTodo"><div class="t">TOTAL TO DO</div><div class="n">${state.todo.length}</div></div>
        <div class="dash" id="dashFav"><div class="t">FAVORITES</div><div class="n">${state.favorites.length}</div></div>
        <div class="dash" id="dashSch"><div class="t">TODAY SCH</div><div class="n">${todayScheduleCount()}</div></div>
      </div>

      <div class="banner" id="savedBanner">
        <div class="meta">
          <span class="badge">Total saved</span>
          <strong>₩ ${fmtKRW(state.savedTotal)}</strong>
        </div>
        <div class="meta">
          <span class="badge">Weather</span>
          <span>${state.weather.icon} ${state.weather.tempC}°C</span>
        </div>
      </div>

      <div class="category">
        ${catBtn('Food','utensils')}
        ${catBtn('Cafe','coffee')}
        ${catBtn('Conv','store')}
        ${catBtn('Hair','scissors')}
        ${catBtn('Activity','ticket')}
        ${catBtn('Shop','shopping-bag')}
      </div>

      <div class="map">
        <div class="marker" id="m1" style="top:50px;left:120px"></div>
        <div class="marker" id="m2" style="top:95px;left:220px"></div>
        <div class="hint">Smart Guide Map (prototype)</div>
      </div>

      <div class="section-title" id="recTitle">Recommended</div>
      <div class="rec-scroll" id="recScroll"></div>

      <div style="height:14px"></div>
      <div class="card">
        <div style="font-weight:900;margin-bottom:6px">Membership</div>
        ${state.isPaid
          ? `<div class="muted">PASS MEMBER 활성화 상태입니다.</div>`
          : `<div class="muted">유료 멤버십이 아닙니다. 제휴업체 5% 할인 + 30,000원 바우처 안내를 확인하세요.</div>
             <div class="modal-actions"><button class="btn primary" id="goPay">멤버십 결제(웹)</button></div>`
        }
      </div>
    </div>

    ${bottomNavHTML('home')}
  `;

  setIcon();
  bindHeader();
  bindBottomNav('home');

  $('#dashTodo').onclick = ()=> openTodoModal();
  $('#dashFav').onclick = ()=> openFavModal();
  $('#dashSch').onclick = ()=> openScheduleModal();

  $('#savedBanner').onclick = ()=> openSavedModal();
  $('#savedBanner').style.cursor = 'pointer';

  // Weather click: 상세 모달
  $('#savedBanner').ondblclick = ()=> openWeatherModal();

  if (!state.isPaid){
    $('#goPay')?.addEventListener('click', ()=> openPayPage());
  }

  // default recommendation
  renderRecs('Activity');
}


/* ---------- Order (QR Menu) ---------- */

let orderDraftTable = '';

function getOrderPartner(){
  const id = state.order?.partnerId || 'STORE001';
  return partnerDB[id] ? { id, ...partnerDB[id] } : { id:'STORE001', ...partnerDB['STORE001'] };
}

function renderOrder(){
  const p = getOrderPartner();

  // initialize draft
  if (!state.order.table) orderDraftTable = orderDraftTable || '';
  const hasTable = Boolean(state.order.table);

  appRoot.innerHTML = `
    ${headerHTML()}
    <div class="content order" id="content">
      <div class="order-top card">
        <div class="row between">
          <div>
            <div class="small muted">QR 메뉴판 (Prototype)</div>
            <div style="font-size:16px;font-weight:900;margin-top:2px">${escapeHTML(p.name)}</div>
            <div class="small muted" style="margin-top:4px">제휴 5% 할인 적용 (시뮬레이션)</div>
          </div>
          <button class="btn ghost small" id="btnSimScan"><i data-lucide="scan-line" style="width:16px"></i> Scan</button>
        </div>

        ${p.wifi ? `
          <div class="wifi-card">
            <div class="wifi-row">
              <div>
                <div class="small muted">WIFI SSID</div>
                <div class="wifi-val" id="wifiSsid">${escapeHTML(p.wifi.ssid)}</div>
              </div>
              <button class="btn ghost small" id="btnCopySsid">복사</button>
            </div>
            <div class="wifi-row">
              <div>
                <div class="small muted">WIFI PASS</div>
                <div class="wifi-val" id="wifiPass">${escapeHTML(p.wifi.pass)}</div>
              </div>
              <button class="btn ghost small" id="btnCopyPass">복사</button>
            </div>
          </div>
        ` : `
          <div class="small muted" style="margin-top:10px">WIFI 정보 없음</div>
        `}
      </div>

      ${hasTable ? orderMenuHTML(p) : orderTableHTML()}
      <div style="height:10px"></div>
      <button class="btn ghost" id="btnResetOrder">테이블 초기화</button>
    </div>

    ${bottomNavHTML('order')}
  `;

  setIcon();
  bindHeader();
  bindBottomNav('order');
  bindOrder(p);
}

function orderTableHTML(){
  const display = orderDraftTable || '--';
  return `
    <div class="card">
      <div style="font-weight:900;margin-bottom:10px">테이블 번호 입력</div>
      <div class="small muted" style="margin-bottom:12px">번호표/테이블 번호를 입력하세요 (최대 2자리)</div>
      <div class="ticket" id="ticketDisplay">${display}</div>

      <div class="numpad" id="numpad">
        ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="num-btn" data-num="${n}">${n}</button>`).join('')}
        <button class="num-btn danger" data-act="C">C</button>
        <button class="num-btn" data-num="0">0</button>
        <button class="num-btn" data-act="BS">←</button>
      </div>

      <button class="btn primary" id="btnConfirmTable" style="width:100%;margin-top:12px">입력 완료</button>
    </div>
  `;
}

function orderMenuHTML(p){
  const menu = p.menu || [];
  return `
    <div class="card">
      <div class="row between" style="align-items:flex-end">
        <div>
          <div class="small muted">Table</div>
          <div style="font-size:18px;font-weight:900;color:var(--primary)">${escapeHTML(state.order.table)}</div>
        </div>
        <button class="btn ghost small" id="btnBill"><i data-lucide="receipt" style="width:16px"></i> Bill</button>
      </div>
      <div class="hr" style="margin:12px 0"></div>

      <div class="menu-list" id="menuList">
        ${menu.map(item=>{
          const oldP = Number(item.price||0);
          const newP = Math.floor(oldP*0.95);
          const qty = Number(state.order.cart?.[item.id] || 0);
          return `
            <div class="menu-item">
              <img class="menu-img" src="${item.img}" alt="">
              <div class="menu-info">
                <div style="font-weight:900">${escapeHTML(item.name)}</div>
                <div class="prices">
                  <span class="old">₩ ${fmtKRW(oldP)}</span>
                  <span class="new">₩ ${fmtKRW(newP)}</span>
                  <span class="disc">-5%</span>
                </div>
                <div class="qty">
                  <button class="qty-btn" data-qty="-1" data-id="${item.id}">-</button>
                  <span class="qty-n" id="qty-${item.id}">${qty}</span>
                  <button class="qty-btn" data-qty="1" data-id="${item.id}">+</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="cart-bar">
        <div class="total">₩ <span id="orderTotal">0</span></div>
        <button class="btn primary" id="btnOrder" disabled>주문하기</button>
      </div>
    </div>
  `;
}

function bindOrder(p){
  // simulate scan: choose partner
  $('#btnSimScan')?.addEventListener('click', ()=>{
    const options = Object.entries(partnerDB).map(([id,v])=>`
      <button class="list-btn" data-pid="${id}">
        <div style="font-weight:900">${escapeHTML(v.name)}</div>
        <div class="small muted">${escapeHTML(v.type)}</div>
      </button>
    `).join('');

    openModal({
      title:'Simulate QR Scan',
      bodyHTML:`<p class="muted" style="margin-top:0">파트너를 선택하면 메뉴판이 바뀝니다(프로토타입).</p><div class="list">${options}</div>`
    });
    setIcon();
    $$('#modalBox .list-btn').forEach(btn=>{
      btn.onclick = ()=>{
        const id = btn.getAttribute('data-pid');
        state.order.partnerId = id;
        state.order.table = '';
        state.order.cart = {};
        state.order.confirmed = [];
        orderDraftTable = '';
        saveState();
        closeModal();
        nav('/order');
      };
    });
  });

  // wifi copy
  $('#btnCopySsid')?.addEventListener('click', ()=> copyText($('#wifiSsid')?.textContent || ''));
  $('#btnCopyPass')?.addEventListener('click', ()=> copyText($('#wifiPass')?.textContent || ''));

  // reset table
  $('#btnResetOrder')?.addEventListener('click', ()=>{
    state.order.table = '';
    state.order.cart = {};
    saveState();
    orderDraftTable = '';
    nav('/order');
  });

  // table step
  if (!state.order.table){
    $$('#numpad .num-btn').forEach(b=>{
      b.onclick = ()=>{
        const act = b.getAttribute('data-act');
        const num = b.getAttribute('data-num');
        if (act === 'C') orderDraftTable = '';
        else if (act === 'BS') orderDraftTable = orderDraftTable.slice(0, -1);
        else if (num){
          if (orderDraftTable.length < 2) orderDraftTable += num;
        }
        $('#ticketDisplay').textContent = orderDraftTable || '--';
      };
    });

    $('#btnConfirmTable')?.addEventListener('click', ()=>{
      if (!orderDraftTable) return;
      openModal({
        title:'테이블 확인',
        bodyHTML:`
          <div style="text-align:center">
            <div class="small muted">입력하신 번호가 맞나요?</div>
            <div style="font-size:52px;font-weight:900;color:var(--primary);margin:18px 0">${escapeHTML(orderDraftTable)}</div>
            <div class="modal-actions">
              <button class="btn ghost" id="btnEditTable">수정</button>
              <button class="btn primary" id="btnOkTable">OK</button>
            </div>
          </div>
        `
      });
      setIcon();
      $('#btnEditTable')?.addEventListener('click', ()=> closeModal());
      $('#btnOkTable')?.addEventListener('click', ()=>{
        state.order.table = orderDraftTable;
        saveState();
        closeModal();
        nav('/order');
      });
    });

    return;
  }

  // menu step
  // qty buttons
  $$('#menuList .qty-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      const chg = Number(btn.getAttribute('data-qty'));
      const cur = Number(state.order.cart?.[id] || 0);
      const next = Math.max(0, cur + chg);
      state.order.cart[id] = next;
      saveState();
      $('#qty-'+id).textContent = String(next);
      calcOrderTotal(p);
    };
  });

  $('#btnBill')?.addEventListener('click', ()=> openOrderBill(p));
  $('#btnOrder')?.addEventListener('click', ()=> openOrderSummary(p));

  calcOrderTotal(p);
}

function calcOrderTotal(p){
  const menu = p.menu || [];
  let total = 0;
  let count = 0;
  for (const item of menu){
    const qty = Number(state.order.cart?.[item.id] || 0);
    if (!qty) continue;
    const newP = Math.floor(Number(item.price||0)*0.95);
    total += newP * qty;
    count += qty;
  }
  $('#orderTotal').textContent = fmtKRW(total);
  const btn = $('#btnOrder');
  if (btn) btn.disabled = (count === 0);
  return { total, count };
}

function openOrderSummary(p){
  const menu = p.menu || [];
  let rows = '';
  let total = 0;
  let saved = 0;

  for (const item of menu){
    const qty = Number(state.order.cart?.[item.id] || 0);
    if (!qty) continue;
    const oldP = Number(item.price||0);
    const newP = Math.floor(oldP*0.95);
    rows += `<div class="bill-row"><span>${escapeHTML(item.name)} x ${qty}</span><span>₩ ${fmtKRW(newP*qty)}</span></div>`;
    total += newP*qty;
    saved += Math.max(0, (oldP - newP) * qty);
  }

  openModal({
    title:'Confirm Order',
    bodyHTML:`
      <div class="bill">
        ${rows || `<p class="muted">선택된 메뉴가 없습니다.</p>`}
        <div class="bill-total"><span>Total</span><span style="color:var(--danger)">₩ ${fmtKRW(total)}</span></div>
        <div class="small muted" style="margin-top:8px">Saved (5%): ₩ ${fmtKRW(saved)}</div>
        <div class="modal-actions">
          <button class="btn ghost" id="btnEditOrder">수정</button>
          <button class="btn primary" id="btnSubmitOrder">Submit</button>
        </div>
      </div>
    `
  });

  $('#btnEditOrder')?.addEventListener('click', ()=> closeModal());
  $('#btnSubmitOrder')?.addEventListener('click', ()=>{
    // move to confirmed
    state.order.confirmed ||= [];
    for (const item of menu){
      const qty = Number(state.order.cart?.[item.id] || 0);
      if (!qty) continue;
      const newP = Math.floor(Number(item.price||0)*0.95);
      state.order.confirmed.push({ name:item.name, qty, unit:newP, total:newP*qty });
    }

    // accumulate saved
    state.savedTotal = Number(state.savedTotal||0) + Number(saved||0);

    // clear cart (keep table for additional orders)
    state.order.cart = {};
    saveState();
    closeModal();

    // quick success
    openModal({
      title:'Success',
      bodyHTML:`<div style="text-align:center"><div style="font-size:18px;font-weight:900;margin-top:4px">Order Accepted!</div><p class="muted">Preparing your food.</p></div>`
    });

    // add history entry (order submitted)
    state.history.unshift({
      at: nowISO(),
      title: `Order submitted (Table ${state.order.table})`,
      meta: `${p.name} / Total ₩ ${fmtKRW(total)} / Saved ₩ ${fmtKRW(saved)}`
    });
    saveState();

    setTimeout(()=>{ closeModal(); nav('/order'); }, 900);
  });

  setIcon();
}

function openOrderBill(p){
  const confirmed = state.order.confirmed || [];
  const menu = p.menu || [];

  let gt = 0;
  const confirmedRows = confirmed.map(o=>{
    gt += Number(o.total||0);
    return `<div class="bill-row"><span>${escapeHTML(o.name)} x ${o.qty}</span><span>₩ ${fmtKRW(o.total)}</span></div>`;
  }).join('');

  // current cart (new)
  let ct = 0;
  let newRows = '';
  for (const item of menu){
    const qty = Number(state.order.cart?.[item.id] || 0);
    if (!qty) continue;
    const newP = Math.floor(Number(item.price||0)*0.95);
    ct += newP*qty;
    newRows += `<div class="bill-row" style="color:var(--primary)"><span>[New] ${escapeHTML(item.name)} x ${qty}</span><span>₩ ${fmtKRW(newP*qty)}</span></div>`;
  }

  openModal({
    title:'Your Bill',
    bodyHTML:`
      <div class="bill">
        ${confirmedRows || `<p class="muted">확정 주문이 없습니다.</p>`}
        ${newRows ? `<div class="hr" style="margin:10px 0"></div>${newRows}` : ``}
        <div class="bill-total"><span>Total</span><span style="color:var(--danger)">₩ ${fmtKRW(gt+ct)}</span></div>

        <div class="modal-actions" style="flex-direction:column">
          <button class="btn primary" id="btnPayFinish">Pay & Finish</button>
          <button class="btn ghost" id="btnContinue">Continue</button>
        </div>
      </div>
    `
  });

  $('#btnContinue')?.addEventListener('click', ()=> closeModal());
  $('#btnPayFinish')?.addEventListener('click', ()=>{
    // finalize
    state.history.unshift({
      at: nowISO(),
      title: `Dining finished (Table ${state.order.table})`,
      meta: `${p.name} / Total ₩ ${fmtKRW(gt+ct)}`
    });
    state.order.table = '';
    state.order.cart = {};
    state.order.confirmed = [];
    saveState();
    closeModal();
    nav('/');
  });

  setIcon();
}

function copyText(t){
  if (!t) return;
  if (navigator.clipboard?.writeText){
    navigator.clipboard.writeText(t).then(()=> toast('복사되었습니다.'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('복사되었습니다.');
  }
}


function catBtn(cat, icon){
  return `<button class="cat" data-cat="${cat}"><i data-lucide="${icon}" style="width:14px"></i><span>${cat}</span></button>`;
}

function renderRecs(cat){
  const items = (placeDB[cat] || placeDB.Activity).slice(0, 10);
  const wrap = $('#recScroll');
  wrap.innerHTML = items.map(i=>{
    const st = statusMap[i.status] || statusMap.green;
    return `
      <div class="rec-card" data-pid="${i.pid}" data-name="${i.name}" data-cat="${i.cat}" data-img="${i.img}" data-status="${i.status}">
        <img class="rec-img" src="${i.img}" alt="">
        <div class="status-badge"><span class="dot" style="background:${st.color}"></span><span>${i.status}</span></div>
        <div class="rec-info">
          <div class="rec-name">${i.name}</div>
          <i data-lucide="more-vertical" style="width:16px;color:#cbd5e1"></i>
        </div>
      </div>
    `;
  }).join('');

  // markers move color
  const color = cat === 'Food' ? '#ef4444' : (cat === 'Activity' ? '#3b82f6' : '#10b981');
  $$('.marker').forEach(m=>{
    m.style.background = color;
    m.style.left = (Math.random()*230 + 60) + 'px';
  });

  setIcon();

  // bind cats
  $$('.cat').forEach(btn=>{
    btn.onclick = ()=>{
      const c = btn.getAttribute('data-cat');
      renderRecs(c);
    };
  });

  // bind cards
  $$('.rec-card').forEach(card=>{
    card.onclick = ()=>{
      const name = card.getAttribute('data-name');
      const pid = card.getAttribute('data-pid');
      const img = card.getAttribute('data-img');
      const status = card.getAttribute('data-status');
      openPlaceSheet({ name, pid, img, status });
    };
  });
}

/* ---------- Bottom Nav ---------- */
function bottomNavHTML(active){
  return `
    <div class="bottom-nav" id="bottomNav">
      ${navBtn('home','Home','home', active==='home')}
      ${navBtn('map','Map','map', active==='map')}
      ${navBtn('order','Order','scan-line', active==='order')}
      ${navBtn('myfit','My fit','sparkles', active==='myfit')}
      ${navBtn('history','History','clock', active==='history')}
    </div>
  `;
}
function navBtn(key, label, icon, isActive){
  return `
    <button class="nav-btn ${isActive?'active':''}" data-nav="${key}">
      <i data-lucide="${icon}" style="width:20px"></i>
      <span>${label}</span>
    </button>
  `;
}
function bindBottomNav(active){
  $$('#bottomNav .nav-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const k = btn.getAttribute('data-nav');
      if (k === 'home') return nav('/');
      if (k === 'map') return openMapPage();
      if (k === 'order') return nav('/order');
      if (k === 'myfit') return openMyFitPage();
      if (k === 'history') return openHistoryPage();
    };
  });
}

/* ---------- Modals: QR / Lang / Login / Menu ---------- */
function openQRModal(){
  const groupSize = Math.max(1, Number(state.qrGroup?.size || 1));
  const badge = state.isPaid ? `<div class="badge">PASS MEMBER</div>` : `<div class="badge" style="background:#f1f5f9;color:#64748b">FREE</div>`;
  openModal({
    title: 'My QR',
    rightHTML: `<button class="icon-btn" id="qrPlus" aria-label="QR Group"><i data-lucide="users"></i></button>`,
    bodyHTML: `
      <div class="card" style="text-align:center">
        ${badge}
        <div style="margin:12px 0">
          <i data-lucide="qr-code" style="width:120px;height:120px"></i>
        </div>
        <div style="font-weight:900">${groupSize > 1 ? `그룹 QR × ${groupSize}` : '개인 QR'}</div>
        <p class="muted small" style="margin-top:6px">멤버십 상태/할인/바우처 안내는 아래에서 확인</p>
      </div>

      <div class="hr"></div>

      <div class="card">
        <div style="font-weight:900;margin-bottom:6px">혜택 안내</div>
        <ul class="small muted" style="margin:0;padding-left:18px">
          <li>제휴업체 무제한 5% 할인</li>
          <li>30,000원 필수 할인 바우처 제공(정책 TBD)</li>
          <li>비유료 회원: 1 day free 홍보/업셀 노출</li>
        </ul>
      </div>

      <div class="modal-actions">
        <button class="btn ghost" id="btnGroupBind">QR 묶기</button>
        <button class="btn ghost" id="btnGroupSend">QR 보내기</button>
        <button class="btn ghost" id="btnGroupSplit">QR 나누기</button>
      </div>
    `
  });

  $('#qrPlus')?.addEventListener('click', ()=> openGroupModal());
  $('#btnGroupBind')?.addEventListener('click', ()=> openGroupModal('bind'));
  $('#btnGroupSend')?.addEventListener('click', ()=> openGroupModal('send'));
  $('#btnGroupSplit')?.addEventListener('click', ()=> openGroupModal('split'));
}

function openGroupModal(mode='bind'){
  const map = { bind:'QR 묶기', send:'QR 보내기', split:'QR 나누기' };
  openModal({
    title: map[mode] || 'QR 그룹',
    bodyHTML: `
      <p class="muted">프로토타입 스텁입니다. 실제 구현 시 백엔드(권한/토큰/만료/회수) 필요.</p>
      <div class="card">
        <div style="font-weight:900;margin-bottom:6px">현재 그룹</div>
        <div class="muted small">인원: ${Math.max(1, Number(state.qrGroup?.size||1))}</div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" id="groupInc">+1 (테스트)</button>
        <button class="btn ghost" id="groupDec">-1 (테스트)</button>
      </div>
    `
  });
  $('#groupInc').onclick = ()=>{
    state.qrGroup.size = Math.min(4, Math.max(1, (state.qrGroup.size||1) + 1));
    saveState(); closeModal(); render();
  };
  $('#groupDec').onclick = ()=>{
    state.qrGroup.size = Math.max(1, (state.qrGroup.size||1) - 1);
    saveState(); closeModal(); render();
  };
}

function openLangModal(){
  openModal({
    title:'Language',
    bodyHTML: `
      <div class="list">
        ${['KOR','ENG','JPN','CNA'].map(l=>`
          <button class="btn ghost" data-lang="${l}" style="width:100%;justify-content:flex-start;text-align:left">
            ${l} ${state.lang===l?'✓':''}
          </button>
        `).join('')}
      </div>
    `
  });
  $$('[data-lang]').forEach(btn=>{
    btn.onclick = ()=>{
      state.lang = btn.getAttribute('data-lang');
      saveState(); closeModal(); render();
    };
  });
}

function openLoginModal(){
  openModal({
    title:'Login',
    bodyHTML: `
      <p class="muted">소셜 로그인 UI 스텁입니다.</p>
      <div class="list">
        ${['Google','Instagram','Facebook','Apple'].map(p=>`<button class="btn ghost" data-login="${p}" style="width:100%">${p}로 계속</button>`).join('')}
      </div>
      <div class="hr"></div>
      <button class="btn ${state.isLoggedIn?'ghost':'primary'}" id="toggleLogin" style="width:100%">
        ${state.isLoggedIn?'로그아웃(테스트)':'로그인(테스트)'}
      </button>
    `
  });
  $('#toggleLogin').onclick = ()=>{
    state.isLoggedIn = !state.isLoggedIn;
    saveState(); closeModal(); render();
  };
}

function openMenuModal(){
  openModal({
    title:'Menu',
    bodyHTML: `
      <div class="list">
        ${menuItem('My profile','user')}
        ${menuItem('My history','clock')}
        ${menuItem('유료 멤버십 혜택(바우처)','ticket')}
        ${menuItem('Map','map')}
        ${menuItem('검색(TBD)','search')}
        ${menuItem('Spot event','sparkles')}
        ${menuItem('축제/행사 모음','calendar')}
        ${menuItem('서울/경기 핫플레이스','map-pin')}
        ${menuItem('서울/경기 소개','book-open')}
        ${menuItem('지방 관광(TBD)','compass')}
        ${menuItem('무료로 즐기는 한국','leaf')}
      </div>
    `
  });
  // 간단 라우팅
  $('#mi-My\ history')?.addEventListener('click', ()=>{ closeModal(); openHistoryPage(); });
  $('#mi-Map')?.addEventListener('click', ()=>{ closeModal(); openMapPage(); });
}

function menuItem(label, icon){
  const id = 'mi-' + label.replace(/[^a-zA-Z0-9가-힣 ]/g,'').replace(/ /g,'\ ');
  return `
    <button class="btn ghost" id="${id}" style="width:100%;display:flex;gap:10px;align-items:center;justify-content:flex-start">
      <i data-lucide="${icon}" style="width:18px"></i>
      <span style="font-weight:900">${label}</span>
    </button>
  `;
}

/* ---------- ToDo / Fav / Schedule ---------- */
function todayScheduleCount(){
  return state.schedule.filter(x=>x.date === today() && !x.done).length;
}

function normalizeTodoToSchedule(){
  // todo 중 date가 오늘인 항목은 schedule로 이동(자동)
  const toMove = state.todo.filter(t => t.date === today());
  if (!toMove.length) return;

  toMove.forEach(t=>{
    state.schedule.push({
      id: t.id,
      title: t.title,
      date: today(),
      time: t.time || '',
      done: false,
      createdAt: t.createdAt || nowISO()
    });
  });
  state.todo = state.todo.filter(t => t.date !== today());
  saveState();
}

function openTodoModal(){
  normalizeTodoToSchedule();
  // 정렬: date 지정 오름차순 -> 미정 입력순(createdAt)
  const withDate = state.todo.filter(t=>t.date).sort((a,b)=> (a.date+b.time).localeCompare(b.date+b.time));
  const noDate = state.todo.filter(t=>!t.date).sort((a,b)=> (a.createdAt||'').localeCompare(b.createdAt||''));
  const done = [...withDate, ...noDate].filter(t=>t.done);
  const undone = [...withDate, ...noDate].filter(t=>!t.done);
  const list = [...undone, ...done];

  openModal({
    title:'To do list',
    rightHTML:`<button class="icon-btn" id="todoAdd"><i data-lucide="plus"></i></button>`,
    bodyHTML: `
      <div class="list">
        ${list.length ? list.map(renderTodoItem).join('') : `<p class="muted">비어 있습니다.</p>`}
      </div>
    `
  });
  $('#todoAdd').onclick = ()=> openTodoAddModal();
  $$('.todo-toggle').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      const t = state.todo.find(x=>x.id===id);
      if(!t) return;
      t.done = !t.done;
      saveState();
      closeModal(); openTodoModal();
    };
  });
  $$('.todo-edit').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      openTodoEditModal(id);
    };
  });

  $$('.todo-del').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      openConfirmModal({
        title: '삭제',
        message: '이 항목을 삭제하시겠습니까?',
        okText: '삭제',
        cancelText: '취소',
        onOk: ()=>{
          state.todo = state.todo.filter(x=>x.id!==id);
          saveState();
          closeModal();
          openTodoModal();
        }
      });
    };
  });

}

function renderTodoItem(t){
  const checked = t.done ? 'checked' : '';
  const faded = t.done ? 'style="opacity:.5"' : '';
  const dt = t.date ? `${t.date}${t.time ? ' ' + t.time : ''}` : '날짜 미정';
  return `
    <div class="list-item" ${faded}>
      <div class="row" style="gap:10px;flex:1">
        <div class="checkbox ${checked} todo-toggle" data-id="${t.id}">${t.done?'✓':''}</div>
        <div style="flex:1">
          <div style="font-weight:900">${t.title}</div>
          <div class="small muted">${dt}</div>
        </div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn ghost small todo-edit" data-id="${t.id}">편집</button>
        <button class="btn ghost small todo-del" data-id="${t.id}">삭제</button>
      </div>
    </div>
  `;
}

function openTodoAddModal(){
  openModal({
    title:'할 일 추가',
    bodyHTML: `
      <div class="list">
        <input class="input" id="todoTitle" placeholder="할 일 제목" />
        <div class="row">
          <input class="input" id="todoDate" type="date" />
          <input class="input" id="todoTime" type="time" />
        </div>
        <button class="btn primary" id="todoSave" style="width:100%">저장</button>
      </div>
    `
  });
  $('#todoSave').onclick = ()=>{
    const title = $('#todoTitle').value.trim();
    if(!title) return;
    const date = $('#todoDate').value || '';
    const time = $('#todoTime').value || '';
    state.todo.push({ id: Date.now(), title, date, time, done:false, createdAt: nowISO() });
    saveState();
    closeModal();
    openTodoModal();
  };
}

function openTodoEditModal(id){
  const t = state.todo.find(x=>x.id===id);
  if(!t) return;
  openModal({
    title:'할 일 편집',
    bodyHTML: `
      <div class="list">
        <input class="input" id="todoTitle" value="${escapeHTML(t.title)}" />
        <div class="row">
          <input class="input" id="todoDate" type="date" value="${t.date||''}" />
          <input class="input" id="todoTime" type="time" value="${t.time||''}" />
        </div>
        <div class="modal-actions">
          <button class="btn ghost" id="todoDel">삭제</button>
          <button class="btn primary" id="todoSave">저장</button>
        </div>
      </div>
    `
  });
  $('#todoSave').onclick = ()=>{
    t.title = $('#todoTitle').value.trim() || t.title;
    t.date = $('#todoDate').value || '';
    t.time = $('#todoTime').value || '';
    saveState(); closeModal(); openTodoModal();
  };
  $('#todoDel').onclick = ()=>{
    state.todo = state.todo.filter(x=>x.id!==id);
    saveState(); closeModal(); openTodoModal();
  };
}

function openFavModal(){
  openModal({
    title:'Favorites',
    bodyHTML: `
      <div class="list">
        ${state.favorites.length ? state.favorites.map(f=>{
          const d = f.date || '';
          const t = f.time || '';
          const when = (d || t) ? `${d || '날짜 미정'}${t ? ' ' + t : ''}` : '날짜/시간 미정';
          return `
            <div class="list-item">
              <div class="row" style="flex:1; gap:10px; align-items:flex-start">
                <span class="badge">${f.cat}</span>
                <div style="flex:1">
                  <div style="font-weight:900">${f.title}</div>
                  <div class="small muted">예약/방문: ${when}</div>
                </div>
              </div>
              <div class="row" style="gap:6px">
                <button class="btn ghost small fav-edit" data-id="${f.id}">편집</button>
                <button class="btn ghost small fav-del" data-id="${f.id}">삭제</button>
              </div>
            </div>
          `;
        }).join('') : `<p class="muted">비어 있습니다.</p>`}
      </div>
      <p class="small muted" style="margin-top:10px">편집에서 날짜/시간을 지정할 수 있습니다.</p>
    `
  });

  $$('.fav-edit').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      openFavEditModal(id);
    };
  });

  $$('.fav-del').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      openConfirmModal({
        title:'삭제',
        message:'즐겨찾기를 삭제하시겠습니까?',
        okText:'삭제',
        cancelText:'취소',
        onOk: ()=>{
          state.favorites = state.favorites.filter(x=>x.id!==id);
          saveState();
          closeModal();
          openFavModal();
        }
      });
    };
  });
}

function openFavEditModal(id){
  const f = state.favorites.find(x=>x.id===id);
  if(!f) return;

  openModal({
    title: 'Favorite 편집',
    bodyHTML: `
      <div class="card">
        <div style="font-weight:900">${f.title}</div>
        <div class="small muted" style="margin-top:4px">${f.cat}</div>
      </div>

      <div class="card" style="margin-top:12px">
        <div class="section-title" style="margin-bottom:8px">날짜/시간 지정</div>
        <div class="row" style="gap:10px">
          <input id="favDate" class="input" type="date" value="${f.date || ''}">
          <input id="favTime" class="input" type="time" value="${f.time || ''}">
        </div>
        <div class="small muted" style="margin-top:8px">빈 값으로 저장하면 날짜/시간은 미정 처리됩니다.</div>
      </div>

      <div class="modal-actions" style="margin-top:14px">
        <button class="btn ghost" id="favCancel">취소</button>
        <button class="btn primary" id="favSave">저장</button>
      </div>
    `
  });

  $('#favCancel').onclick = ()=>{ closeModal(); openFavModal(); };
  $('#favSave').onclick = ()=>{
    const d = ($('#favDate').value || '').trim();
    const t = ($('#favTime').value || '').trim();
    f.date = d; // '' 가능
    f.time = t; // '' 가능
    saveState();
    closeModal();
    openFavModal();
  };
}


function openScheduleModal(){
  normalizeTodoToSchedule();
  const list = state.schedule
    .filter(s=>s.date === today())
    .sort((a,b)=> (a.time||'99:99').localeCompare(b.time||'99:99'));

  openModal({
    title:'Today schedule',
    rightHTML:`<button class="icon-btn" id="schAdd"><i data-lucide="plus"></i></button>`,
    bodyHTML: `
      <div class="list">
        ${list.length ? list.map(renderSchItem).join('') : `<p class="muted">오늘 일정이 없습니다.</p>`}
      </div>
      <p class="small muted" style="margin-top:10px">알람(30분 전): 프로토타입에서는 UI만 반영, OS 알림은 앱/푸시 연동 필요</p>
    `
  });

  $('#schAdd').onclick = ()=> openScheduleAddModal();
  $$('.sch-toggle').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      const s = state.schedule.find(x=>x.id===id);
      if(!s) return;
      s.done = !s.done;

      // 미체크(완료해제) -> todo로 이동 규칙(요구사항 반영)
      if (!s.done){
        state.todo.push({ id: Date.now(), title: s.title, date: '', time: '', done:false, createdAt: nowISO() });
        state.schedule = state.schedule.filter(x=>x.id!==id);
      }
      saveState(); closeModal(); openScheduleModal();
    };
  });

  $$('.sch-edit').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      openScheduleEditModal(id);
    };
  });

  $$('.sch-del').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      openConfirmModal({
        title: '삭제',
        message: '이 일정을 삭제하시겠습니까?',
        okText: '삭제',
        cancelText: '취소',
        onOk: ()=>{
          state.schedule = state.schedule.filter(x=>x.id!==id);
          saveState();
          closeModal();
          openScheduleModal();
        }
      });
    };
  });

}

function renderSchItem(s){
  const checked = s.done ? 'checked' : '';
  const faded = (s.done) ? 'style="opacity:.5"' : '';
  const isPast = s.time && (s.time < new Date().toTimeString().slice(0,5));
  const pastStyle = (!s.done && isPast) ? 'style="opacity:.55"' : '';
  return `
    <div class="list-item" ${faded}>
      <div class="row" style="gap:10px;flex:1" ${pastStyle}>
        <div class="checkbox ${checked} sch-toggle" data-id="${s.id}">${s.done?'✓':''}</div>
        <div style="flex:1">
          <div style="font-weight:900">${s.title}</div>
          <div class="small muted">${s.time || '시간 미정'}</div>
        </div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn ghost small sch-edit" data-id="${s.id}">편집</button>
        <button class="btn ghost small sch-del" data-id="${s.id}">삭제</button>
      </div>
    </div>
  `;
}

function openScheduleAddModal(){
  openModal({
    title:'오늘 일정 추가',
    bodyHTML: `
      <div class="list">
        <input class="input" id="schTitle" placeholder="오늘 할 일" />
        <input class="input" id="schTime" type="time" />
        <button class="btn primary" id="schSave" style="width:100%">저장</button>
      </div>
    `
  });
  $('#schSave').onclick = ()=>{
    const title = $('#schTitle').value.trim();
    if(!title) return;
    const time = $('#schTime').value || '';
    state.schedule.push({ id: Date.now(), title, date: today(), time, done:false, createdAt: nowISO() });
    saveState(); closeModal(); openScheduleModal();
  };
}

function openScheduleEditModal(id){
  const s = state.schedule.find(x=>x.id===id);
  if(!s) return;

  openModal({
    title: 'Schedule 편집',
    bodyHTML: `
      <div class="card">
        <div class="section-title" style="margin-bottom:8px">내용</div>
        <input id="schTitle" class="input" type="text" value="${escapeHTML(s.title)}" placeholder="일정 제목">
      </div>

      <div class="card" style="margin-top:12px">
        <div class="section-title" style="margin-bottom:8px">시간</div>
        <input id="schTime" class="input" type="time" value="${s.time || ''}">
        <div class="small muted" style="margin-top:8px">빈 값으로 저장하면 시간은 미정 처리됩니다.</div>
      </div>

      <div class="modal-actions" style="margin-top:14px">
        <button class="btn ghost" id="schEditCancel">취소</button>
        <button class="btn primary" id="schEditSave">저장</button>
      </div>
    `
  });

  $('#schEditCancel').onclick = ()=>{ closeModal(); openScheduleModal(); };
  $('#schEditSave').onclick = ()=>{
    const title = ($('#schTitle').value || '').trim();
    const time = ($('#schTime').value || '').trim();
    if (!title){
      openToast('제목을 입력해 주세요.');
      return;
    }
    s.title = title;
    s.time = time;
    saveState();
    closeModal();
    openScheduleModal();
  };
}


/* ---------- Saved / Weather ---------- */
function openSavedModal(){
  openModal({
    title:'할인 내역서',
    bodyHTML: `
      <p class="muted">프로토타입: 저장된 총 할인액만 표시합니다.</p>
      <div class="card">
        <div style="font-weight:900">Total saved</div>
        <div style="font-size:22px;font-weight:900;color:var(--primary);margin-top:6px">₩ ${fmtKRW(state.savedTotal)}</div>
      </div>
    `
  });
}
function openWeatherModal(){
  openModal({
    title:'날씨',
    bodyHTML: `
      <p class="muted">프로토타입(스텁). 서버가 10분 단위로 수집 후 전달하는 구조는 백엔드에서 구현합니다.</p>
      <div class="card">
        <div style="font-weight:900">${state.weather.city}</div>
        <div style="font-size:22px;font-weight:900;color:var(--primary);margin-top:6px">${state.weather.icon} ${state.weather.tempC}°C</div>
        <div class="small muted" style="margin-top:6px">updated: ${new Date(state.weather.updatedAt).toLocaleString()}</div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="wxRefresh">새로고침(테스트)</button>
      </div>
    `
  });
  $('#wxRefresh').onclick = ()=>{
    // 스텁: 랜덤 온도
    state.weather.tempC = Math.round(Math.random()*10);
    state.weather.updatedAt = nowISO();
    saveState(); closeModal(); openWeatherModal();
  };
}

/* ---------- Place action sheet ---------- */
function openPlaceSheet({name, pid, img, status}){
  const isFav = state.favorites.some(f=>f.title===name);
  const st = statusMap[status] || statusMap.green;
  openModal({
    title: name,
    bodyHTML: `
      <img src="${img}" alt="" style="width:100%;border-radius:16px;margin-bottom:12px;max-height:160px;object-fit:cover">
      <div style="background:${st.bg};color:${st.color};padding:10px;border-radius:12px;font-weight:900;text-align:center;margin-bottom:10px">
        ${st.text}
      </div>

      <div class="modal-actions" style="flex-wrap:wrap">
        <button class="btn ghost" id="btnAddTodo">To do 추가</button>
        <button class="btn ghost" id="btnFav">${isFav?'즐겨찾기 해제':'즐겨찾기 추가'}</button>
        <button class="btn primary" id="btnOpen">상세 보기</button>
      </div>
    `
  });

  $('#btnAddTodo').onclick = ()=>{
    state.todo.push({ id: Date.now(), title: name, date:'', time:'', done:false, createdAt: nowISO() });
    saveState(); closeModal(); render();
  };
  $('#btnFav').onclick = ()=>{
    if (isFav){
      state.favorites = state.favorites.filter(f=>f.title!==name);
    } else {
      state.favorites.push({ id: Date.now(), title: name, cat: 'TBD', img });
    }
    saveState(); closeModal(); render();
  };
  $('#btnOpen').onclick = ()=>{
    closeModal();
    nav('/place', { pid });
  };
}

/* ---------- Pages: Map / MyFit / History / Place ---------- */
function openMapPage(){
  openModal({
    title:'Map',
    bodyHTML:`<p class="muted">지도 검색 개별 페이지는 정식 구현 시 카카오/네이버/구글 중 선택 후 API 연동합니다(TBD).</p>`
  });
}

function openMyFitPage(){
  openModal({
    title:'My fit',
    bodyHTML:`<p class="muted">국가/연령 취향 기반 추천 페이지(현재 위치 무관). 데이터 모델/추천 로직 TBD.</p>`
  });
}

function openHistoryPage(){
  openModal({
    title:'My history',
    bodyHTML: `
      <p class="muted">방문 기록/QR 할인 내역/주문 내역을 다이어리 형식으로 표시(프로토타입).</p>
      <div class="list">
        ${state.history.length ? state.history.map(h=>`
          <div class="card">
            <div class="small muted">${new Date(h.at).toLocaleString()}</div>
            <div style="font-weight:900;margin-top:4px">${h.title}</div>
            <div class="small muted">${h.meta||''}</div>
          </div>
        `).join('') : `<p class="muted">기록이 없습니다.</p>`}
      </div>
      <div class="hr"></div>
      <button class="btn ghost" id="histReset" style="width:100%">Reset Demo</button>
    `
  });
  $('#histReset').onclick = ()=>{
    state = structuredClone(defaultState);
    saveState();
    closeModal();
    render();
  };
}

/* ---------- Landing: entrance/menu ---------- */
function renderLandingEntrance(pid, isApp){
  const p = partnerDB[pid] || { name:'Unknown Partner', desc:'', heroImg:'' };

  // 요구사항(초기): 랜딩은 헤더 제외
  // 실제 운영/테스트 편의를 위해, app=1(앱 설치자/앱모드)에서는 헤더+하단탭을 노출하도록 개선
  const installBlock = isApp ? '' : `
    <div class="card" style="margin-top:12px">
      <div style="font-weight:900">멤버십 할인 앱, imake</div>
      <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
        <li>멤버십 패스: 제휴업체 무제한 5% 할인</li>
        <li>30,000원 필수 할인 바우처 제공</li>
        <li>앱 설치 후 1 day free로 즐겨보세요</li>
      </ul>
      <div class="modal-actions" style="margin-top:10px">
        <button class="btn primary" id="btnInstall">앱 설치</button>
        <button class="btn ghost" id="btnOpenApp">앱 열기</button>
      </div>
    </div>
  `;

  appRoot.innerHTML = `
    ${isApp ? headerHTML() : ''}
    <div class="content ${isApp ? '' : 'landing'}" id="content">
      ${isApp ? '' : `<div class="logo" style="font-size:22px">imake</div>`}
      <div style="margin-top:${isApp ? 0 : 10}px">
        ${p.heroImg ? `<img src="${p.heroImg}" style="width:100%;border-radius:18px;max-height:220px;object-fit:cover">` : ''}
      </div>
      <h2 style="margin-top:12px">${p.name}</h2>
      <p class="muted" style="margin-top:6px">${p.desc||''}</p>

      <div class="hr"></div>

      ${p.type === 'Food' ? `
        <div class="section-title">MENU (preview)</div>
        <div class="list">
          ${(p.menu||[]).map(m=>`
            <div class="card">
              <div style="font-weight:900">${m.name}</div>
              <div class="small muted">₩ ${fmtKRW(m.price)}</div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="section-title">ACTIVITY</div>
        <div class="card"><div style="font-weight:900">상세 안내</div><div class="small muted">프로그램/티켓 정보는 앱에서 확인</div></div>
      `}

      ${installBlock}

      <div style="margin-top:14px">
        <button class="btn ghost" id="btnBack" style="width:100%">홈으로</button>
      </div>
    </div>

    ${bottomNavHTML('home')}
  `;

  setIcon();
  if (isApp) { bindHeader(); }
  bindBottomNav('home');

  $('#btnBack').onclick = ()=> { history.pushState({}, '', '/'); render(); };

  $('#btnInstall')?.addEventListener('click', ()=> openModal({ title:'Install', bodyHTML:`<p class="muted">스토어 링크는 TBD. (Play/App Store)</p>` }));
  $('#btnOpenApp')?.addEventListener('click', ()=> openModal({ title:'Open App', bodyHTML:`<p class="muted">딥링크/유니버설 링크는 앱 패키지/도메인 확정 후 적용합니다.</p>` }));
}

function renderLandingMenu(pid, isApp){
  const p = partnerDB[pid] || { name:'Unknown Partner', desc:'', heroImg:'', wifi:null, menu:[] };
  const wifi = p.wifi ? `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <div class="small muted">Wi-Fi</div>
        <div style="font-weight:900">${p.wifi.ssid}</div>
        <div class="small muted">PW: ${p.wifi.pass}</div>
      </div>
      <button class="btn ghost small" id="copyWifi">복사</button>
    </div>
  ` : '';

  const upsell = isApp ? '' : `
    <div class="card" style="margin-top:12px">
      <div style="font-weight:900">imake 앱으로 더 편하게</div>
      <div class="small muted" style="margin-top:6px">1 day free + 멤버십 5% 할인 혜택</div>
      <div class="modal-actions" style="margin-top:10px">
        <button class="btn primary" id="btnInstall">앱 설치</button>
      </div>
    </div>
  `;

  appRoot.innerHTML = `
    ${isApp ? headerHTML() : ''}
    <div class="content ${isApp?'no-nav':'landing'}" id="content">
      ${isApp ? '' : `<div class="logo" style="font-size:22px">imake</div>`}
      <h2 style="margin-top:${isApp?0:12}px">${p.name}</h2>
      <p class="muted" style="margin-top:6px">${p.desc||''}</p>

      ${wifi}

      <div class="hr"></div>
      <div class="section-title">MENU</div>
      <div class="list" id="menuList">
        ${(p.menu||[]).map(m=>`
          <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div>
              <div style="font-weight:900">${m.name}</div>
              <div class="small muted">정가 ₩ ${fmtKRW(m.price)} → 할인 ₩ ${fmtKRW(Math.floor(m.price*0.95))}</div>
            </div>
            <button class="btn primary small addCart" data-id="${m.id}">+ 담기</button>
          </div>
        `).join('')}
      </div>

      <div class="card" style="margin-top:12px">
        <div style="font-weight:900">주문하기(프로토타입)</div>
        <div class="small muted" style="margin-top:6px">테이블 번호표 입력 → 주문 → 매장 확인</div>
        <div class="modal-actions" style="margin-top:10px">
          <button class="btn primary" id="goOrder">주문 프로세스</button>
        </div>
      </div>

      ${upsell}

      <div style="margin-top:14px">
        <button class="btn ghost" id="btnBack" style="width:100%">홈으로</button>
      </div>
    </div>

    ${bottomNavHTML('home')}
  `;

  setIcon();
  if (isApp) { bindHeader(); }
  bindBottomNav('home');

  $('#btnBack').onclick = ()=> { history.pushState({}, '', '/'); render(); };

  $('#copyWifi')?.addEventListener('click', async ()=>{
    const txt = `${p.wifi.ssid} / ${p.wifi.pass}`;
    try { await navigator.clipboard.writeText(txt); } catch {}
    openModal({ title:'Wi‑Fi', bodyHTML:`<p class="muted">복사되었습니다(가능한 경우).</p><p class="small">${txt}</p>` });
  });

  $('#btnInstall')?.addEventListener('click', ()=> openModal({ title:'Install', bodyHTML:`<p class="muted">스토어 링크는 TBD.</p>` }));

  // cart stub
  const cart = new Map();
  $$('.addCart').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-id'));
      cart.set(id, (cart.get(id)||0)+1);
      btn.textContent = `+ 담기 (${cart.get(id)})`;
    };
  });

  $('#goOrder').onclick = ()=> openOrderFlow(pid, isApp);
}

/* ---------- Order flow (minimal) ---------- */
function openOrderFlow(pid, isApp){
  const p = partnerDB[pid];
  if(!p) return;

  let table = '';
  let cart = new Map();

  const total = ()=>{
    let t=0;
    cart.forEach((qty, id)=>{
      const m = p.menu.find(x=>x.id===id);
      if(m) t += Math.floor(m.price*0.95)*qty;
    });
    return t;
  };

  openModal({
    title:'Order',
    bodyHTML: `
      <p class="muted">테이블 번호표(2자리) 입력 후 메뉴를 담아 주문하세요.</p>
      <div class="row" style="margin-top:10px">
        <input class="input" id="tbl" placeholder="Table No (ex. 12)" maxlength="2" />
        <button class="btn ghost" id="tblOk">확인</button>
      </div>
      <div class="hr"></div>
      <div class="section-title">MENU</div>
      <div class="list" id="orderList">
        ${(p.menu||[]).map(m=>`
          <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div>
              <div style="font-weight:900">${m.name}</div>
              <div class="small muted">₩ ${fmtKRW(Math.floor(m.price*0.95))} (5% off)</div>
            </div>
            <div class="row">
              <button class="btn ghost small dec" data-id="${m.id}">-</button>
              <div class="badge" id="q-${m.id}">0</div>
              <button class="btn ghost small inc" data-id="${m.id}">+</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="hr"></div>
      <div class="row" style="justify-content:space-between">
        <div style="font-weight:900">Total</div>
        <div style="font-weight:900;color:var(--danger)">₩ <span id="tt">${fmtKRW(0)}</span></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="btnBill">계산서(미리보기)</button>
        <button class="btn primary" id="btnSubmit" disabled>주문 제출</button>
      </div>
    `
  });

  const update = ()=>{
    $$('#orderList .card').forEach(()=>{});
    $('#tt').textContent = fmtKRW(total());
    const has = total() > 0;
    $('#btnSubmit').disabled = !(has && table.length>0);
  };

  $('#tblOk').onclick = ()=>{
    const v = $('#tbl').value.replace(/\D/g,'').slice(0,2);
    table = v;
    $('#tbl').value = v;
    update();
    if (table) openModal({ title:'테이블 확인', bodyHTML:`<div style="text-align:center"><div style="font-size:44px;font-weight:900;color:var(--primary);margin:10px 0">${table}</div><p class="muted">테이블 번호가 맞으면 계속 진행하세요.</p></div>` });
  };

  $$('.inc').forEach(b=>{
    b.onclick = ()=>{
      const id = Number(b.getAttribute('data-id'));
      cart.set(id, (cart.get(id)||0)+1);
      $('#q-'+id).textContent = String(cart.get(id));
      update();
    };
  });
  $$('.dec').forEach(b=>{
    b.onclick = ()=>{
      const id = Number(b.getAttribute('data-id'));
      cart.set(id, Math.max(0,(cart.get(id)||0)-1));
      $('#q-'+id).textContent = String(cart.get(id));
      update();
    };
  });

  $('#btnBill').onclick = ()=>{
    let lines = '';
    cart.forEach((qty,id)=>{
      if(qty<=0) return;
      const m = p.menu.find(x=>x.id===id);
      const sum = Math.floor(m.price*0.95)*qty;
      lines += `<div class="list-item"><span>${m.name} × ${qty}</span><strong>₩ ${fmtKRW(sum)}</strong></div>`;
    });
    openModal({
      title:'Total Bill',
      bodyHTML: `
        <div class="list">${lines || '<p class="muted">담긴 메뉴가 없습니다.</p>'}</div>
        <div class="hr"></div>
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:900">Total</div>
          <div style="font-weight:900;color:var(--danger)">₩ ${fmtKRW(total())}</div>
        </div>
      `
    });
  };

  $('#btnSubmit').onclick = ()=>{
    // 프로토타입: 주문 확인 즉시 히스토리 기록 + saved 반영
    const t = total();
    const saved = Math.floor(t / 19); // 근사(5% 할인: 정가 대비 절감액) -> 정가 계산은 별도
    state.savedTotal += Math.floor(t * (5/95)); // 할인액 근사: 할인후 금액 기준 역산
    state.history.unshift({ at: nowISO(), title:`Dining Order (Table ${table})`, meta:`₩ ${fmtKRW(t)} / saved ≈ ₩ ${fmtKRW(Math.floor(t*(5/95)))}` });
    saveState();
    closeModal();
    openModal({ title:'주문 완료', bodyHTML:`<p class="muted">프로토타입: 매장 확인 단계는 생략되었습니다.</p>` });
    render();
  };

  update();
}

/* ---------- Membership pay (web) ---------- */
function openPayPage(){
  openModal({
    title:'멤버십 결제(웹)',
    bodyHTML: `
      <p class="muted">요구사항: 결제는 웹페이지에서 진행합니다. (프로토타입: 토글)</p>
      <div class="card">
        <div style="font-weight:900">PASS</div>
        <div class="small muted">제휴업체 무제한 5% 할인 + 바우처</div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" id="payDone">결제 완료(테스트)</button>
        <button class="btn ghost" id="payCancel">취소</button>
      </div>
    `
  });
  $('#payDone').onclick = ()=>{
    state.isPaid = true;
    saveState();
    closeModal();
    render();
  };
  $('#payCancel').onclick = closeModal;
}

/* ---------- Helpers ---------- */
function escapeHTML(s){
  return String(s||'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  normalizeTodoToSchedule();
  render();
  setIcon();
});

function openToast(msg){
  // 프로토타입: 간단 처리
  alert(msg);
}


function openConfirmModal({title='Confirm', message='', okText='OK', cancelText='Cancel', onOk=()=>{}, onCancel=()=>{}}){
  openModal({
    title,
    bodyHTML: `
      <p class="muted" style="line-height:1.5">${message}</p>
      <div class="modal-actions" style="margin-top:14px">
        <button class="btn ghost" id="cCancel">${cancelText}</button>
        <button class="btn danger" id="cOk">${okText}</button>
      </div>
    `
  });
  $('#cCancel').onclick = ()=>{ closeModal(); onCancel(); };
  $('#cOk').onclick = ()=>{ closeModal(); onOk(); };
}
render();
