let html5QrcodeScanner;

window.onload = function() {
    // Firebase 로드 대기 후 스캐너 시작
    const checkInterval = setInterval(() => {
        if (window.db) {
            clearInterval(checkInterval);
            startScanner();
        }
    }, 100);
};

function startScanner() {
    // QR 스캐너 초기화 (화면 크기에 맞춰 박스 크기 조절)
    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader", { fps: 10, qrbox: { width: 250, height: 250 } }, /* verbose= */ false);
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

async function onScanSuccess(decodedText, decodedResult) {
    // 스캔 성공 시 카메라 중지 (중복 처리 방지)
    html5QrcodeScanner.clear();

    try {
        const data = JSON.parse(decodedText);
        if (!data.uid || !data.timestamp) throw new Error("Invalid QR Format");

        // 1. 서버(DB) 검증: active_qrs 컬렉션 조회
        const docRef = window.doc(window.db, "active_qrs", data.uid);
        const docSnap = await window.getDoc(docRef);

        if (!docSnap.exists()) {
            showResult(false, "유효하지 않은 QR", "서버에 등록되지 않은 QR코드입니다.<br>(새로고침 후 다시 시도해주세요)");
            return;
        }

        const serverData = docSnap.data();
        const serverTime = serverData.generatedAt;
        const now = Date.now();
        const elapsed = now - serverTime;

        // 2. 유효시간(40초) 체크 (서버 기록 기준)
        if (elapsed > 40000) { // 40초 = 40000ms
            showResult(false, "만료된 QR코드", "유효시간(40초)이 지났습니다.<br>고객님께 새로고침을 요청하세요.");
        } else {
            // 3. 성공 (유효한 멤버십)
            showResult(true, "인증 성공!", `<b>${serverData.email || 'User'}</b>님<br>유효한 멤버십 회원입니다.`);
        }

    } catch (e) {
        console.error(e);
        showResult(false, "인식 실패", "올바르지 않은 형식의 QR코드입니다.");
    }
}

function onScanFailure(error) {
    // 스캔 중 에러는 무시 (계속 스캔 시도)
}

function showResult(isSuccess, title, msg) {
    const modal = document.getElementById('result-modal');
    const icon = document.getElementById('res-icon');
    const titleEl = document.getElementById('res-title');
    const msgEl = document.getElementById('res-msg');

    modal.style.display = 'flex';
    if (isSuccess) {
        icon.innerHTML = '✅';
        titleEl.style.color = '#10b981';
    } else {
        icon.innerHTML = '🚫';
        titleEl.style.color = '#ef4444';
    }
    titleEl.innerText = title;
    msgEl.innerHTML = msg;
}

function resetScanner() {
    document.getElementById('result-modal').style.display = 'none';
    startScanner(); // 스캐너 재시작
}

window.resetScanner = resetScanner;