/* ==========================================================
   [1] 전역 데이터 및 초기화
   ========================================================== */
if (typeof lucide !== 'undefined') lucide.createIcons();

let todoList = [];
let favList = [];
let schedList = [];
let historyList = []; // [신규] 히스토리 데이터
let recData = []; // 추천 데이터 저장소

let currentEditType = null;
let currentEditId = null;

let map = null;       // 지도 객체
let markers = [];     // 지도 마커 배열
let userMarker = null; // [보완] 위치 마커 변수 선언 (누락 방지)

let userMembershipType = 'free'; // [신규] 멤버십 상태 ('free' or 'paid')
// [신규] 주문 시스템 변수
let currentTable = "";
let cart = {};
let confirmedOrders = [];
let isDutchMode = false; // [신규] 더치페이 모드 상태
let menuData = [
    { id: 1, name: { ko: "수원 왕갈비 통닭", en: "Suwon Galbi Chicken", ja: "水原カルビ", zh: "水原炸鸡" }, price: 22000, img: "https://images.unsplash.com/photo-1563127616-52c3f8730b20?w=200" },
    { id: 2, name: { ko: "후라이드 치킨", en: "Fried Chicken", ja: "フライド", zh: "炸鸡" }, price: 19000, img: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=200" },
    { id: 3, name: { ko: "코카콜라", en: "Coca Cola", ja: "コーラ", zh: "可乐" }, price: 2500, img: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200" },
    { id: 4, name: { ko: "생맥주 (500cc)", en: "Draft Beer", ja: "ビール", zh: "啤酒" }, price: 4500, img: "https://images.unsplash.com/photo-1586993451228-09818021e309?w=200" }
];

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
        todoList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // [이동 규칙] 오늘 날짜인 할 일은 스케줄로 이동
        normalizeTodoToSchedule();

        renderTodoList();
        updateCounts();
    });

    // 2. Schedule List
    window.onSnapshot(window.collection(window.db, "schedules"), (snapshot) => {
        schedList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    window.onSnapshot(window.collection(window.db, "recommendations"), (snapshot) => {
        recData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`✅ 맛집 데이터 수신: ${recData.length}개`);
        
        renderRecList('all');
        updateMapMarkers('all');
    });

    // 5. [신규] History List
    window.onSnapshot(window.collection(window.db, "history"), (snapshot) => {
        historyList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // 최신순 정렬
        historyList.sort((a, b) => b.created - a.created);
        renderHistoryList();
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
                <div class="item-title">${item.title}</div>
                <div class="item-sub">${item.date || ''} ${item.time || ''}</div>
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
                <div class="item-title">${item.title}</div>
                <div class="item-sub">⏰ ${item.time || '-'}</div>
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
                    <div class="item-title">${item.title}</div>
                    <div class="item-sub">${item.desc || ''}</div>
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

// 맛집 리스트 그리기
function renderRecList(category) {
    const list = document.getElementById('rec-list-container');
    if (!list) return; 
    const filtered = (category === 'all' || !category) 
        ? recData 
        : recData.filter(item => (item.cat || '').toLowerCase() === category.toLowerCase());
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

// [신규] 히스토리 리스트 그리기
function renderHistoryList() {
    const list = document.getElementById('list-history');
    if (!list) return;
    if (historyList.length === 0) list.innerHTML = "<div style='text-align:center;color:#888;'>기록이 없습니다.</div>";
    else {
        list.innerHTML = historyList.map(item => `
            <div class="list-item" style="display:block; background:rgba(255,255,255,0.1); border:1px solid #333;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-weight:bold; color:white;">${item.storeName}</span>
                    <span style="font-size:12px; color:#888;">${item.date.split(',')[0]}</span>
                </div>
                <div style="font-size:13px; color:#ccc; margin-bottom:8px;">${item.items}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:#ef4444;">₩ ${item.paidAmount.toLocaleString()}</span>
                    ${item.savedAmount > 0 ? `<span style="font-size:11px; background:#10b981; color:white; padding:2px 6px; border-radius:4px;">Save ₩${item.savedAmount.toLocaleString()}</span>` : ''}
                </div>
            </div>
        `).join('');
    }
}

/* ==========================================================
   [신규] 상세 모달 및 즐겨찾기 기능
   ========================================================== */
function openDetailModal(id) {
    const item = recData.find(i => i.id === id);
    if (!item) return;

    // 즐겨찾기 여부 확인 (제목 기준)
    const isFav = favList.some(f => f.title === item.title);
    const favIconClass = isFav ? "fill: #ef4444; color: #ef4444;" : "color: #666;";
    const favText = isFav ? "즐겨찾기 해제" : "즐겨찾기 추가";

    // [추가] 주소 정보가 있으면 표시할 HTML 생성
    const addrHtml = item.addr ? `<div style="margin-bottom:12px; color:#3b82f6; font-weight:bold; font-size:14px; display:flex; align-items:center; gap:4px;"><i data-lucide="map-pin" style="width:16px;"></i> ${item.addr}</div>` : '';

    const html = `
        <div style="position:relative;">
            <img src="${item.img || 'https://via.placeholder.com/400x250'}" style="width:100%; height:220px; object-fit:cover;">
            <div style="position:absolute; bottom:0; left:0; width:100%; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px; color:white;">
                <h2 style="margin:0; font-size:22px;">${item.title}</h2>
                <div style="font-size:13px; opacity:0.9; margin-top:4px;">${item.cat || 'Place'}</div>
            </div>
        </div>
        <div style="padding:20px;">
            ${addrHtml}
            <p style="color:#444; line-height:1.6; margin-top:0;">${item.desc || '상세 설명이 없습니다.'}</p>
            
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button onclick="toggleRecFavorite('${item.id}')" style="flex:1; padding:12px; border:1px solid #ddd; background:white; border-radius:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
                    <i data-lucide="heart" style="width:18px; ${favIconClass}"></i> <span id="fav-btn-text">${favText}</span>
                </button>
                <button onclick="moveToMap('${item.title}', ${item.lat}, ${item.lng}); closeModal('modal-detail');" style="flex:1; padding:12px; background:#3b82f6; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
                    📍 지도 보기
                </button>
            </div>
        </div>
    `;

    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('modal-detail').style.display = 'flex';
    lucide.createIcons();
}

async function toggleRecFavorite(recId) {
    const item = recData.find(i => i.id === recId);
    if (!item) return;

    const existingFav = favList.find(f => f.title === item.title);
    if (existingFav) {
        await deleteItem('favorites', existingFav.id); // 이미 있으면 삭제
    } else {
        await window.addDoc(window.collection(window.db, "favorites"), {
            title: item.title, desc: item.desc || '', cat: item.cat || '', created: Date.now()
        });
    }
    // 상태 변경 후 모달 다시 렌더링 (UI 갱신)
    openDetailModal(recId);
}

/* ==========================================================
   [5] 지도 연동 핵심 기능
   ========================================================== */
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || map !== null) return;
    map = L.map('map').setView([37.5665, 126.9780], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    updateMapMarkers('all');
}

function updateMapMarkers(category) {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const filtered = (category === 'all' || !category) 
        ? recData 
        : recData.filter(item => (item.cat || '').toLowerCase() === category.toLowerCase());
    filtered.forEach(item => {
        if (item.lat && item.lng) {
            const marker = L.marker([item.lat, item.lng]).addTo(map);
            marker.bindPopup(`<b>${item.title}</b><br>${item.desc || ''}`);
            // [수정] 지도 팝업에도 주소 표시
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
        markers.forEach(m => {
            const p = m.getLatLng();
            if (Math.abs(p.lat - lat) < 0.0001) m.openPopup();
        });
    }, 300);
}

function filterCategory(category) {
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.cat-btn[onclick*="'${category}'"]`);
    if(activeBtn) activeBtn.classList.add('active');
    renderRecList(category);
    updateMapMarkers(category);
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
    const modals = ['qr-modal', 'lang-modal', 'modal-todo', 'modal-fav', 'modal-sched', 'modal-edit-popup', 'modal-detail', 'modal-bill'];
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
function openQRModal() { document.getElementById('qr-modal').style.display = 'flex'; }
function openLangModal() { document.getElementById('lang-modal').style.display = 'flex'; }

function findMyLocation() {
    if (!navigator.geolocation) return alert("GPS 지원 불가");
    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        if (map) {
            map.flyTo([latitude, longitude], 15);
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.circleMarker([latitude, longitude], { radius: 8, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
            
            // [추가] 좌표를 주소로 변환 (Reverse Geocoding)
            getAddressFromCoords(latitude, longitude);
        }
    }, (error) => alert("위치 권한 필요"), { enableHighAccuracy: true });
}

async function getAddressFromCoords(lat, lng) {
    try {
        // OpenStreetMap의 무료 주소 변환 API (Nominatim) 호출
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.display_name) {
            const addrElement = document.getElementById('current-addr');
            if (addrElement) addrElement.innerText = data.display_name;
            console.log("📍 주소 변환 성공:", data.display_name);
        }
    } catch (e) {
        console.error("주소 변환 실패:", e);
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
    window.onAuthStateChanged(window.auth, (user) => {
        const userNameElem = document.getElementById('display-user-name');
        const userStatusElem = document.querySelector('.user-status');
        const userProfileDiv = document.querySelector('.user-profile');

        if (user) {
            // 로그인 상태 
            if(userNameElem) userNameElem.innerText = user.displayName;
            if(userStatusElem) userStatusElem.innerText = user.email;
            
            // 로그인 후엔 프로필 버튼을 눌렀을 때 'profile' 페이지로 가게 변경
            if(userProfileDiv) userProfileDiv.setAttribute('onclick', "navigateTo('profile')");
            
            // [신규] 로그인 시 유료 회원으로 간주 및 메뉴판 갱신
            userMembershipType = 'paid';
            renderOrderMenu();
            
            console.log("👤 현재 유저:", user.displayName);
        } else {
            // 로그아웃 상태 (초기화)
            if(userNameElem) userNameElem.innerText = "Guest Traveler";
            if(userStatusElem) userStatusElem.innerText = "Tap to login";
            
            // 로그아웃 상태에선 다시 'login' 페이지로 가게 변경
            if(userProfileDiv) userProfileDiv.setAttribute('onclick', "navigateTo('login')");
            
            // [신규] 로그아웃 시 무료 회원으로 전환 및 메뉴판 갱신
            userMembershipType = 'free';
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

function handleEmailLogin() {
    const email = document.getElementById('login-email').value;
    if(!email) return alert("이메일을 입력해주세요.");
    alert(`이메일 로그인 시도: ${email} (백엔드 연동 필요)`);
}

function handleSignUp() {
    alert("회원가입 기능은 준비 중입니다.");
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
    let html = `<h3>Confirm Order</h3><div style="text-align:left; margin-top:20px;">`;
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

    let html = `<h3>Bill (Table ${currentTable})</h3><div style="text-align:left; margin-top:20px; max-height:300px; overflow-y:auto;">`;
    
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

function submitOrder() {
    const batchId = Date.now(); // [신규] 주문 배치 ID
    // 장바구니 내용을 확정 내역으로 이동
    for (let id in cart) {
        if (cart[id] > 0) {
            const isShared = String(id).startsWith('s-');
            const realId = isShared ? id.substring(2) : id;
            const m = menuData.find(x => x.id == realId);
            confirmedOrders.push({ 
                id: m.id, 
                name: m.name, 
                price: m.price, 
                qty: cart[id], 
                batchId: batchId,
                isShared: isShared // [신규] 공유 여부 저장
            });
        }
    }
    cart = {};
    renderOrderMenu(); // UI 갱신
    closeModal('modal-bill');
    navigateTo('order-waiting');
    
    // 3초 후 주문 접수 완료 처리 (시뮬레이션)
    setTimeout(() => {
        alert("주방에서 주문을 접수했습니다! (조리 시작)");
        // 주문 후에도 메뉴판에 머무르거나 홈으로 이동 (여기선 홈으로)
        navigateTo('home'); 
    }, 3000);
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
        await window.addDoc(window.collection(window.db, "history"), { type: "dining", date: new Date().toLocaleString(), storeName: `Imake Pocha (Table ${currentTable})`, items: summaryText.join(", "), originalAmount: totalOriginal, paidAmount: totalPaid, savedAmount: totalOriginal - totalPaid, isPaidMember: isPaid, created: Date.now() });
        alert(`🎉 정산 완료! (Check Out)\n\n총 ₩${(totalOriginal - totalPaid).toLocaleString()}원을 절약했습니다!`);
        cart = {}; confirmedOrders = []; currentTable = ""; closeModal('modal-bill'); navigateTo('history');
    } catch (e) { console.error(e); alert("오류 발생"); }
}

function minimizeOrder() { navigateTo('home'); }
function restoreOrderScreen() { navigateTo('order-menu'); }
