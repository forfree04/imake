/* ==========================================================
   [1] 전역 데이터 및 초기화
   ========================================================== */
if (typeof lucide !== 'undefined') lucide.createIcons();

// [수정] 다른 파일(map.js, orders.js)에서 접근할 수 있도록 var 사용 (window 객체에 바인딩)
var todoList = [];
var favList = [];
var schedList = [];
var historyList = []; 
var recData = []; 

var currentEditType = null;
var currentEditId = null;

var map = null;       
var markers = [];     
var userMarker = null; 

var userMembershipType = 'free'; 
var isTrialActive = false; 
var userPreferences = {}; 

var currentTable = "";
var cart = {};
var confirmedOrders = [];
var isDutchMode = false; 
var menuData = []; 

// [보안] XSS 방지용 이스케이프 함수 (전역 등록)
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHTML = escapeHTML;

// 페이지 로드 시 실행
window.onload = function() {
    console.log("🚀 앱 시작! (통합 로딩)");
    
    // 1. 페이지 초기화 (홈 화면으로)
    if(typeof navigateTo === 'function') navigateTo('home');

    // 2. DB 리스너 연결 (Firebase 로드 대기 - 안전장치)
    const checkDbInterval = setInterval(() => {
        if (window.db && window.auth) {
            clearInterval(checkDbInterval);
            initRealtimeListeners();
            initAuthListener(); // [보완] 로그인 감시도 안전하게 실행
        }
    }, 100);

    // 3. 지도 초기화
    setTimeout(() => {
        initMap(); 
    }, 100);
};

/* ==========================================================
   [2] Firestore 실시간 동기화 (spots 이름표 확인됨)
   ========================================================== */
function initRealtimeListeners() {
  if (!window.db) {
    console.error("❌ DB 연결 실패: window.db가 없습니다.");
    return;
  }

  // 1. To-Do List
  window.onSnapshot(window.collection(window.db, "todos"), (snapshot) => {
    todoList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // [이동 규칙] 오늘 날짜인 할 일은 스케줄로 이동
    normalizeTodoToSchedule();

    renderTodoList();
    updateCounts();
  });

  // 2. Schedule List
  window.onSnapshot(window.collection(window.db, "schedules"), (snapshot) => {
    schedList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderSchedList();
    updateCounts();
  });

    // 3. Favorites List
    window.onSnapshot(window.collection(window.db, "favorites"), (snapshot) => {
        favList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFavList();
        updateCounts();
    });

    // 4. 추천 맛집 (컬렉션 이름 recommendations로 통일)
  window.onSnapshot(
    window.collection(window.db, "recommendations"),
    (snapshot) => {
      recData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      console.log(`✅ 맛집 데이터 수신: ${recData.length}개`);

      renderRecList("all");
      updateMapMarkers("all");
    }
  );
    // 5. [신규] History List
    window.onSnapshot(window.collection(window.db, "history"), (snapshot) => {
        historyList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // 최신순 정렬
        historyList.sort((a, b) => b.created - a.created);
        renderHistoryList();
    });

    // 6. [신규] Menu List (관리자/사용자 공용)
    window.onSnapshot(window.collection(window.db, "menus"), (snapshot) => {
        menuData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // ID(숫자) 기준 정렬
        menuData.sort((a, b) => Number(a.id) - Number(b.id));
        console.log(`✅ 메뉴 데이터 수신: ${menuData.length}개`);
        
        // 메뉴판이 열려있다면 갱신
        if (document.getElementById('page-order-menu').style.display === 'block') renderOrderMenu();
    });
}

// [추가된 함수] To-Do -> Schedule 자동 이동
async function normalizeTodoToSchedule() {
    // [수정] 로컬 시간대 기준 오늘 날짜 (YYYY-MM-DD) - Timezone 이슈 해결
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const toMove = todoList.filter(t => t.date === today);

    for (const task of toMove) {
        await window.addDoc(window.collection(window.db, "schedules"), {
            title: task.title, date: task.date, time: task.time || "",
            checked: task.checked, created: task.created || Date.now()
        });
        await window.deleteDoc(window.doc(window.db, "todos", task.id));
    }
}

function updateCounts() {
    const t = document.getElementById('count-todo');
    const f = document.getElementById('count-fav');
    const s = document.getElementById('count-sched');
    if(t) t.innerText = todoList.filter(i => !i.checked).length;
    if(f) f.innerText = favList.length;
    if(s) s.innerText = schedList.filter(i => !i.checked).length;
}

/* ==========================================================
   [3] 데이터 추가/수정/삭제 로직 (이동 규칙 반영)
   ========================================================== */
async function addNewTodo() {
    const input = document.getElementById('new-todo-title');
    const title = input.value.trim();
    if (!title) return alert("내용을 입력하세요.");
    try {
        await window.addDoc(window.collection(window.db, "todos"), {
            title, date: "", time: "", checked: false, created: Date.now()
        });
        input.value = "";
    } catch (e) { console.error(e); }
}

// [수정된 함수] 스케줄 추가 로직 (오늘 아니면 To-Do로)
async function addNewSched() {
    const titleInput = document.getElementById('new-sched-title');
    const dateInput = document.getElementById('new-sched-date');
    const timeInput = document.getElementById('new-sched-time');

    const title = titleInput.value.trim();
    const dateVal = dateInput.value;
    const timeVal = timeInput.value;

    if (!title) return alert("일정 제목을 입력하세요.");

    // [수정] 로컬 시간대 기준 오늘 날짜
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const targetDate = dateVal || today;

    try {
        if (targetDate !== today) {
            if(confirm(`오늘 날짜가 아닙니다. '할 일(To-Do)' 목록에 보관할까요?`)) {
                await window.addDoc(window.collection(window.db, "todos"), {
                    title, date: targetDate, time: timeVal || "", checked: false, created: Date.now()
                });
                alert("To-Do 리스트에 보관되었습니다.");
            }
        } else {
            await window.addDoc(window.collection(window.db, "schedules"), {
                title, date: targetDate, time: timeVal || "", checked: false, created: Date.now()
            });
        }
        titleInput.value = ""; dateInput.value = ""; timeInput.value = "";
    } catch (e) { console.error(e); }
}

async function deleteItem(collectionName, id) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try { await window.deleteDoc(window.doc(window.db, collectionName, id)); } 
    catch (e) { console.error(e); }
}

async function toggleItem(collectionName, id, currentStatus) {
    try { await window.updateDoc(window.doc(window.db, collectionName, id), { checked: !currentStatus }); } 
    catch (e) { console.error(e); }
}

async function toggleSched(id, currentStatus) {
    if (currentStatus) {
        if (confirm("To Do List로 되돌릴까요?")) {
            const item = schedList.find(i => i.id === id);
            if(item) {
                await window.addDoc(window.collection(window.db, "todos"), {
                    title: item.title, date: "", time: "", checked: false, created: Date.now()
                });
                await window.deleteDoc(window.doc(window.db, "schedules", id));
            }
        } else { toggleItem("schedules", id, true); }
    } else { toggleItem("schedules", id, false); }
}

/* ==========================================================
   [추가된 영역] 편집 팝업 제어
   ========================================================== */
function openEditPopup(type, id) {
    currentEditType = type;
    currentEditId = id;
    let item = [...todoList, ...schedList, ...favList].find(i => i.id === id);
    if (!item) return;

    document.getElementById('edit-title').value = item.title || "";
    document.getElementById('edit-date').value = item.date || "";
    document.getElementById('edit-time').value = item.time || "";

    document.getElementById('modal-edit-popup').style.display = 'flex';
    document.getElementById('edit-popup-title').innerText = `Edit ${type.toUpperCase()}`;
}

async function saveEditPopup() {
    if (!currentEditType || !currentEditId) return;
    const title = document.getElementById('edit-title').value;
    const date = document.getElementById('edit-date').value;
    const time = document.getElementById('edit-time').value;
    let col = currentEditType === 'todo' ? "todos" : (currentEditType === 'sched' ? "schedules" : "favorites");

    try {
        await window.updateDoc(window.doc(window.db, col, currentEditId), { title, date, time });
        closeEditPopup();
    } catch(e) { console.error(e); }
}

function closeEditPopup() { document.getElementById('modal-edit-popup').style.display = 'none'; }

/* ==========================================================
   [4] UI 렌더링 (수정 버튼 포함)
   ========================================================== */
function renderTodoList() {
    const list = document.getElementById('list-todo');
    if (!list) return;
    const sorted = [...todoList].sort((a,b) => (a.checked - b.checked) || b.created - a.created);
    list.innerHTML = sorted.map(item => `
        <div class="list-item ${item.checked ? 'checked' : ''}">
            <div class="list-check" onclick="toggleItem('todos', '${item.id}', ${item.checked})"><i data-lucide="check"></i></div>
            <div class="list-content" onclick="openEditPopup('todo', '${item.id}')">
                <div class="item-title">${escapeHTML(item.title)}</div>
                <div class="item-sub">${escapeHTML(item.date || '')} ${escapeHTML(item.time || '')}</div>
            </div>
            <div class="list-actions" style="display:flex; gap:5px;">
                <button onclick="openEditPopup('todo', '${item.id}')" style="background:none; border:none; cursor:pointer;"><i data-lucide="edit-3" style="width:18px; color:#666;"></i></button>
                <button onclick="deleteItem('todos', '${item.id}')" style="background:none; border:none; cursor:pointer;"><i data-lucide="trash-2" style="width:18px; color:#ff4d4f;"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderSchedList() {
    const list = document.getElementById('list-sched');
    if (!list) return;
    const now = new Date().toTimeString().substring(0,5);
    const sorted = [...schedList].sort((a,b) => (a.checked - b.checked) || (a.time||'').localeCompare(b.time||''));
    list.innerHTML = sorted.map(item => `
        <div class="list-item ${item.checked ? 'checked' : ''} ${!item.checked && item.time < now ? 'past' : ''}">
            <div class="list-check" onclick="toggleSched('${item.id}', ${item.checked})"><i data-lucide="check"></i></div>
            <div class="list-content" onclick="openEditPopup('sched', '${item.id}')">
                <div class="item-title">${escapeHTML(item.title)}</div>
                <div class="item-sub">⏰ ${escapeHTML(item.time || '-')}</div>
            </div>
            <div class="list-actions" style="display:flex; gap:5px;">
                <button onclick="openEditPopup('sched', '${item.id}')" style="background:none; border:none; cursor:pointer;"><i data-lucide="edit-3" style="width:18px; color:#666;"></i></button>
                <button onclick="deleteItem('schedules', '${item.id}')" style="background:none; border:none; cursor:pointer;"><i data-lucide="trash-2" style="width:18px; color:#ff4d4f;"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderFavList() {
    const list = document.getElementById('list-fav');
    if (!list) return;
    if (favList.length === 0) list.innerHTML = "<div style='text-align:center;color:#888;'>비어있음</div>";
    else {
        list.innerHTML = favList.map(item => `
            <div class="list-item">
                <div class="list-check" style="cursor:default;"><i data-lucide="heart" style="color:#ff4d4f; fill:#ff4d4f;"></i></div>
                <div class="list-content">
                    <div class="item-title">${escapeHTML(item.title)}</div>
                    <div class="item-sub">${escapeHTML(item.desc || '')}</div>
                </div>
                <div class="list-actions" style="display:flex; gap:5px;">
                    <button onclick="openEditPopup('fav', '${item.id}')" style="background:none; border:none; cursor:pointer;"><i data-lucide="edit-3" style="width:18px; color:#666;"></i></button>
                    <button onclick="deleteItem('favorites', '${item.id}')" style="background:none; border:none; cursor:pointer;"><i data-lucide="trash-2" style="width:18px; color:#ff4d4f;"></i></button>
                </div>
            </div>
        `).join('');
    }
    lucide.createIcons();
}

// [신규] 히스토리 리스트 그리기
function renderHistoryList() {
    const list = document.getElementById('list-history');
    if (!list) return;
    if (historyList.length === 0) list.innerHTML = "<div style='text-align:center;color:#888;'>기록이 없습니다.</div>";
    else {
        list.innerHTML = historyList.map(item => `
            <div class="list-item" style="display:block; background:rgba(255,255,255,0.1); border:1px solid #333;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-weight:bold; color:white;">${escapeHTML(item.storeName)}</span>
                    <span style="font-size:12px; color:#888;">${escapeHTML(item.date.split(',')[0])}</span>
                </div>
                <div style="font-size:13px; color:#ccc; margin-bottom:8px;">${escapeHTML(item.items)}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:#ef4444;">₩ ${item.paidAmount.toLocaleString()}</span>
                    ${item.savedAmount > 0 ? `<span style="font-size:11px; background:#10b981; color:white; padding:2px 6px; border-radius:4px;">Save ₩${item.savedAmount.toLocaleString()}</span>` : ''}
                </div>
            </div>
        `).join('');
    }
}

/* ==========================================================
   [6] UI 제어 (팝업, 메뉴, 헬프탭)
   ========================================================== */
function toggleHelp() {
    document.querySelector('.help-container')?.classList.toggle('open');
}

function navigateTo(pageId) {
    closeSideMenu();
    document.querySelectorAll('.page').forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
    });
    const target = document.getElementById('page-' + pageId);
    if (target) {
        target.style.display = 'block';
        target.classList.add('active');
        updateBottomNav(pageId);
        if (pageId === 'home' && map) setTimeout(() => map.invalidateSize(), 100);
    }
    // 주문 페이지가 아니면 플로팅 버튼 보이기 (테이블 번호가 있을 때만)
    if (!pageId.startsWith('order-') && currentTable) {
        document.getElementById('floatBtn').style.display = 'flex';
    } else {
        document.getElementById('floatBtn').style.display = 'none';
    }
}

function updateBottomNav(activePage) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[onclick*="'${activePage}'"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

function openSideMenu() {
    document.getElementById('side-menu')?.classList.add('open');
    document.getElementById('side-menu-overlay')?.classList.add('open');
}

function closeSideMenu() {
    document.getElementById('side-menu')?.classList.remove('open');
    document.getElementById('side-menu-overlay')?.classList.remove('open');
}

window.onclick = function(event) {
    const modals = ['qr-modal', 'lang-modal', 'modal-todo', 'modal-fav', 'modal-sched', 'modal-edit-popup', 'modal-detail', 'modal-bill', 'modal-reset-pw', 'modal-onboarding-reminder', 'modal-category-menu'];
    modals.forEach(id => {
        const m = document.getElementById(id);
        if (m && event.target === m) m.style.display = "none";
    });
    const overlay = document.getElementById('side-menu-overlay');
    if (overlay && event.target === overlay) closeSideMenu();
}

function openTodoModal() { renderTodoList(); openModal('modal-todo'); }
function openFavModal() { renderFavList(); openModal('modal-fav'); }
function openScheduleModal() { renderSchedList(); openModal('modal-sched'); }
function openModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }

function openQRModal() { 
    document.getElementById('qr-modal').style.display = 'flex'; 
    updateQRModalUI(); // 모달 열 때 UI 상태 갱신
    generateQRCode(); // [신규] QR 코드 생성 및 DB 저장
}

function openLangModal() { document.getElementById('lang-modal').style.display = 'flex'; }

function copyLocation() {
    const loc = document.getElementById('current-addr')?.innerText || "Unknown Location";
    navigator.clipboard.writeText(loc).then(() => alert("위치가 복사되었습니다."));
}

function shareLocation() {
    alert("위치 공유 기능 실행");
}
