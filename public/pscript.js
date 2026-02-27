/* ==========================================================
   [Provider] Logic (사장님용)
   ========================================================== */

window.onload = function() {
    const checkInterval = setInterval(() => {
        if (window.auth && window.db) {
            clearInterval(checkInterval);
            initProviderAuth();
        }
    }, 100);
};

async function initProviderAuth() {
    window.onAuthStateChanged(window.auth, async (user) => {
        if (user) {
            // providers 컬렉션 확인
            const docRef = window.doc(window.db, "providers", user.uid);
            const docSnap = await window.getDoc(docRef);

            document.getElementById('login-view').style.display = 'none';
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.status === 'active') {
                    // 승인 완료 -> 대시보드 진입
                    document.getElementById('dashboard-view').style.display = 'block';
                    document.getElementById('pending-view').style.display = 'none';
                    document.getElementById('register-view').style.display = 'none';
                    initDashboard();
                } else {
                    // 승인 대기 중
                    document.getElementById('pending-view').style.display = 'block';
                }
            } else {
                // 미가입 -> 가입 신청 폼
                document.getElementById('register-view').style.display = 'block';
                document.getElementById('reg-email').value = user.email;
            }
        } else {
            document.getElementById('login-view').style.display = 'block';
            document.getElementById('dashboard-view').style.display = 'none';
            document.getElementById('register-view').style.display = 'none';
            document.getElementById('pending-view').style.display = 'none';
        }
    });
}

function providerLogin() { window.signInWithPopup(window.auth, window.provider).catch(e => alert(e.message)); }
function providerLogout() { window.signOut(window.auth); }

async function registerProvider() {
    const user = window.auth.currentUser;
    const name = document.getElementById('reg-store-name').value;
    if(!name) return alert("가게 이름을 입력하세요.");

    // [신규] QR 코드에 담을 데이터 생성 (매장 진입용 URL)
    // 예: https://imake-master.web.app/entry?pid=PROVIDER_UID
    const entryUrl = `${window.location.origin}/entry?pid=${user.uid}`;

    await window.setDoc(window.doc(window.db, "providers", user.uid), {
        storeName: name, 
        email: user.email, 
        status: 'pending', 
        createdAt: Date.now(),
        qrData: entryUrl // [신규] QR 데이터 저장
    });
    alert("가입 신청이 완료되었습니다. 관리자 승인을 기다려주세요.");
    location.reload();
}

function initDashboard() {
    loadMenus();
    loadLiveOrders();
    loadHistory();
    loadStoreSettings();
    loadCongestionStatus(); // [신규] 혼잡도 상태 로드
    
    // [신규] 알림 권한 요청
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    
    if(window.lucide) window.lucide.createIcons();
}

// --- [기능 1] 실시간 주문 접수 (사장님 전용) ---
let isFirstLoad = true; // 초기 로딩 시 알림 방지용

function loadLiveOrders() {
    window.onSnapshot(window.collection(window.db, "orders"), (snapshot) => {
        // [신규] 새 주문 알림 트리거
        if (!isFirstLoad) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added" && change.doc.data().status === 'pending') {
                    if (Notification.permission === "granted") {
                        new Notification("🔔 새 주문이 들어왔습니다!", { body: `Table ${change.doc.data().table}번 테이블 주문 확인` });
                    }
                }
            });
        }
        isFirstLoad = false;

        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const pendingOrders = orders.filter(o => o.status === 'pending').sort((a,b) => a.createdAt - b.createdAt);
        
        const container = document.getElementById('live-order-list');
        if (pendingOrders.length === 0) {
            container.innerHTML = "<p style='color:#888; text-align:center; margin-top:20px;'>현재 대기 중인 주문이 없습니다.</p>";
            return;
        }

        container.innerHTML = pendingOrders.map(o => `
            <div style="background:white; padding:15px; border-radius:8px; margin-bottom:10px; border-left:5px solid #ef4444; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:bold; font-size:18px;">Table ${o.table}</span>
                    <span style="font-size:12px; color:#666;">${new Date(o.createdAt).toLocaleTimeString()}</span>
                </div>
                <div style="margin-bottom:10px; font-size:14px;">
                    ${o.items.map(i => `<div>${i.name.ko || i.name.en} x ${i.qty}</div>`).join('')}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold;">₩ ${o.totalPrice.toLocaleString()}</span>
                    <button onclick="acceptOrder('${o.id}')" style="padding:8px 16px; background:#ef4444; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">접수 (Accept)</button>
                </div>
            </div>
        `).join('');
    });
}

async function acceptOrder(orderId) {
    if(!confirm("주문을 접수하시겠습니까? (조리 시작)")) return;
    try {
        await window.updateDoc(window.doc(window.db, "orders", orderId), { status: 'cooking' });
    } catch(e) { console.error(e); alert("접수 실패"); }
}

// --- [기능 2] 메뉴 관리 (사장님 전용) ---
let menuData = [];
function loadMenus() {
    window.onSnapshot(window.collection(window.db, "menus"), (snapshot) => {
        menuData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        menuData.sort((a, b) => Number(a.id) - Number(b.id));
        
        const list = document.getElementById('menu-list');
        list.innerHTML = menuData.map(m => `
            <div style="display:flex; align-items:center; border-bottom:1px solid #eee; padding:8px 0; opacity:${m.soldOut ? '0.6' : '1'};">
                <img src="${m.img}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; margin-right:10px; filter:${m.soldOut ? 'grayscale(100%)' : 'none'};">
                <div style="flex:1;">${m.name.ko} ${m.soldOut ? '<span style="color:red; font-weight:bold; font-size:12px;">(SOLD OUT)</span>' : ''} <small>(${m.price})</small></div>
                <button onclick="editMenu('${m.id}')" style="margin-right:5px; padding:4px 8px; border:1px solid #ddd; background:white; border-radius:4px; cursor:pointer;">수정</button>
                <button onclick="toggleSoldOut('${m.id}', ${m.soldOut})" style="margin-right:5px; padding:4px 8px; border:1px solid #ddd; background:white; border-radius:4px; cursor:pointer;">${m.soldOut ? '입고' : '품절'}</button>
                <button onclick="deleteMenu('${m.id}')" style="color:red; border:none; background:none; cursor:pointer;">Del</button>
            </div>
        `).join('');
    });
}

async function toggleSoldOut(id, currentStatus) {
    await window.updateDoc(window.doc(window.db, "menus", id), { soldOut: !currentStatus });
}

function editMenu(id) {
    const menu = menuData.find(m => m.id === id);
    if (!menu) return;
    
    document.getElementById('menu-id').value = menu.id;
    document.getElementById('menu-name-ko').value = menu.name.ko || '';
    document.getElementById('menu-name-en').value = menu.name.en || '';
    document.getElementById('menu-price').value = menu.price || '';
    document.getElementById('menu-img').value = menu.img || '';
    
    // 스크롤을 폼으로 이동
    document.getElementById('menu-name-ko').focus();
}

async function saveMenu() {
    const id = document.getElementById('menu-id').value;
    const nameKo = document.getElementById('menu-name-ko').value;
    const price = document.getElementById('menu-price').value;
    if (!nameKo || !price) return alert("필수 입력");
    
    const data = {
        name: { ko: nameKo, en: document.getElementById('menu-name-en').value || nameKo },
        price: Number(price),
        img: document.getElementById('menu-img').value || "https://via.placeholder.com/150"
    };

    const docId = id || String(Date.now());
    await window.setDoc(window.doc(window.db, "menus", docId), data, { merge: true });
    clearMenuForm();
}

async function deleteMenu(id) {
    if(confirm("삭제?")) await window.deleteDoc(window.doc(window.db, "menus", id));
}

function clearMenuForm() {
    document.getElementById('menu-id').value = '';
    document.querySelectorAll('input').forEach(el => el.value = "");
}

function loadHistory() {
    // 지난 주문 내역 (간단 보기)
    window.onSnapshot(window.collection(window.db, "history"), (snapshot) => {
         const orders = snapshot.docs.map(doc => doc.data());
         const recent = orders.sort((a, b) => b.created - a.created).slice(0, 10);
         document.getElementById('history-list').innerHTML = recent.map(o => `
            <div style="padding:10px; border-bottom:1px solid #eee;">
                <div style="font-weight:bold;">${o.storeName || 'Order'} <span style="float:right; color:#3b82f6;">₩ ${o.paidAmount?.toLocaleString()}</span></div>
                <div style="font-size:12px; color:#666;">${o.items}</div>
                <div style="font-size:11px; color:#999;">${new Date(o.created).toLocaleString()}</div>
            </div>
        `).join('');
    });
}

// --- [기능 3] 설정 관리 ---
async function loadStoreSettings() {
    const user = window.auth.currentUser;
    if (!user) return;
    const docSnap = await window.getDoc(window.doc(window.db, "providers", user.uid));
    if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById('set-store-name').value = data.storeName || '';
        document.getElementById('set-store-hours').value = data.hours || '';
        document.getElementById('set-store-cat').value = data.category || 'Food';

        if (data.pendingUpdate) {
            document.getElementById('pending-msg').style.display = 'block';
        } else {
            document.getElementById('pending-msg').style.display = 'none';
        }

        // [신규] QR 코드 렌더링
        if (data.qrData && typeof QRCode !== 'undefined') {
            const qrContainer = document.getElementById('provider-qr-code');
            qrContainer.innerHTML = ''; // Placeholder 제거
            new QRCode(qrContainer, {
                text: data.qrData,
                width: 150,
                height: 150,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }
    }
}

async function saveStoreSettings() {
    const user = window.auth.currentUser;
    if (!user) return;
    
    const name = document.getElementById('set-store-name').value;
    const hours = document.getElementById('set-store-hours').value;
    const cat = document.getElementById('set-store-cat').value;

    try {
        // [변경] 바로 수정하지 않고 pendingUpdate 필드에 저장 (승인 요청)
        await window.updateDoc(window.doc(window.db, "providers", user.uid), {
            pendingUpdate: { storeName: name, hours: hours, category: cat, updatedAt: Date.now() }
        });
        alert("정보 수정 요청이 전송되었습니다.\n관리자 승인 후 반영됩니다.");
        loadStoreSettings(); // UI 갱신 (메시지 표시)
    } catch(e) { console.error(e); alert("저장 실패"); }
}

function switchTab(tabName) {
    document.getElementById('tab-dashboard').style.display = tabName === 'dashboard' ? 'grid' : 'none';
    document.getElementById('tab-settings').style.display = tabName === 'settings' ? 'block' : 'none';
    document.getElementById('btn-tab-dash').style.borderBottom = tabName === 'dashboard' ? '2px solid #3b82f6' : 'none';
    document.getElementById('btn-tab-set').style.borderBottom = tabName === 'settings' ? '2px solid #3b82f6' : 'none';
}

// --- [기능 4] 혼잡도 관리 (신호등) ---
async function loadCongestionStatus() {
    const user = window.auth.currentUser;
    if (!user) return;

    // 1. 내 가게 정보 가져오기
    const providerDoc = await window.getDoc(window.doc(window.db, "providers", user.uid));
    if (!providerDoc.exists()) return;
    const storeName = providerDoc.data().storeName;

    // 2. recommendations 컬렉션에서 내 가게 찾기 (title == storeName)
    const q = window.query(window.collection(window.db, "recommendations"), window.where("title", "==", storeName));
    const querySnapshot = await window.getDocs(q);

    if (!querySnapshot.empty) {
        const recDoc = querySnapshot.docs[0];
        const status = recDoc.data().status || 'green';
        updateCongestionUI(status);
    }
}

async function updateCongestion(status) {
    const user = window.auth.currentUser;
    if (!user) return;

    const providerDoc = await window.getDoc(window.doc(window.db, "providers", user.uid));
    if (!providerDoc.exists()) return;
    const storeName = providerDoc.data().storeName;

    const q = window.query(window.collection(window.db, "recommendations"), window.where("title", "==", storeName));
    const querySnapshot = await window.getDocs(q);

    if (!querySnapshot.empty) {
        const recDoc = querySnapshot.docs[0];
        await window.updateDoc(window.doc(window.db, "recommendations", recDoc.id), { status: status });
        updateCongestionUI(status);
        // alert(`혼잡도가 '${status}'로 변경되었습니다.`); // 너무 자주 뜨면 귀찮으므로 생략 가능
    } else {
        alert("추천 리스트(recommendations)에서 매장을 찾을 수 없습니다.\n관리자에게 문의하세요.");
    }
}

function updateCongestionUI(status) {
    // 모든 버튼 초기화
    document.querySelectorAll('.btn-congestion').forEach(btn => {
        btn.style.border = '1px solid #ddd';
        btn.style.background = 'white';
        btn.style.transform = 'scale(1)';
    });

    // 선택된 버튼 강조
    const activeBtn = document.getElementById(`btn-${status}`);
    if (activeBtn) {
        activeBtn.style.border = '2px solid #333';
        activeBtn.style.background = '#f0f9ff';
        activeBtn.style.transform = 'scale(1.05)';
    }
}

window.providerLogin = providerLogin; window.providerLogout = providerLogout;
window.registerProvider = registerProvider;
window.acceptOrder = acceptOrder; window.saveMenu = saveMenu; window.deleteMenu = deleteMenu; window.clearMenuForm = clearMenuForm;
window.switchTab = switchTab; window.saveStoreSettings = saveStoreSettings; window.toggleSoldOut = toggleSoldOut;
window.updateCongestion = updateCongestion; window.editMenu = editMenu;