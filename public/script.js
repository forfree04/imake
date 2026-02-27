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

// 맛집 리스트 그리기 (지도/카테고리용)
function renderRecList(category, subCat = null) {
    const list = document.getElementById('rec-list-container');
    if (!list) return;
    let filtered = (category === 'all' || !category)
        ? recData
        : recData.filter(item => (item.cat || '').toLowerCase() === category.toLowerCase());
    if (subCat) {
        filtered = filtered.filter(item =>
            (item.tags || []).some(t => t.toLowerCase().includes(subCat.toLowerCase())) ||
            (item.subCategory && item.subCategory.toLowerCase().includes(subCat.toLowerCase()))
        );
    }
    list.innerHTML = filtered.map(item => `
        <div class="list-item" onclick="openDetailModal('${item.id}')">
            <div class="img-box" style="width: 80px; height: 80px; border-radius: 12px; overflow: hidden; margin-right: 15px; flex-shrink: 0;">
                <img src="${item.img || 'https://via.placeholder.com/80'}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div class="list-content">
                <div class="item-title" style="font-weight: bold; font-size: 16px; margin-bottom: 4px;">
                    ${item.title} <span style="color: ${item.status === 'red' ? '#ff4d4f' : item.status === 'yellow' ? '#faad14' : '#52c41a'};">●</span>
                </div>
                <div class="item-desc" style="font-size: 13px; color: #666; margin-bottom: 4px;">${item.desc || ''}</div>
                <div class="item-tags">
                    ${(item.tags || []).map(t => `<span class="tag" style="background:#f0f0f0; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:4px;">#${t}</span>`).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

// 상세 모달 및 즐겨찾기
function openDetailModal(id) {
    const item = recData.find(i => i.id === id);
    if (!item) return;
    const isFav = favList.some(f => f.title === item.title);
    const favIconClass = isFav ? "fill: #ef4444; color: #ef4444;" : "color: #666;";
    const favText = isFav ? "즐겨찾기 해제" : "즐겨찾기 추가";
    const addrHtml = item.addr ? `<div style="margin-bottom:12px; color:#3b82f6; font-weight:bold; font-size:14px; display:flex; align-items:center; gap:4px;"><i data-lucide="map-pin" style="width:16px;"></i> ${item.addr}</div>` : '';
    const subCatHtml = item.subCategory ? `<div style="margin-bottom:10px;"><span style="background:#eff6ff; color:#3b82f6; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:bold;">#${item.subCategory}</span></div>` : '';
    const html = `
        <div style="position:relative;">
            <img src="${item.img || 'https://via.placeholder.com/400x250'}" style="width:100%; height:220px; object-fit:cover;">
            <div style="position:absolute; bottom:0; left:0; width:100%; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px; color:white;">
                <h2 style="margin:0; font-size:22px;">${item.title}</h2>
                <div style="font-size:13px; opacity:0.9; margin-top:4px;">${item.cat || 'Place'}</div>
            </div>
        </div>
        <div style="padding:20px;">
            ${subCatHtml}
            ${addrHtml}
            <p style="color:#444; line-height:1.6; margin-top:0;">${item.desc || '상세 설명이 없습니다.'}</p>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button onclick="toggleRecFavorite('${item.id}')" style="flex:1; padding:12px; border:1px solid #ddd; background:white; border-radius:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
                    <i data-lucide="heart" style="width:18px; ${favIconClass}"></i> <span id="fav-btn-text">${favText}</span>
                </button>
                <button onclick="moveToMap('${item.title}', ${item.lat}, ${item.lng}); closeModal('modal-detail');" style="flex:1; padding:12px; background:#3b82f6; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">📍 지도 보기</button>
            </div>
        </div>
    `;
    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('modal-detail').style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function toggleRecFavorite(recId) {
    const item = recData.find(i => i.id === recId);
    if (!item) return;
    const existingFav = favList.find(f => f.title === item.title);
    if (existingFav) await deleteItem('favorites', existingFav.id);
    else await window.addDoc(window.collection(window.db, "favorites"), { title: item.title, desc: item.desc || '', cat: item.cat || '', created: Date.now() });
    openDetailModal(recId);
}

// 지도 초기화 및 마커
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || map !== null) return;
    map = L.map('map').setView([37.5665, 126.9780], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    updateMapMarkers('all');
    findMyLocation();
}

function updateMapMarkers(category, subCat = null) {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    let filtered = (category === 'all' || !category) ? recData : recData.filter(item => (item.cat || '').toLowerCase() === category.toLowerCase());
    if (subCat) {
        filtered = filtered.filter(item =>
            (item.tags || []).some(t => t.toLowerCase().includes(subCat.toLowerCase())) ||
            (item.subCategory && item.subCategory.toLowerCase().includes(subCat.toLowerCase()))
        );
    }
    filtered.forEach(item => {
        if (item.lat && item.lng) {
            const marker = L.marker([item.lat, item.lng]).addTo(map);
            const addrInfo = item.addr ? `<br><span style="color:#3b82f6; font-size:11px;">${item.addr}</span>` : '';
            marker.bindPopup(`<b>${item.title}</b>${addrInfo}<br>${item.desc || ''}`);
            markers.push(marker);
        }
    });
    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

function moveToMap(title, lat, lng) {
    if (!map) return;
    navigateTo('home');
    setTimeout(() => {
        map.invalidateSize();
        map.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
        markers.forEach(m => { const p = m.getLatLng(); if (Math.abs(p.lat - lat) < 0.0001) m.openPopup(); });
    }, 300);
}

// 카테고리 / 2차 카테고리 모달
function filterCategory(category) {
    if (category === 'all') { applyCategoryFilter('all'); return; }
    openCategoryModal(category);
}

function applyCategoryFilter(category, subCat = null) {
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.cat-btn[onclick*="'${category}'"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderRecList(category, subCat);
    updateMapMarkers(category, subCat);
}

const categoryMenuData = {
    'food': {
        'rice': { label: 'Rice (밥)', items: [{ name: 'Bibimbap (비빔밥)', desc: 'Mixed rice with vegetables', tag: 'Bibimbap' }, { name: 'Gukbap (국밥)', desc: 'Hot soup with rice', tag: 'Gukbap' }, { name: 'Fried Rice (볶음밥)', desc: 'Stir-fried rice', tag: 'Fried Rice' }] },
        'noodle': { label: 'Noodles (면)', items: [{ name: 'Naengmyeon (냉면)', desc: 'Cold buckwheat noodles', tag: 'Naengmyeon' }, { name: 'Jajangmyeon (짜장면)', desc: 'Noodles in black bean sauce', tag: 'Jajangmyeon' }, { name: 'Kalguksu (칼국수)', desc: 'Hand-cut noodle soup', tag: 'Kalguksu' }, { name: 'Ramyeon (라면)', desc: 'Spicy instant noodles', tag: 'Ramyeon' }] },
        'soup': { label: 'Soup (국/탕)', items: [{ name: 'Kimchi Stew (김치찌개)', desc: 'Spicy stew with kimchi', tag: 'Kimchi Stew' }, { name: 'Samgyetang (삼계탕)', desc: 'Ginseng chicken soup', tag: 'Samgyetang' }, { name: 'Sundae-guk (순대국)', desc: 'Blood sausage soup', tag: 'Sundae-guk' }, { name: 'Gamjatang (감자탕)', desc: 'Pork bone soup', tag: 'Gamjatang' }] },
        'bbq': { label: 'BBQ (구이)', items: [{ name: 'Samgyeopsal (삼겹살)', desc: 'Grilled pork belly', tag: 'Samgyeopsal' }, { name: 'Galbi (갈비)', desc: 'Grilled ribs', tag: 'Galbi' }, { name: 'Bulgogi (불고기)', desc: 'Marinated beef', tag: 'Bulgogi' }] },
        'street': { label: 'Street (분식)', items: [{ name: 'Tteokbokki (떡볶이)', desc: 'Spicy rice cakes', tag: 'Tteokbokki' }, { name: 'Sundae (순대)', desc: 'Korean blood sausage', tag: 'Sundae' }, { name: 'Gimbap (김밥)', desc: 'Seaweed rice rolls', tag: 'Gimbap' }] }
    },
    'cafe': { 'coffee': { label: 'Coffee', items: [{ name: 'Coffee', desc: '아메리카노, 라떼 등', tag: 'coffee' }] }, 'tea': { label: 'Traditional Tea', items: [{ name: 'Traditional Tea', desc: '쌍화차, 오미자차 등', tag: 'traditional tea' }] }, 'dessert': { label: 'Dessert', items: [{ name: 'Dessert', desc: '마카롱, 케이크, 빙수 등', tag: '디저트' }] }, 'bakery': { label: 'Bakery', items: [{ name: 'Bakery', desc: '갓 구운 빵과 샌드위치', tag: '베이커리' }] } },
    'activity': { 'indoor': { label: 'Indoor', items: [{ name: 'Indoor Activity', desc: '실내 스포츠, 공방, 전시 등', tag: 'indoor' }] }, 'outdoor': { label: 'Outdoor', items: [{ name: 'Outdoor Activity', desc: '놀이공원, 수상레저, 등산 등', tag: 'outdoor' }] } },
    'stay': { 'hotel': { label: 'Hotel', items: [{ name: 'Hotel', desc: '편안하고 고급스러운 휴식', tag: 'hotel' }] }, 'hanok': { label: 'Hanok', items: [{ name: 'Hanok Stay', desc: '한국 전통 가옥 체험', tag: '한옥' }] }, 'motel': { label: 'Motel', items: [{ name: 'Motel', desc: '합리적인 가격의 숙박', tag: '모텔' }] }, 'guesthouse': { label: 'Guesthouse', items: [{ name: 'Guesthouse', desc: '여행자들과의 만남', tag: '게스트하우스' }] }, 'pension': { label: 'Pension', items: [{ name: 'Pension', desc: '바베큐와 자연 속 휴식', tag: '펜션' }] } },
    'healing': { 'massage': { label: 'Massage', items: [{ name: 'Massage', desc: '전신, 발 마사지 등', tag: '마사지' }] }, 'templestay': { label: 'Templestay', items: [{ name: 'Templestay', desc: '사찰에서의 힐링 체험', tag: '템플스테이' }] } },
    'beauty': { 'hair': { label: 'Hair', items: [{ name: 'Hair Salon', desc: '컷, 펌, 염색 등', tag: '헤어' }] }, 'makeup': { label: 'Makeup', items: [{ name: 'Makeup', desc: '전문가의 메이크업', tag: '메이크업' }] }, 'fashion': { label: 'Fashion Style', items: [{ name: 'Fashion Styling', desc: '퍼스널 쇼퍼, 스타일링', tag: '패션스타일' }] }, 'personal': { label: 'Personal Color', items: [{ name: 'Personal Color', desc: '나에게 맞는 컬러 진단', tag: '퍼스널컬러' }] } },
    'shopping': { 'taxfree': { label: 'Tax Free', items: [{ name: 'Tax Free Shop', desc: '외국인 면세 쇼핑', tag: 'tax free' }] }, 'mart': { label: 'Mart', items: [{ name: 'Hyper Market', desc: '대형 마트 및 식료품', tag: 'mart' }] }, 'glasses': { label: 'Glasses', items: [{ name: 'Optical Shop', desc: '빠른 맞춤 안경 및 렌즈', tag: '안경' }] }, 'cloth': { label: 'Cloth', items: [{ name: 'Clothing Store', desc: '트렌디한 K-패션', tag: 'cloth' }] }, 'shoes': { label: 'Shoes', items: [{ name: 'Shoe Store', desc: '스니커즈, 구두 등', tag: 'shoes' }] } }
};

function openCategoryModal(category) {
    const catData = categoryMenuData[category];
    if (!catData) { applyCategoryFilter(category); return; }
    const modal = document.getElementById('modal-category-menu');
    const titleEl = document.getElementById('category-modal-title');
    const tabsContainer = document.getElementById('category-tabs');
    if (!modal || !titleEl || !tabsContainer) return;
    const categoryIcons = { 'food': 'utensils', 'cafe': 'coffee', 'activity': 'ticket', 'stay': 'bed', 'healing': 'leaf', 'beauty': 'scissors', 'shopping': 'shopping-bag' };
    titleEl.innerHTML = `<i data-lucide="${categoryIcons[category] || 'layers'}" style="width:20px; vertical-align:middle; margin-right:6px; color:var(--primary);"></i><span style="vertical-align:middle;">${category.charAt(0).toUpperCase() + category.slice(1)}</span>`;
    tabsContainer.innerHTML = Object.keys(catData).map(key => `<button onclick="switchCategoryTab('${category}', '${key}')" class="category-tab-btn" id="tab-${key}" style="padding: 15px 10px; background: none; border: none; border-bottom: 3px solid transparent; font-weight: bold; color: #888; cursor: pointer; margin-right: 10px;">${catData[key].label}</button>`).join('');
    modal.style.display = 'flex';
    const firstKey = Object.keys(catData)[0];
    if (firstKey) switchCategoryTab(category, firstKey);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function switchCategoryTab(category, key) {
    document.querySelectorAll('.category-tab-btn').forEach(btn => { btn.style.borderBottomColor = 'transparent'; btn.style.color = '#888'; });
    const activeBtn = document.getElementById(`tab-${key}`);
    if (activeBtn) { activeBtn.style.borderBottomColor = '#3b82f6'; activeBtn.style.color = '#3b82f6'; }
    const contentContainer = document.getElementById('category-content');
    const data = categoryMenuData[category] && categoryMenuData[category][key];
    const items = (data && data.items) || [];
    contentContainer.innerHTML = items.map(item => `
        <div onclick="selectCategoryItem('${category}', '${String(item.tag).replace(/'/g, "\\'")}')" style="background: white; padding: 15px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: pointer;">
            <div style="width: 60px; height: 60px; background: #eee; border-radius: 8px; flex-shrink: 0; display:flex; align-items:center; justify-content:center; color:#ccc;"><i data-lucide="check-circle"></i></div>
            <div><div style="font-weight: bold; font-size: 16px;">${item.name}</div><div style="font-size: 13px; color: #666; margin-top: 4px;">${item.desc}</div></div>
        </div>
    `).join('') + (data ? `<button onclick="selectCategoryItem('${category}', '${key}')" style="width: 100%; padding: 15px; background: #e0f2fe; color: #0284c7; border: none; border-radius: 12px; font-weight: bold; margin-top: 10px; cursor: pointer;">View All ${data.label}</button>` : '');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectCategoryItem(category, tag) {
    closeModal('modal-category-menu');
    applyCategoryFilter(category, tag);
}

function findMyLocation() {
    if (!navigator.geolocation) return alert("GPS 지원 불가");
    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        if (map) {
            map.flyTo([latitude, longitude], 15);
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.circleMarker([latitude, longitude], { radius: 8, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
            getAddressFromCoords(latitude, longitude);
        }
    }, () => alert("위치 권한 필요"), { enableHighAccuracy: true });
}

async function getAddressFromCoords(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.display_name) {
            const addrElement = document.getElementById('current-addr');
            if (addrElement) addrElement.innerText = data.display_name;
        }
    } catch (e) { console.error("주소 변환 실패:", e); }
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

/* ==========================================================
   [신규] 결제 및 멤버십 관리 로직
   ========================================================== */

async function checkMembershipStatus(uid) {
    try {
        const userDocRef = window.doc(window.db, "users", uid);
        const userDoc = await window.getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const data = userDoc.data();

            // [신규] 사용자 선호도 정보 저장
            userPreferences = {
                activity: data.activity,
                food: data.food,
                country: data.country
            };
            let membership = data.membership;
            
            // 1. 신규 유저(멤버십 정보 없음) -> 1-Day Free 자동 시작
            if (!membership) {
                membership = 'free_trial';
                const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24시간
                await window.updateDoc(userDocRef, { 
                    membership: 'free_trial',
                    freeTrialExpiresAt: expiresAt
                });
                data.membership = 'free_trial';
                data.freeTrialExpiresAt = expiresAt;
                alert("🎉 가입 축하 선물!\n24시간 동안 유료 멤버십 혜택이 무료로 제공됩니다.");
            }

            // 2. 상태 체크
            isTrialActive = false;
            if (membership === 'paid') {
                userMembershipType = 'paid';
            } else if (membership === 'free_trial') {
                if (data.freeTrialExpiresAt > Date.now()) {
                    userMembershipType = 'paid'; // 혜택 적용
                    isTrialActive = true;
                    console.log("🎁 1-Day Free 적용 중");
                } else {
                    // 만료됨 -> free로 강등
                    await window.updateDoc(userDocRef, { membership: 'free' });
                    userMembershipType = 'free';
                    alert("1-Day Free 체험이 종료되었습니다.\n계속 혜택을 받으려면 멤버십을 구독하세요.");
                }
            } else {
                userMembershipType = 'free';
            }

            // 3. 온보딩 미완료 시 팝업 (홈 화면일 때만)
            if (!data.onboardingCompleted && document.getElementById('page-home').style.display === 'block') {
                setTimeout(() => openModal('modal-onboarding-reminder'), 1500);
            }
        }
        // [신규] 사용자 선호도에 따라 추천 리스트 필터링
        applyUserPreferences();
        renderOrderMenu(); // 메뉴판 가격 갱신
        updateQRModalUI(); // QR 모달 상태 갱신
    } catch (e) {
        console.error("멤버십 확인 실패:", e);
    }
}

async function simulatePayment() {
    const user = window.auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");

    if (!confirm("30,000원을 결제하시겠습니까? (테스트)")) return;

    try {
        // DB에 'paid' 상태 기록
        await window.setDoc(window.doc(window.db, "users", user.uid), {
            membership: 'paid',
            updatedAt: Date.now(),
            email: user.email
        }, { merge: true });

        alert("결제가 완료되었습니다! 🎉\n이제 QR 코드가 활성화됩니다.");
        checkMembershipStatus(user.uid); // 상태 즉시 갱신
    } catch (e) {
        console.error(e);
        alert("결제 처리 중 오류가 발생했습니다.");
    }
}

/* ==========================================================
   [신규] QR 코드 생성 및 DB 연동
   ========================================================== */
let qrTimerInterval = null;

async function generateQRCode() {
    const user = window.auth.currentUser;
    const qrContainer = document.getElementById('qr-code-view');
    const timeDisplay = document.getElementById('qr-time-display');
    const timerDisplay = document.getElementById('qr-timer-display');
    
    if (!user || !qrContainer) return;

    // 멤버십 확인 (무료 회원은 QR 생성 안 함)
    if (userMembershipType !== 'paid') {
        if(timeDisplay) timeDisplay.innerText = "";
        if(timerDisplay) timerDisplay.innerText = "";
        return;
    }

    // 1. QR 데이터 생성 (UID + 현재 시간)
    const now = new Date();
    const timestamp = now.getTime();
    const qrData = JSON.stringify({
        uid: user.uid,
        email: user.email,
        timestamp: timestamp
    });

    // 2. 화면에 QR 그리기
    qrContainer.innerHTML = ""; // 기존 QR 초기화
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: qrData,
            width: 150,
            height: 150,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }
    
    // UI 초기화 (블러 제거)
    qrContainer.style.filter = 'none';
    qrContainer.style.opacity = '1';
    timeDisplay.innerText = now.toLocaleString(); // 연월일 시간 표시

    // 4. 40초 타이머 시작
    if (qrTimerInterval) clearInterval(qrTimerInterval);
    let timeLeft = 40;
    
    const updateTimer = () => {
        if (timerDisplay) {
            timerDisplay.innerText = `${timeLeft}s`;
            timerDisplay.style.color = timeLeft <= 10 ? '#ef4444' : '#10b981'; // 10초 이하 빨간색
        }
    };
    updateTimer();

    qrTimerInterval = setInterval(() => {
        timeLeft--;
        updateTimer();
        if (timeLeft <= 0) {
            clearInterval(qrTimerInterval);
            if (timerDisplay) timerDisplay.innerText = "Expired";
            qrContainer.style.filter = 'blur(15px)'; // 만료 시 블러 처리
            qrContainer.style.opacity = '0.2';
        }
    }, 1000);

    // 3. Super Admin 관리를 위해 DB에 저장
    try {
        await window.setDoc(window.doc(window.db, "active_qrs", user.uid), {
            uid: user.uid,
            email: user.email,
            qrData: qrData,
            generatedAt: timestamp,
            status: 'active'
        });
    } catch (e) {
        console.error("QR DB 저장 실패:", e);
    }
}

function updateQRModalUI() {
    const qrView = document.getElementById('qr-code-view');
    const payArea = document.getElementById('payment-area');
    const statusMsg = document.getElementById('qr-status-msg');

    if (userMembershipType === 'paid') {
        qrView.style.filter = 'none'; // 블러 제거
        qrView.style.opacity = '1';
        payArea.style.display = 'none'; // 결제 버튼 숨김
        statusMsg.innerHTML = isTrialActive 
            ? '<span style="color:#3b82f6; font-weight:bold;">1-Day Free Pass</span> (체험 중)' 
            : '<span style="color:#10b981; font-weight:bold;">Active Pass</span> (유효함)';
    } else {
        qrView.style.filter = 'blur(8px)'; // 블러 처리
        qrView.style.opacity = '0.5';
        payArea.style.display = 'block'; // 결제 버튼 표시
        statusMsg.innerHTML = '<span style="color:#ef4444; font-weight:bold;">Inactive</span> (결제 필요)';
    }
}

/* ==========================================================
   [신규] 구글 로그인 및 사용자 상태 관리
   ========================================================== */

// 1. 구글 로그인 실행
async function loginWithGoogle() {
    const provider = new window.GoogleAuthProvider();
    try {
        const result = await window.signInWithPopup(window.auth, provider);
        const user = result.user;
        console.log("✅ 로그인 성공:", user.displayName);
        alert(`${user.displayName}님, 환영합니다!`);
        navigateTo('home'); // 로그인 성공 후 홈으로 이동
    } catch (error) {
        console.error("❌ 로그인 실패:", error.message);
        alert("로그인에 실패했습니다: " + error.message);
    }
}

// 2. 로그아웃 기능
async function handleLogout() {
    if(confirm("로그아웃 하시겠습니까?")) {
        try {
            await window.signOut(window.auth);
            alert("로그아웃 되었습니다.");
            navigateTo('home');
        } catch (error) {
            console.error("로그아웃 에러:", error);
        }
    }
}

// 3. 사용자 상태 실시간 감시 (이름 변경 로직)
function initAuthListener() {
    window.onAuthStateChanged(window.auth, async (user) => {
        const userNameElem = document.getElementById('display-user-name');
        const userStatusElem = document.querySelector('.user-status');
        const userProfileDiv = document.querySelector('.user-profile');

        if (user) {
            // 로그인 상태 
            if(userNameElem) userNameElem.innerText = user.displayName;
            if(userStatusElem) userStatusElem.innerText = user.email;
            
            // 로그인 후엔 프로필 버튼을 눌렀을 때 'profile' 페이지로 가게 변경
            if(userProfileDiv) userProfileDiv.setAttribute('onclick', "navigateTo('profile')");
            
            // [순서 변경] 사용자 정보 DB 저장 먼저 (문서 생성 보장)
            await window.setDoc(window.doc(window.db, "users", user.uid), {
                email: user.email,
                displayName: user.displayName,
                lastLogin: Date.now()
            }, { merge: true });

            // [변경] DB에서 실제 멤버십 상태 확인 (1-Day Free 로직 포함)
            checkMembershipStatus(user.uid);

            console.log("� 현재 유저:", user.displayName);
        } else {
            // 로그아웃 상태 (초기화)
            if(userNameElem) userNameElem.innerText = "Guest Traveler";
            if(userStatusElem) userStatusElem.innerText = "Tap to login";
            
            // 로그아웃 상태에선 다시 'login' 페이지로 가게 변경
            if(userProfileDiv) userProfileDiv.setAttribute('onclick', "navigateTo('login')");
            
            // [신규] 로그아웃 시 상태 초기화
            userMembershipType = 'free';
            isTrialActive = false;
            userPreferences = {}; // 선호도 초기화
            if (document.getElementById('page-home').style.display === 'block') filterCategory('all'); // 홈화면일 경우 추천 리스트 리셋

            renderOrderMenu();

            console.log("🚪 로그아웃 상태");
        }
    });
}

/* ==========================================================
   [신규] HTML에서 호출되나 누락되었던 함수들 추가
   ========================================================== */

// 다국어 지원 데이터 (Dictionary)
const translations = {
    'en': {
        'my_qr': 'My QR',
        'menu_title': 'Menu',
        'menu_history': 'My History',
        'menu_voucher': 'My Vouchers',
        'menu_map': 'Map Search',
        'menu_search': 'Search App',
        'menu_spot': 'Spot Events',
        'menu_festival': 'Festivals',
        'menu_hotplace': 'Hotplaces',
        'menu_intro': 'About Seoul',
        'menu_local': 'Local Tourism',
        'menu_free': 'Free Korea Tour',
        'dash_todo': 'To Do',
        'dash_fav': 'Favorites',
        'dash_sched': 'Schedule',
        'banner_saved': 'Total Saved',
        'cat_all': 'All',
        'cat_food': 'Food',
        'cat_cafe': 'Cafe',
        'cat_store': 'Store',
        'cat_beauty': 'Beauty',
        'cat_activity': 'Activity',
        'rec_title': 'Recommended Spots',
        'rec_near': 'Near you',
        'nav_home': 'Home',
        'nav_order': 'Order',
        'nav_map': 'Map',
        'nav_myfit': 'My fit',
        'nav_history': 'History'
    },
    'ko': {
        'my_qr': '내 QR',
        'menu_title': '메뉴',
        'menu_history': '방문 기록',
        'menu_voucher': '내 바우처',
        'menu_map': '지도 검색',
        'menu_search': '앱 검색',
        'menu_spot': '스팟 이벤트',
        'menu_festival': '축제/행사',
        'menu_hotplace': '핫플레이스',
        'menu_intro': '서울 소개',
        'menu_local': '지방 관광',
        'menu_free': '무료 한국 여행',
        'dash_todo': '할 일',
        'dash_fav': '즐겨찾기',
        'dash_sched': '일정',
        'banner_saved': '총 절약 금액',
        'cat_all': '전체',
        'cat_food': '맛집',
        'cat_cafe': '카페',
        'cat_store': '편의점',
        'cat_beauty': '뷰티',
        'cat_activity': '액티비티',
        'rec_title': '추천 장소',
        'rec_near': '내 주변',
        'nav_home': '홈',
        'nav_order': '주문',
        'nav_map': '지도',
        'nav_myfit': '맞춤',
        'nav_history': '기록'
    },
    'ja': {
        'my_qr': 'マイQR',
        'menu_title': 'メニュー',
        'menu_history': '訪問履歴',
        'menu_voucher': 'クーポン',
        'menu_map': '地図検索',
        'menu_search': '検索',
        'menu_spot': 'スポットイベント',
        'menu_festival': 'フェスティバル',
        'menu_hotplace': 'ホットプレイス',
        'menu_intro': 'ソウル紹介',
        'menu_local': '地方観光',
        'menu_free': '無料韓国ツアー',
        'dash_todo': 'やること',
        'dash_fav': 'お気に入り',
        'dash_sched': 'スケジュール',
        'banner_saved': '節約金額',
        'cat_all': 'すべて',
        'cat_food': 'グルメ',
        'cat_cafe': 'カフェ',
        'cat_store': 'コンビニ',
        'cat_beauty': '美容',
        'cat_activity': '遊び',
        'rec_title': 'おすすめスポット',
        'rec_near': '近くの場所',
        'nav_home': 'ホーム',
        'nav_order': '注文',
        'nav_map': '地図',
        'nav_myfit': 'おすすめ',
        'nav_history': '履歴'
    },
    'zh': {
        'my_qr': '我的二维码',
        'menu_title': '菜单',
        'menu_history': '访问记录',
        'menu_voucher': '我的优惠券',
        'menu_map': '地图搜索',
        'menu_search': '搜索',
        'menu_spot': '现场活动',
        'menu_festival': '庆典',
        'menu_hotplace': '热门景点',
        'menu_intro': '首尔介绍',
        'menu_local': '本地旅游',
        'menu_free': '韩国免费游',
        'dash_todo': '待办事项',
        'dash_fav': '收藏夹',
        'dash_sched': '日程',
        'banner_saved': '累计节省',
        'cat_all': '全部',
        'cat_food': '美食',
        'cat_cafe': '咖啡',
        'cat_store': '便利店',
        'cat_beauty': '美容',
        'cat_activity': '体验',
        'rec_title': '推荐场所',
        'rec_near': '附近的',
        'nav_home': '首页',
        'nav_order': '点餐',
        'nav_map': '地图',
        'nav_myfit': '专属推荐',
        'nav_history': '记录'
    }
};

let currentLang = 'en'; // 기본 언어

function changeLanguage(lang) {
    if (!translations[lang]) lang = 'en';
    currentLang = lang;

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang][key]) {
            element.innerText = translations[lang][key];
        }
    });

    console.log(`Language changed to: ${lang}`);
    closeModal('lang-modal');
}

async function handleEmailLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if(!email || !password) return alert("이메일과 비밀번호를 입력해주세요.");
    
    try {
        await window.signInWithEmailAndPassword(window.auth, email, password);
        // 성공 시 onAuthStateChanged가 호출되어 UI가 갱신됩니다.
        navigateTo('home');
    } catch (e) {
        alert("로그인 실패: " + e.message);
    }
}

function openResetPwModal() {
    document.getElementById('modal-reset-pw').style.display = 'flex';
}

async function handlePasswordReset() {
    const email = document.getElementById('reset-email').value;
    if (!email) return alert("이메일을 입력해주세요.");
    
    try {
        await window.sendPasswordResetEmail(window.auth, email);
        alert("비밀번호 재설정 이메일을 보냈습니다. 메일함을 확인해주세요.");
        closeModal('modal-reset-pw');
    } catch (e) {
        console.error(e);
        alert("이메일 전송 실패: " + e.message);
    }
}

async function handleSignUp() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-password-confirm').value;

    if(!name || !email || !password || !confirmPassword) return alert("모든 정보를 입력해주세요.");
    if(password !== confirmPassword) return alert("비밀번호가 일치하지 않습니다.");

    try {
        const result = await window.createUserWithEmailAndPassword(window.auth, email, password);
        const user = result.user;
        
        // 프로필 업데이트 (이름 설정)
        await window.updateProfile(user, { displayName: name });
        
        alert("회원가입이 완료되었습니다! 추가 정보를 입력해주세요.");
        navigateTo('onboarding');
    } catch (e) {
        console.error(e);
        alert("회원가입 실패: " + e.message);
    }
}

function applyUserPreferences() {
    // 홈 화면이 아니면 실행 안 함
    if (document.getElementById('page-home').style.display !== 'block') return;

    const activity = userPreferences.activity;
    let category = 'all'; // 기본값

    if (activity) {
        switch (activity) {
            case 'Shopping':    category = 'store'; break;
            case 'Food Tour':   category = 'food'; break;
            case 'Sightseeing': category = 'activity'; break; // 관광은 액티비티로
            case 'Activity':    category = 'activity'; break;
            default:            category = 'all';
        }
        console.log(`👤 선호도(${activity})에 따라 '${category}' 카테고리를 표시합니다.`);
    }
    
    // 기존 필터 함수를 호출하여 UI 일관성 유지
    // (리스트, 지도, 버튼 상태를 모두 업데이트)
    // [변경] 자동 적용 시에는 모달을 띄우지 않도록 applyCategoryFilter 직접 호출
    applyCategoryFilter(category);
}

async function saveOnboarding() {
    const user = window.auth.currentUser;
    if (!user) return alert("로그인 상태가 아닙니다.");

    const country = document.getElementById('ob-country').value;
    const phone = document.getElementById('ob-phone').value;
    const activity = document.getElementById('ob-activity').value;
    const food = document.getElementById('ob-food').value;

    try {
        // 사용자 정보 업데이트 (기존 정보 유지하며 병합)
        await window.setDoc(window.doc(window.db, "users", user.uid), {
            country, phone, activity, food,
            onboardingCompleted: true,
            updatedAt: Date.now()
        }, { merge: true });
        
        alert("정보가 저장되었습니다. 환영합니다!");
        navigateTo('home');
    } catch(e) {
        console.error(e);
        alert("저장 실패: " + e.message);
    }
}

function copyLocation() {
    const loc = document.getElementById('current-addr')?.innerText || "Unknown Location";
    navigator.clipboard.writeText(loc).then(() => alert("위치가 복사되었습니다."));
}

function shareLocation() {
    alert("위치 공유 기능 실행");
}

/* ==========================================================
   [신규] QR 주문 시스템 로직 (통합)
   ========================================================== */

function startQRScan() {
    // 이미 테이블 번호가 있으면 바로 메뉴판으로
    if (currentTable) {
        navigateTo('order-menu');
    } else {
        navigateTo('order-table');
    }
}

function inputNum(val) {
    if (val === 'C') currentTable = "";
    else if (val === 'BS') currentTable = currentTable.slice(0, -1);
    else if (currentTable.length < 2) currentTable += val;
    
    document.getElementById('ticketDisplay').innerText = currentTable || "--";
}

function checkTableNum() {
    if (!currentTable) return alert("테이블 번호를 입력해주세요.");
    if (!confirm(`테이블 번호 ${currentTable}번이 맞습니까?`)) return;

    // [신규] 더치페이 모드 선택
    if (confirm("더치페이(Dutch Pay) 모드를 사용하시겠습니까?\n\n[확인] 더치페이 모드 (1/N 공유 기능 활성화)\n[취소] 일반 모드 (통합 결제)")) {
        isDutchMode = true;
    } else {
        isDutchMode = false;
    }

    document.getElementById('headerTableNum').innerText = `(Table ${currentTable})${isDutchMode ? ' [Dutch]' : ''}`;
    document.getElementById('floatTableNum').innerText = currentTable;
    renderOrderMenu();
    navigateTo('order-menu');
}

function renderOrderMenu() {
    const list = document.getElementById('orderMenuList');
    if (!list) return;
    
    // 현재 언어에 맞는 메뉴명 표시
    const langKey = currentLang; 
    const isPaid = userMembershipType === 'paid';
    
    list.innerHTML = menuData.map(m => {
        const name = m.name[langKey] || m.name['en'];
        const originalPrice = m.price;
        const memberPrice = Math.floor(originalPrice * 0.95);
        const myQty = cart[m.id] || 0;
        const sharedQty = cart['s-' + m.id] || 0;
        
        let priceHtml = '';
        if (isPaid) {
            priceHtml = `<div style="color:#aaa; font-size:12px; text-decoration:line-through;">₩ ${originalPrice.toLocaleString()}</div><div style="color:#ef4444; font-weight:bold;">₩ ${memberPrice.toLocaleString()} <span style="font-size:10px; background:#fee2e2; padding:2px 4px; border-radius:4px;">PASS</span></div>`;
        } else {
            priceHtml = `<div style="font-weight:bold;">₩ ${originalPrice.toLocaleString()}</div><div style="color:#ef4444; font-size:11px;">Member Price: ₩ ${memberPrice.toLocaleString()} (5% ↓)</div>`;
        }
        
        return `
        <div class="menu-item">
            <img src="${m.img}" class="menu-img">
            <div class="menu-info">
                <div style="font-size:15px; font-weight:bold;">${name}</div>
                <div style="margin-bottom:6px;">${priceHtml}</div>
                
                ${isDutchMode ? `<!-- [신규] 1/N 공유 체크박스 (더치페이 모드일 때만 표시) -->
                <label style="display:flex; align-items:center; gap:4px; font-size:12px; color:#3b82f6; margin-bottom:4px; cursor:pointer; width:fit-content;">
                    <input type="checkbox" id="share-check-${m.id}" style="accent-color:#3b82f6;">
                    <span>1/N Share</span>
                </label>` : ''}

                <div class="qty-ctrl">
                    <button class="qty-btn" onclick="updateQty(${m.id}, -1)">-</button>
                    <span id="qty-${m.id}" style="width:40px; text-align:center; font-weight:bold; font-size:13px;">${myQty}${sharedQty > 0 ? ` <span style="color:#3b82f6;">(+${sharedQty})</span>` : ''}</span>
                    <button class="qty-btn" onclick="updateQty(${m.id}, 1)">+</button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    calcTotal();
}

function updateQty(id, chg) {
    // 공유 체크박스 상태 확인
    let isShared = false;
    const checkEl = document.getElementById(`share-check-${id}`);
    if (checkEl) isShared = checkEl.checked;
    const key = isShared ? 's-' + id : id;

    if (!cart[key]) cart[key] = 0;
    cart[key] += chg;
    if (cart[key] < 0) cart[key] = 0;
    
    // 수량 표시 업데이트 (내꺼 + 공유)
    const myQty = cart[id] || 0;
    const sharedQty = cart['s-' + id] || 0;
    document.getElementById(`qty-${id}`).innerHTML = `${myQty}${sharedQty > 0 ? ` <span style="color:#3b82f6;">(+${sharedQty})</span>` : ''}`;
    calcTotal();
}

function calcTotal() {
    let total = 0;
    let count = 0;
    for (let id in cart) {
        // id가 's-'로 시작하면 숫자만 추출
        const realId = String(id).startsWith('s-') ? id.substring(2) : id;
        const m = menuData.find(x => x.id == realId);
        const price = (userMembershipType === 'paid') ? Math.floor(m.price * 0.95) : m.price;
        if (m) total += price * cart[id]; // 전체 합계 (공유 포함)
        count += cart[id];
    }
    document.getElementById('totalPrice').innerText = total.toLocaleString();
    document.getElementById('btnOrder').disabled = count === 0;
    return total;
}

function openOrderSummary() {
    let html = `<h3>Confirm Order</h3><div style="text-align:left; margin-top:20px; max-height:50vh; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior: contain;">`;
    const langKey = currentLang;
    const isPaid = userMembershipType === 'paid';
    
    for (let id in cart) {
        if (cart[id] > 0) {
            const isShared = String(id).startsWith('s-');
            const realId = isShared ? id.substring(2) : id;
            const m = menuData.find(x => x.id == realId);
            const name = m.name[langKey] || m.name['en'];
            const price = isPaid ? Math.floor(m.price * 0.95) : m.price;
            html += `<div class="bill-list-item" style="${isShared ? 'color:#3b82f6' : ''}"><span>${isShared ? '[Shared] ' : ''}${name} x ${cart[id]}</span><span>₩ ${(price * cart[id]).toLocaleString()}</span></div>`;
        }
    }
    html += `</div><div class="bill-total"><span>Total</span><span style="color:#ef4444;">₩ ${calcTotal().toLocaleString()}</span></div>`;
    html += `<div style="display:flex; gap:10px; margin-top:20px;"><button onclick="closeModal('modal-bill')" style="flex:1; padding:12px; background:#eee; border:none; border-radius:8px; cursor:pointer;">Cancel</button><button onclick="submitOrder()" style="flex:1; padding:12px; background:#3b82f6; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Submit</button></div>`;
    
    document.getElementById('bill-body').innerHTML = html;
    document.getElementById('modal-bill').style.display = 'flex';
}

// [신규] 계산서 모달 (누적 주문 + 현재 장바구니)
function openBillModal() {
    let totalOriginal = 0;
    let totalPaid = 0;
    
    // 더치페이 계산용 변수
    let myTotal = 0;
    let sharedTotal = 0;

    const isPaid = userMembershipType === 'paid';
    const getPrice = (p) => isPaid ? Math.floor(p * 0.95) : p;

    let html = `<h3>Bill (Table ${currentTable})</h3><div style="text-align:left; margin-top:20px; max-height:50vh; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior: contain;">`;
    
    // 1. Confirmed Orders (Group by Batch)
    if (confirmedOrders.length > 0) {
        // Grouping
        const batches = {};
        confirmedOrders.forEach((item, idx) => {
            const bid = item.batchId || 'prev';
            if (!batches[bid]) batches[bid] = [];
            batches[bid].push({ ...item, originalIdx: idx }); // 인덱스 저장
        });

        const batchKeys = Object.keys(batches).sort();
        batchKeys.forEach((bid, idx) => {
            html += `<div style="font-size:12px; color:#888; margin:10px 0 5px; border-bottom:1px solid #eee;">Order #${idx + 1}</div>`;
            batches[bid].forEach(item => {
                const itemPrice = getPrice(item.price);
                const sum = itemPrice * item.qty;
                totalOriginal += item.price * item.qty;
                totalPaid += sum;
                
                // 내꺼 vs 공유 구분
                if (item.isShared) sharedTotal += sum;
                else myTotal += sum;

                const name = item.name[currentLang] || item.name['en'];
                html += `<div class="bill-list-item" style="${item.isShared ? 'color:#3b82f6' : ''}">
                    <span>${item.isShared ? '<i data-lucide="users" style="width:12px"></i> ' : ''}${name} x ${item.qty}</span>
                    <span>₩ ${sum.toLocaleString()}</span>
                </div>`;
            });
        });
    }

    // 2. Current Cart
    let cartTotal = 0;
    let cartHasItems = false;
    let cartHtml = '';
    for (let id in cart) {
        if (cart[id] > 0) {
            cartHasItems = true;
            const isShared = String(id).startsWith('s-');
            const realId = isShared ? id.substring(2) : id;
            const m = menuData.find(x => x.id == realId);
            const itemPrice = getPrice(m.price);
            const sum = itemPrice * cart[id];
            totalOriginal += m.price * cart[id];
            cartTotal += sum;
            totalPaid += sum;
            
            if (isShared) sharedTotal += sum;
            else myTotal += sum;

            const name = m.name[currentLang] || m.name['en'];
            cartHtml += `<div class="bill-list-item" style="color:${isShared ? '#3b82f6' : '#888'};"><span>[New] ${isShared ? '(Shared) ' : ''}${name} x ${cart[id]}</span><span>₩ ${sum.toLocaleString()}</span></div>`;
        }
    }

    if (cartHasItems) {
        html += `<div style="font-size:12px; color:#3b82f6; margin:15px 0 5px; border-bottom:1px solid #3b82f6;">New (In Cart)</div>`;
        html += cartHtml;
    }

    html += `</div>`; // scroll area end

    // Totals Section
    html += `<div style="margin-top:15px; padding-top:10px; border-top:2px dashed #ccc;">`;
    
    // [신규] 더치페이 요약 표시
    if (isDutchMode) {
        html += `<div class="bill-list-item"><span>My Orders</span><span>₩ ${myTotal.toLocaleString()}</span></div>`;
        html += `<div class="bill-list-item" style="color:#3b82f6;"><span>Shared Orders (Total)</span><span>₩ ${sharedTotal.toLocaleString()}</span></div>`;
        
        let defaultN = 2;
        let splitVal = sharedTotal > 0 ? Math.floor(sharedTotal / defaultN) : 0;
        let finalPay = myTotal + splitVal;

        if (sharedTotal > 0) {
            html += `
            <div style="background:#eff6ff; padding:10px; border-radius:8px; margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:12px; color:#3b82f6; font-weight:bold;">Shared 1/N Calculation</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:12px; color:#666;">People:</span>
                        <input type="number" id="split-n" value="${defaultN}" min="2" style="width:40px; padding:2px; text-align:center; border:1px solid #cbd5e1; border-radius:4px;" oninput="calcSharedSplit(${sharedTotal}, ${myTotal})">
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:12px; color:#64748b;">Per Person</span>
                    <span style="font-weight:bold; color:#3b82f6;">₩ <span id="split-val">${splitVal.toLocaleString()}</span></span>
                </div>
            </div>`;
        }

        html += `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:15px; border-radius:12px; margin-top:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px; color:#166534;">
                <span>My Orders</span><span>₩ ${myTotal.toLocaleString()}</span>
            </div>
            ${sharedTotal > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px; color:#166534;">
                <span>+ Shared (1/<span id="summary-n">${defaultN}</span>)</span><span id="summary-shared-part">₩ ${splitVal.toLocaleString()}</span>
            </div>` : ''}
            <div style="border-top:1px dashed #86efac; margin-bottom:10px;"></div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold; color:#15803d;">YOU PAY</span>
                <span style="font-size:20px; font-weight:900; color:#15803d;">₩ <span id="final-personal-pay">${finalPay.toLocaleString()}</span></span>
            </div>
        </div>`;
    }
    
    html += `<div class="bill-total" style="margin-top:5px; border-top:none;"><span>Grand Total</span><span style="color:#ef4444;">₩ ${totalPaid.toLocaleString()}</span></div>`;
    
    const totalSaved = totalOriginal - totalPaid;
    if (totalSaved > 0) {
        html += `<div style="text-align:right; color:#10b981; font-size:13px; font-weight:bold; margin-top:5px;">You Saved: ₩ ${totalSaved.toLocaleString()}</div>`;
    }
    html += `</div>`;

    html += `<div style="display:flex; gap:10px; margin-top:20px;">
        <button onclick="closeModal('modal-bill')" style="flex:1; padding:12px; background:#eee; border:none; border-radius:8px; cursor:pointer;">Close</button>
        <button onclick="finishEating()" style="flex:1; padding:12px; background:#ef4444; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Check Out</button>
    </div>`;

    document.getElementById('bill-body').innerHTML = html;
    document.getElementById('modal-bill').style.display = 'flex';
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function calcSharedSplit(sharedTotal, myTotal) {
    const n = parseInt(document.getElementById('split-n').value) || 1;
    const splitVal = Math.floor(sharedTotal / Math.max(1, n));
    
    // Update input display
    document.getElementById('split-val').innerText = splitVal.toLocaleString();
    
    // Update Final Pay Box
    if(document.getElementById('summary-n')) document.getElementById('summary-n').innerText = n;
    if(document.getElementById('summary-shared-part')) document.getElementById('summary-shared-part').innerText = '₩ ' + splitVal.toLocaleString();
    if(document.getElementById('final-personal-pay')) document.getElementById('final-personal-pay').innerText = (myTotal + splitVal).toLocaleString();
}

async function submitOrder() {
    const batchId = Date.now(); // [신규] 주문 배치 ID
    const orderItems = [];
    let totalAmount = 0;

    // 장바구니 내용을 확정 내역으로 이동
    for (let id in cart) {
        if (cart[id] > 0) {
            const isShared = String(id).startsWith('s-');
            const realId = isShared ? id.substring(2) : id;
            const m = menuData.find(x => x.id == realId);
            
            const itemTotal = m.price * cart[id];
            totalAmount += itemTotal;

            const orderItem = { 
                id: m.id, 
                name: m.name, 
                price: m.price, 
                qty: cart[id], 
                batchId: batchId,
                isShared: isShared 
            };
            confirmedOrders.push(orderItem);
            orderItems.push(orderItem);
        }
    }
    cart = {};
    renderOrderMenu(); // UI 갱신
    closeModal('modal-bill');
    navigateTo('order-waiting');
    
    // [변경] 'orders' 컬렉션에 pending 상태로 저장
    try {
        const docRef = await window.addDoc(window.collection(window.db, "orders"), {
            table: currentTable,
            items: orderItems,
            totalPrice: totalAmount,
            status: 'pending', // 대기 중
            createdAt: Date.now(),
            userId: window.auth.currentUser ? window.auth.currentUser.uid : 'guest'
        });
        console.log("🚀 주문 전송 완료 (Pending)");
        
        // [신규] 실시간 상태 모니터링 시작
        monitorOrderStatus(docRef.id);
    } catch (e) {
        console.error("주문 전송 실패:", e);
        alert("주문 전송 중 오류가 발생했습니다.");
    }
}

// [신규] 식사 종료 및 결제
async function finishEating() {
    // 1. 장바구니에 담긴(아직 주문 안 한) 메뉴가 있는지 확인
    let hasCartItems = false;
    for (let id in cart) {
        if (cart[id] > 0) { hasCartItems = true; break; }
    }

    // 2. 상황별 처리
    if (hasCartItems) {
        if (confirmedOrders.length === 0) {
            return alert("아직 확정된 주문이 없습니다.\n장바구니의 메뉴를 주문하려면 먼저 'Submit' 버튼을 눌러주세요.");
        }
        if (!confirm("장바구니에 주문하지 않은 메뉴가 남아있습니다.\n장바구니 항목은 제외하고, 확정된 주문만 결제하시겠습니까?")) {
            return; // 취소 시 결제 중단
        }
    } else {
        if (!confirm("정산(Check Out)하고 식사를 종료하시겠습니까?")) return;
    }

    let totalOriginal = 0, totalPaid = 0;
    const isPaid = userMembershipType === 'paid';
    const getPrice = (p) => isPaid ? Math.floor(p * 0.95) : p;
    
    // 3. 결제 대상: 확정된 주문(confirmedOrders)만 계산 (장바구니 제외)
    const allItems = [...confirmedOrders];

    if (allItems.length === 0) return alert("주문 내역이 없습니다.");

    let summaryText = [];
    allItems.forEach(item => {
        totalOriginal += item.price * item.qty;
        totalPaid += getPrice(item.price) * item.qty;
        summaryText.push(`${item.isShared ? '(Shared) ' : ''}${item.name[currentLang]||item.name['en']} x${item.qty}`);
    });

    try {
        await window.addDoc(window.collection(window.db, "history"), { 
            type: "dining", 
            date: new Date().toLocaleString(), 
            storeName: `Imake Pocha (Table ${currentTable})`, 
            items: summaryText.join(", "), 
            originalAmount: totalOriginal, 
            paidAmount: totalPaid, 
            savedAmount: totalOriginal - totalPaid, 
            isPaidMember: isPaid, 
            created: Date.now(),
            userId: window.auth.currentUser ? window.auth.currentUser.uid : 'guest' // [신규] 회원별 조회를 위해 ID 저장
        });
        alert(`🎉 정산 완료! (Check Out)\n\n총 ₩${(totalOriginal - totalPaid).toLocaleString()}원을 절약했습니다!`);
        cart = {}; confirmedOrders = []; currentTable = ""; closeModal('modal-bill'); navigateTo('history');
    } catch (e) { console.error(e); alert("오류 발생"); }
}

function minimizeOrder() { navigateTo('home'); }
function restoreOrderScreen() { navigateTo('order-menu'); }

/* ==========================================================
   [신규] 주문 상태 모니터링 (실시간)
   ========================================================== */
let orderStatusUnsub = null;

function monitorOrderStatus(orderId) {
    if (orderStatusUnsub) orderStatusUnsub();

    orderStatusUnsub = window.onSnapshot(window.doc(window.db, "orders", orderId), (doc) => {
        if (!doc.exists()) return;
        const data = doc.data();

        // 상태가 'cooking'으로 변경되었을 때 UI 업데이트
        if (data.status === 'cooking') {
            const container = document.getElementById('page-order-waiting');
            if (!container) return;

            const title = container.querySelector('h2');
            const desc = container.querySelector('p');
            const icon = container.querySelector('.pulse-icon');
            const btnHome = document.getElementById('btn-go-home');

            if (title) title.innerText = "주문 확인! (조리 중)";
            if (desc) desc.innerHTML = "주방에서 주문을 확인했습니다.<br>맛있게 조리 중입니다.";
            if (icon) {
                // 아이콘 변경 (Send -> Chef Hat)
                icon.innerHTML = '<i data-lucide="chef-hat" style="width:32px; height:32px; color:#ef4444;"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
            if (btnHome) btnHome.style.display = 'block';
        }
    });
}
