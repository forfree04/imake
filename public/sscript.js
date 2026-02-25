/* ==========================================================
   [Super Admin] Logic
   ========================================================== */

// 1. 인증 및 초기화
window.onload = function() {
    // Firebase 로드 대기 (안전장치)
    const checkInterval = setInterval(() => {
        if (window.auth && window.db) {
            clearInterval(checkInterval);
            initAdminAuth();
        }
    }, 100);
};

async function initAdminAuth() {
    window.onAuthStateChanged(window.auth, async (user) => {
        if (user) {
            // [보안] admins 컬렉션에 내 UID가 있는지 확인
            const adminDoc = await window.getDoc(window.doc(window.db, "admins", user.uid));
            
            if (adminDoc.exists()) {
                console.log("Admin Logged in:", user.email);
                document.getElementById('login-view').style.display = 'none';
                document.getElementById('dashboard-view').style.display = 'block';
                initDashboard();
            } else {
                // [초기 설정용] 관리자가 한 명도 없으면, 첫 접속자를 관리자로 등록 (테스트 편의성)
                const snapshot = await window.getDocs(window.collection(window.db, "admins"));
                if (snapshot.empty) {
                    if(confirm("관리자가 없습니다. 현재 계정을 Super Admin으로 등록하시겠습니까?")) {
                        await window.setDoc(window.doc(window.db, "admins", user.uid), { email: user.email, level: 'super', createdAt: Date.now() });
                        location.reload();
                        return;
                    }
                }
                alert("관리자 권한이 없습니다.");
                window.signOut(window.auth);
            }
        } else {
            document.getElementById('login-view').style.display = 'block';
            document.getElementById('dashboard-view').style.display = 'none';
        }
    });
}

function adminLogin() {
    window.signInWithPopup(window.auth, window.provider).catch(e => alert("Login Failed: " + e.message));
}

function adminLogout() {
    window.signOut(window.auth);
}

// 2. 대시보드 기능 초기화
function initDashboard() {
    loadDashboardStats(); // [신규] 대시보드 통계 및 차트
    loadAllPartners(); // [개편] 전체 파트너 로드
    loadUsers();      // [신규] 전체 유저 목록
    document.getElementById('today-date').innerText = new Date().toLocaleDateString();
    if(window.lucide) window.lucide.createIcons();
}

// --- [기능 0] 대시보드 통계 및 차트 ---
async function loadDashboardStats() {
    // 1. Users Data
    window.onSnapshot(window.collection(window.db, "users"), (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data());
        const total = users.length;
        const paid = users.filter(u => u.membership === 'paid').length;
        const ratio = total > 0 ? ((paid / total) * 100).toFixed(1) : 0;
        
        // KPI Update
        document.getElementById('kpi-users').innerText = total.toLocaleString();
        document.getElementById('kpi-paid-ratio').innerText = `${ratio}%`;
        
        // Mockup: 전일 대비 증감 (실제로는 DB에 가입일 history가 있어야 정확함)
        document.getElementById('kpi-users-inc').innerText = Math.floor(Math.random() * 5); 

        // Chart: Nationality (Mockup data as 'lang' field might not exist on all users yet)
        renderNationChart(users);
    });

    // 2. Partners Data
    window.onSnapshot(window.collection(window.db, "providers"), (snapshot) => {
        const providers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const active = providers.filter(p => p.status === 'active');
        const pending = providers.filter(p => p.status === 'pending');

        // KPI Update
        document.getElementById('kpi-partners').innerText = active.length.toLocaleString();

        // Pending List (Bottom Section)
        const pendingContainer = document.getElementById('dashboard-pending-list');
        if (pending.length === 0) {
            pendingContainer.innerHTML = "<p style='color:#888;'>승인 대기 중인 파트너가 없습니다.</p>";
        } else {
            pendingContainer.innerHTML = pending.map(p => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                    <div><strong>${p.storeName}</strong> <span style="color:#666; font-size:12px;">(${p.category})</span></div>
                    <button onclick="switchView('partners')" style="padding:4px 8px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer;">Go to Approve</button>
                </div>
            `).join('');
        }

        // Chart: Category Distribution
        renderCategoryChart(active);
    });

    // 3. History (Revenue) Data
    window.onSnapshot(window.collection(window.db, "history"), (snapshot) => {
        const history = snapshot.docs.map(doc => doc.data());
        
        // Today's GMV
        const todayStr = new Date().toLocaleDateString();
        const todayTx = history.filter(h => new Date(h.created).toLocaleDateString() === todayStr);
        const todayGmv = todayTx.reduce((acc, cur) => acc + (cur.paidAmount || 0), 0);
        document.getElementById('kpi-gmv').innerText = todayGmv.toLocaleString();
    });
}

// --- Chart Rendering Functions ---
let catChart, natChart;

function renderCategoryChart(providers) {
    const ctx = document.getElementById('chart-category').getContext('2d');
    const counts = {};
    providers.forEach(p => {
        const cat = p.category || 'Other';
        counts[cat] = (counts[cat] || 0) + 1;
    });

    if (catChart) catChart.destroy();
    catChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

function renderNationChart(users) {
    const ctx = document.getElementById('chart-nation').getContext('2d');
    // Mockup logic since 'lang' might not be saved yet
    // In real app, count users by user.lang
    const data = { 'English': 45, 'Korean': 30, 'Japanese': 15, 'Chinese': 10 };
    
    if (natChart) natChart.destroy();
    natChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#6366f1', '#ec4899', '#14b8a6', '#f97316']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

// --- [기능 3] 공급자(Provider) 관리 ---
function loadAllPartners() {
    window.onSnapshot(window.collection(window.db, "providers"), (snapshot) => {
        const providers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const tableBody = document.getElementById('partners-table-body');
        if (!tableBody) return;

        if (providers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#888;">등록된 파트너가 없습니다.</td></tr>`;
            return;
        }

        tableBody.innerHTML = providers.map(p => {
            let statusHtml = '';
            if (p.status === 'active') {
                statusHtml = `<span style="color:#10b981; font-weight:bold;">Active</span>`;
            } else if (p.status === 'pending') {
                statusHtml = `<span style="color:#f59e0b; font-weight:bold;">Pending</span>`;
            } else {
                statusHtml = `<span style="color:#ef4444; font-weight:bold;">${p.status}</span>`;
            }

            return `
                <tr>
                    <td>${p.storeName}</td>
                    <td>${p.category}</td>
                    <td>${p.phone || '-'}</td>
                    <td>${statusHtml}</td>
                    <td>
                        <button onclick="openPartnerModal('${p.id}')" style="padding:4px 8px; background:#f1f5f9; border:1px solid #ddd; border-radius:4px; cursor:pointer;">Edit</button>
                        <button onclick="viewProviderHistory('${p.storeName}')" style="padding:4px 8px; background:#f1f5f9; border:1px solid #ddd; border-radius:4px; cursor:pointer;">History</button>
                        <button onclick="deletePartner('${p.id}')" style="padding:4px 8px; background:#fee2e2; color:#ef4444; border:none; border-radius:4px; cursor:pointer;">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

async function approveProvider(uid) {
    if(!confirm("이 업체의 가입을 승인하시겠습니까?")) return;
    await window.updateDoc(window.doc(window.db, "providers", uid), { status: 'active' });
}

// --- [개편] 파트너 CRUD ---
async function openPartnerModal(partnerId = null) {
    const modal = document.getElementById('partner-modal');
    const title = document.getElementById('partner-modal-title');
    const idInput = document.getElementById('partner-id');

    // Reset form
    idInput.value = '';
    document.getElementById('new-partner-store').value = '';
    document.getElementById('new-partner-cat').value = '';
    document.getElementById('new-partner-addr').value = '';
    document.getElementById('new-partner-phone').value = '';
    document.getElementById('new-partner-menu-name').value = '';
    document.getElementById('new-partner-menu-price').value = '';
    document.getElementById('new-partner-menu-name').disabled = false;
    document.getElementById('new-partner-menu-price').disabled = false;

    if (partnerId) {
        // Edit mode
        title.innerText = "Edit Partner";
        idInput.value = partnerId;
        const docSnap = await window.getDoc(window.doc(window.db, "providers", partnerId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('new-partner-store').value = data.storeName || '';
            document.getElementById('new-partner-cat').value = data.category || '';
            document.getElementById('new-partner-addr').value = data.address || '';
            document.getElementById('new-partner-phone').value = data.phone || '';
            // Note: Editing menu is not supported in this simple form.
            document.getElementById('new-partner-menu-name').disabled = true;
            document.getElementById('new-partner-menu-price').disabled = true;
        }
    } else {
        // Add mode
        title.innerText = "Add New Partner";
    }

    document.getElementById('partner-modal').style.display = 'flex';
}

function closePartnerModal() {
    document.getElementById('partner-modal').style.display = 'none';
}

async function savePartner() {
    const partnerId = document.getElementById('partner-id').value;
    const storeName = document.getElementById('new-partner-store').value.trim();
    const category = document.getElementById('new-partner-cat').value.trim();
    const address = document.getElementById('new-partner-addr').value.trim();
    const phone = document.getElementById('new-partner-phone').value.trim();
    const menuName = document.getElementById('new-partner-menu-name').value.trim();
    const menuPrice = document.getElementById('new-partner-menu-price').value.trim();

    if (!storeName || !category) return alert("매장명과 카테고리는 필수입니다.");

    // [신규] 주소로 좌표 찾기
    let lat = 37.5665;
    let lng = 126.9780;
    if (address) {
        const coords = await getCoordsFromAddress(address);
        if (coords) {
            lat = coords.lat;
            lng = coords.lng;
        } else {
            alert("주소를 찾을 수 없어 기본 좌표(서울시청)로 저장합니다.");
        }
    }

    const data = {
        storeName,
        category,
        address,
        phone,
        lat, lng, // 좌표 저장
        status: 'active', // 관리자가 직접 등록/수정하므로 바로 승인
        createdAt: Date.now()
    };

    try {
        if (partnerId) {
            // Update existing partner
            await window.updateDoc(window.doc(window.db, "providers", partnerId), data);
            alert(`매장 [${storeName}] 정보 수정 완료!`);
        } else {
            // Create new partner
            const providerRef = await window.addDoc(window.collection(window.db, "providers"), data);

            // [신규] 테스트용: recommendations 컬렉션에도 자동 등록 (사용자 앱 노출)
            await window.addDoc(window.collection(window.db, "recommendations"), {
                title: storeName,
                cat: category,
                addr: address,
                desc: `Tel: ${phone}`,
                img: "https://via.placeholder.com/400x250", // 기본 이미지
                status: 'green',
                lat: lat, // 변환된 좌표 사용
                lng: lng,
                providerId: providerRef.id
            });

            // 메뉴 등록 (입력된 경우)
            if (menuName && menuPrice) {
                await window.addDoc(window.collection(window.db, "menus"), {
                    name: { ko: menuName, en: menuName },
                    price: Number(menuPrice),
                    img: "https://via.placeholder.com/150",
                    providerId: providerRef.id // 연결
                });
            }
            alert(`매장 [${storeName}] 및 메뉴 등록 완료!`);
        }
        closePartnerModal();
    } catch (e) {
        console.error(e);
        alert("등록 중 오류가 발생했습니다.");
    }
}

async function deletePartner(partnerId) {
    if (!confirm("정말 이 파트너를 삭제하시겠습니까?\n연결된 메뉴도 모두 삭제됩니다.")) return;
    try {
        await window.deleteDoc(window.doc(window.db, "providers", partnerId));
        // TODO: Delete associated menus
        alert("파트너가 삭제되었습니다.");
    } catch (e) { console.error(e); alert("삭제 실패"); }
}

// --- [기능 3.2] 일괄 등록 (CSV/Excel/XML) ---
function triggerBulkUpload() {
    document.getElementById('bulk-upload').click();
}

async function handleBulkUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = async (e) => { await processCSV(e.target.result); input.value = ''; };
        reader.readAsText(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = async (e) => { await processExcel(e.target.result); input.value = ''; };
        reader.readAsArrayBuffer(file);
    } else if (fileName.endsWith('.xml')) {
        const reader = new FileReader();
        reader.onload = async (e) => { await processXML(e.target.result); input.value = ''; };
        reader.readAsText(file);
    } else {
        alert("지원하지 않는 파일 형식입니다. (.csv, .xlsx, .xls, .xml)");
        input.value = '';
    }
}

async function processCSV(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return alert("데이터가 없거나 헤더만 있습니다.");

    const data = [];
    const rows = lines.slice(1);
    for (const row of rows) {
        const cols = row.split(',').map(c => c.trim());
        if (cols.length >= 4) {
            const [storeName, category, address, phone, menuName, menuPrice] = cols;
            data.push({ storeName, category, address, phone, menuName, menuPrice });
        }
    }
    await processBulkData(data);
}

async function processExcel(buffer) {
    try {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Array of Arrays
        
        if (rows.length < 2) return alert("데이터가 없거나 헤더만 있습니다.");
        
        const data = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length >= 4) {
                data.push({
                    storeName: row[0] || "", category: row[1] || "Food", address: row[2] || "",
                    phone: row[3] || "", menuName: row[4] || "", menuPrice: row[5] || ""
                });
            }
        }
        await processBulkData(data);
    } catch (e) { console.error(e); alert("엑셀 처리 중 오류 발생"); }
}

async function processXML(text) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const partners = xmlDoc.getElementsByTagName("partner");
        if (partners.length === 0) return alert("XML에 partner 데이터가 없습니다.");

        const data = [];
        for (let i = 0; i < partners.length; i++) {
            const p = partners[i];
            const getText = (tag) => p.getElementsByTagName(tag)[0]?.textContent || "";
            data.push({
                storeName: getText("storeName"), category: getText("category") || "Food",
                address: getText("address"), phone: getText("phone"),
                menuName: getText("menuName"), menuPrice: getText("menuPrice")
            });
        }
        await processBulkData(data);
    } catch (e) { console.error(e); alert("XML 처리 중 오류 발생"); }
}

async function processBulkData(dataList) {
    if (dataList.length === 0) return alert("등록할 데이터가 없습니다.");
    if (!confirm(`총 ${dataList.length}개의 업체를 등록하시겠습니까?`)) return;

    let count = 0;
    for (const item of dataList) {
        try {
            const providerRef = await window.addDoc(window.collection(window.db, "providers"), {
                storeName: item.storeName || "Unknown", category: item.category || "Food",
                address: item.address || "", phone: item.phone || "", status: 'active', createdAt: Date.now()
            });

            // [신규] 테스트용: recommendations 컬렉션에도 자동 등록
            await window.addDoc(window.collection(window.db, "recommendations"), {
                title: item.storeName || "Unknown",
                cat: item.category || "Food",
                addr: item.address || "",
                desc: `Tel: ${item.phone}`,
                img: "https://via.placeholder.com/400x250",
                status: 'green',
                lat: 37.5665,
                lng: 126.9780,
                providerId: providerRef.id
            });

            if (item.menuName && item.menuPrice) {
                await window.addDoc(window.collection(window.db, "menus"), {
                    name: { ko: item.menuName, en: item.menuName }, price: Number(item.menuPrice),
                    img: "https://via.placeholder.com/150", providerId: providerRef.id
                });
            }
            count++;
        } catch (e) { console.error("Bulk Insert Error:", item, e); }
    }
    alert(`${count}개 업체 등록 완료!`);
}

// --- 회원(User) 관리 ---
function loadUsers() {
    window.onSnapshot(window.collection(window.db, "users"), (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const container = document.getElementById('user-list');
        if (users.length === 0) {
            container.innerHTML = "<p style='color:#888;'>가입된 회원이 없습니다.</p>";
            return;
        }

        container.innerHTML = users.map(u => `
            <div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold;">${u.email || 'No Email'} ${u.status === 'banned' ? '<span style="color:red; font-size:12px;">(BANNED)</span>' : ''}</div>
                    <div style="font-size:12px; color:#666;">UID: ${u.id}</div>
                </div>
                <div>
                    <button onclick="viewUserHistory('${u.id}', '${u.email}')" style="padding:4px 8px; background:#f1f5f9; border:1px solid #ddd; border-radius:4px; cursor:pointer;">History</button>
                    <button onclick="toggleUserBan('${u.id}', '${u.status}')" style="margin-left:5px; padding:4px 8px; background:${u.status === 'banned' ? '#10b981' : '#ef4444'}; color:white; border:none; border-radius:4px; cursor:pointer;">
                        ${u.status === 'banned' ? 'Unban' : 'Ban'}
                    </button>
                </div>
            </div>
        `).join('');
    });
}

async function toggleUserBan(uid, currentStatus) {
    const newStatus = currentStatus === 'banned' ? 'active' : 'banned';
    if(!confirm(`이 사용자를 ${newStatus === 'banned' ? '차단(Ban)' : '차단 해제'} 하시겠습니까?`)) return;
    await window.setDoc(window.doc(window.db, "users", uid), { status: newStatus }, { merge: true });
}

// --- 히스토리 모달 로직 ---
async function viewUserHistory(uid, email) {
    document.getElementById('history-modal-title').innerText = `History: ${email || 'User'}`;
    document.getElementById('history-modal').style.display = 'flex';
    document.getElementById('history-modal-content').innerHTML = 'Loading...';

    const snapshot = await window.getDocs(window.collection(window.db, "history"));
    const allHistory = snapshot.docs.map(doc => doc.data());
    // userId가 일치하는 것만 필터링
    const userHistory = allHistory.filter(h => h.userId === uid).sort((a,b) => b.created - a.created);

    renderHistoryToModal(userHistory);
}

async function viewProviderHistory(storeName) {
    document.getElementById('history-modal-title').innerText = `History: ${storeName}`;
    document.getElementById('history-modal').style.display = 'flex';
    document.getElementById('history-modal-content').innerHTML = 'Loading...';

    const snapshot = await window.getDocs(window.collection(window.db, "history"));
    const allHistory = snapshot.docs.map(doc => doc.data());
    // storeName이 일치하는 것만 필터링 (간이 방식)
    const providerHistory = allHistory.filter(h => h.storeName && h.storeName.includes(storeName)).sort((a,b) => b.created - a.created);

    renderHistoryToModal(providerHistory);
}

function renderHistoryToModal(list) {
    const container = document.getElementById('history-modal-content');
    if(list.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#888; margin-top:20px;'>기록이 없습니다.</p>";
        return;
    }
    container.innerHTML = list.map(h => `
        <div style="padding:10px; border-bottom:1px solid #eee;">
            <div style="font-weight:bold;">${h.storeName} <span style="float:right;">₩ ${h.paidAmount.toLocaleString()}</span></div>
            <div style="font-size:12px; color:#666;">${h.items}</div>
            <div style="font-size:11px; color:#999;">${new Date(h.created).toLocaleString()}</div>
        </div>
    `).join('');
}

function closeHistoryModal() {
    document.getElementById('history-modal').style.display = 'none';
}

function switchView(viewName) {
    // 모든 뷰 숨김
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    // 선택된 뷰 표시
    document.getElementById(`view-${viewName}`).style.display = 'block';
    
    // 네비게이션 활성화 상태 변경
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${viewName}`).classList.add('active');
}

// 전역 함수 등록
window.adminLogin = adminLogin; window.adminLogout = adminLogout;
window.switchView = switchView;
window.toggleUserBan = toggleUserBan;
// Partner CRUD
window.openPartnerModal = openPartnerModal; window.closePartnerModal = closePartnerModal; window.savePartner = savePartner; window.deletePartner = deletePartner;
// CSV
window.triggerBulkUpload = triggerBulkUpload; window.handleBulkUpload = handleBulkUpload;
window.viewUserHistory = viewUserHistory; window.viewProviderHistory = viewProviderHistory; window.closeHistoryModal = closeHistoryModal;

// [신규] 주소 -> 좌표 변환 함수 (Nominatim API)
async function getCoordsFromAddress(address) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (e) { console.error("Geocoding failed:", e); }
    return null;
}