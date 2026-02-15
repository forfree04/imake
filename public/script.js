/* ==========================================================
   [1] 전역 데이터 및 초기화
   ========================================================== */
if (typeof lucide !== 'undefined') lucide.createIcons();

let todoList = [];
let favList = [];
let schedList = [];
let recData = []; // 추천 데이터 저장소

let currentEditType = null;
let currentEditId = null;

let map = null;       // 지도 객체
let markers = [];     // 지도 마커 배열
let userMarker = null; // [보완] 위치 마커 변수 선언 (누락 방지)

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
}

// [추가된 함수] To-Do -> Schedule 자동 이동
async function normalizeTodoToSchedule() {
    const today = new Date().toISOString().split('T')[0];
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

    const today = new Date().toISOString().split('T')[0];
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
    const modals = ['qr-modal', 'lang-modal', 'modal-todo', 'modal-fav', 'modal-sched', 'modal-edit-popup', 'modal-detail'];
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
            
            console.log("👤 현재 유저:", user.displayName);
        } else {
            // 로그아웃 상태 (초기화)
            if(userNameElem) userNameElem.innerText = "Guest Traveler";
            if(userStatusElem) userStatusElem.innerText = "Tap to login";
            
            // 로그아웃 상태에선 다시 'login' 페이지로 가게 변경
            if(userProfileDiv) userProfileDiv.setAttribute('onclick', "navigateTo('login')");
            
            console.log("🚪 로그아웃 상태");
        }
    });
}

/* ==========================================================
   [신규] HTML에서 호출되나 누락되었던 함수들 추가
   ========================================================== */

function changeLang(lang) {
    alert(`Language changed to: ${lang} (Prototype)`);
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
