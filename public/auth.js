/* ==========================================================
   [멤버십 / QR / 인증 / 다국어]
   ========================================================== */

// 멤버십 상태 확인
async function checkMembershipStatus(uid) {
    try {
        const userDocRef = window.doc(window.db, "users", uid);
        const userDoc = await window.getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const data = userDoc.data();

            userPreferences = {
                activity: data.activity,
                food: data.food,
                country: data.country
            };
            let membership = data.membership;
            
            if (!membership) {
                membership = 'free_trial';
                const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
                await window.updateDoc(userDocRef, { 
                    membership: 'free_trial',
                    freeTrialExpiresAt: expiresAt
                });
                data.membership = 'free_trial';
                data.freeTrialExpiresAt = expiresAt;
                alert("🎉 가입 축하 선물!\n24시간 동안 유료 멤버십 혜택이 무료로 제공됩니다.");
            }

            isTrialActive = false;
            if (membership === 'paid') {
                userMembershipType = 'paid';
            } else if (membership === 'free_trial') {
                if (data.freeTrialExpiresAt > Date.now()) {
                    userMembershipType = 'paid';
                    isTrialActive = true;
                    console.log("🎁 1-Day Free 적용 중");
                } else {
                    await window.updateDoc(userDocRef, { membership: 'free' });
                    userMembershipType = 'free';
                    alert("1-Day Free 체험이 종료되었습니다.\n계속 혜택을 받으려면 멤버십을 구독하세요.");
                }
            } else {
                userMembershipType = 'free';
            }

            if (!data.onboardingCompleted && document.getElementById('page-home').style.display === 'block') {
                setTimeout(() => openModal('modal-onboarding-reminder'), 1500);
            }
        }

        applyUserPreferences();
        renderOrderMenu();
        updateQRModalUI();
    } catch (e) {
        console.error("멤버십 확인 실패:", e);
    }
}

// 결제 시뮬레이션
async function simulatePayment() {
    const user = window.auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");

    if (!confirm("30,000원을 결제하시겠습니까? (테스트)")) return;

    try {
        await window.setDoc(window.doc(window.db, "users", user.uid), {
            membership: 'paid',
            updatedAt: Date.now(),
            email: user.email
        }, { merge: true });

        alert("결제가 완료되었습니다! 🎉\n이제 QR 코드가 활성화됩니다.");
        checkMembershipStatus(user.uid);
    } catch (e) {
        console.error(e);
        alert("결제 처리 중 오류가 발생했습니다.");
    }
}

// QR 코드
let qrTimerInterval = null;

async function generateQRCode() {
    const user = window.auth.currentUser;
    const qrContainer = document.getElementById('qr-code-view');
    const timeDisplay = document.getElementById('qr-time-display');
    const timerDisplay = document.getElementById('qr-timer-display');
    
    if (!user || !qrContainer) return;

    if (userMembershipType !== 'paid') {
        if (timeDisplay) timeDisplay.innerText = "";
        if (timerDisplay) timerDisplay.innerText = "";
        return;
    }

    const now = new Date();
    const timestamp = now.getTime();
    const qrData = JSON.stringify({
        uid: user.uid,
        email: user.email,
        timestamp: timestamp
    });

    qrContainer.innerHTML = "";
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
    
    qrContainer.style.filter = 'none';
    qrContainer.style.opacity = '1';
    if (timeDisplay) timeDisplay.innerText = now.toLocaleString();

    if (qrTimerInterval) clearInterval(qrTimerInterval);
    let timeLeft = 40;
    
    const updateTimer = () => {
        if (timerDisplay) {
            timerDisplay.innerText = `${timeLeft}s`;
            timerDisplay.style.color = timeLeft <= 10 ? '#ef4444' : '#10b981';
        }
    };
    updateTimer();

    qrTimerInterval = setInterval(() => {
        timeLeft--;
        updateTimer();
        if (timeLeft <= 0) {
            clearInterval(qrTimerInterval);
            if (timerDisplay) timerDisplay.innerText = "Expired";
            qrContainer.style.filter = 'blur(15px)';
            qrContainer.style.opacity = '0.2';
        }
    }, 1000);

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
    if (!qrView || !payArea || !statusMsg) return;

    if (userMembershipType === 'paid') {
        qrView.style.filter = 'none';
        qrView.style.opacity = '1';
        payArea.style.display = 'none';
        statusMsg.innerHTML = isTrialActive 
            ? '<span style="color:#3b82f6; font-weight:bold;">1-Day Free Pass</span> (체험 중)' 
            : '<span style="color:#10b981; font-weight:bold;">Active Pass</span> (유효함)';
    } else {
        qrView.style.filter = 'blur(8px)';
        qrView.style.opacity = '0.5';
        payArea.style.display = 'block';
        statusMsg.innerHTML = '<span style="color:#ef4444; font-weight:bold;">Inactive</span> (결제 필요)';
    }
}

// 인증 / 로그인
async function loginWithGoogle() {
    const provider = new window.GoogleAuthProvider();
    try {
        const result = await window.signInWithPopup(window.auth, provider);
        const user = result.user;
        console.log("✅ 로그인 성공:", user.displayName);
        alert(`${user.displayName}님, 환영합니다!`);
        navigateTo('home');
    } catch (error) {
        console.error("❌ 로그인 실패:", error.message);
        alert("로그인에 실패했습니다: " + error.message);
    }
}

async function handleLogout() {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    try {
        await window.signOut(window.auth);
        alert("로그아웃 되었습니다.");
        navigateTo('home');
    } catch (error) {
        console.error("로그아웃 에러:", error);
    }
}

function initAuthListener() {
    window.onAuthStateChanged(window.auth, async (user) => {
        const userNameElem = document.getElementById('display-user-name');
        const userStatusElem = document.querySelector('.user-status');
        const userProfileDiv = document.querySelector('.user-profile');

        if (user) {
            if (userNameElem) userNameElem.innerText = user.displayName;
            if (userStatusElem) userStatusElem.innerText = user.email;
            if (userProfileDiv) userProfileDiv.setAttribute('onclick', "navigateTo('profile')");
            
            await window.setDoc(window.doc(window.db, "users", user.uid), {
                email: user.email,
                displayName: user.displayName,
                lastLogin: Date.now()
            }, { merge: true });

            checkMembershipStatus(user.uid);
            console.log("현재 유저:", user.displayName);
        } else {
            if (userNameElem) userNameElem.innerText = "Guest Traveler";
            if (userStatusElem) userStatusElem.innerText = "Tap to login";
            if (userProfileDiv) userProfileDiv.setAttribute('onclick', "navigateTo('login')");
            
            userMembershipType = 'free';
            isTrialActive = false;
            userPreferences = {};
            
            // [신규] 로그아웃 시 개인 데이터 싹 비우기
            window.todoList = [];
            window.favList = [];
            window.schedList = [];
            window.historyList = [];
            window.cart = {};
            window.confirmedOrders = [];
            window.currentTable = "";

            // [신규] 바우처 목록 초기화 (UI에서 숨김 처리)
            const voucherList = document.querySelector('.voucher-list');
            if (voucherList) voucherList.innerHTML = '<p style="text-align:center; color:#888; margin-top:20px;">로그인이 필요합니다.</p>';


            // [신규] 화면에 보이는 숫자(카운트)도 0으로 갱신
            if (typeof updateCounts === 'function') updateCounts();
            
            if (document.getElementById('page-home').style.display === 'block') filterCategory('all');

            renderOrderMenu();
            console.log("🚪 로그아웃 상태");
        }
    });
}

// 다국어
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

let currentLang = 'en';

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

// 이메일 로그인/회원가입/온보딩
async function handleEmailLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) return alert("이메일과 비밀번호를 입력해주세요.");
    
    try {
        await window.signInWithEmailAndPassword(window.auth, email, password);
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

    if (!name || !email || !password || !confirmPassword) return alert("모든 정보를 입력해주세요.");
    if (password !== confirmPassword) return alert("비밀번호가 일치하지 않습니다.");

    try {
        const result = await window.createUserWithEmailAndPassword(window.auth, email, password);
        const user = result.user;
        await window.updateProfile(user, { displayName: name });
        alert("회원가입이 완료되었습니다! 추가 정보를 입력해주세요.");
        navigateTo('onboarding');
    } catch (e) {
        console.error(e);
        alert("회원가입 실패: " + e.message);
    }
}

function applyUserPreferences() {
    if (document.getElementById('page-home').style.display !== 'block') return;

    const activity = userPreferences.activity;
    let category = 'all';

    if (activity) {
        switch (activity) {
            case 'Shopping':    category = 'store'; break;
            case 'Food Tour':   category = 'food'; break;
            case 'Sightseeing': category = 'activity'; break;
            case 'Activity':    category = 'activity'; break;
            default:            category = 'all';
        }
        console.log(`👤 선호도(${activity})에 따라 '${category}' 카테고리를 표시합니다.`);
    }
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
