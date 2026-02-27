# imake 프로젝트 전체 코드 리뷰

**리뷰일:** 2025-02-25  
**범위:** public/ 내 HTML, CSS, JS 전부

---

## 1. 프로젝트 구조 및 로딩 관계

### 1.1 파일 목록 (public/)

| 구분 | 파일 | 용도 |
|------|------|------|
| **사용자 앱** | index.html, script.js, style.css | 메인 앱 (홈/지도/추천/주문/멤버십/로그인 등) |
| **파트너** | provider.html, pscript.js | 파트너(사장님) 대시보드 (주문 접수, 메뉴, 혼잡도) |
| **관리자** | sadmin.html, sscript.js | 슈퍼 관리자 (파트너 승인, 회원, 통계) |
| **스캐너** | scanner.html, scan_script.js | QR 스캔 (멤버십 검증) |
| **기타 페이지** | order.html | 테이블 번호 입력 → menu_list.html 이동 (menu_list.html 없음) |
| **미로딩 JS** | map.js, orders.js, auth.js | **index.html에서 참조 안 함.** 사용자 앱은 script.js만 로드. |
| **기타** | dashboard.html, spot.html, 404.html, app.js, styles.css | 링크/진입 경로 확인 필요 |

### 1.2 HTML별 스크립트 로딩

| HTML | 로드하는 스크립트 |
|------|-------------------|
| index.html | Leaflet, QRCode, Lucide, Firebase(인라인 모듈), **script.js** (단일) |
| provider.html | Lucide, Firebase(인라인), **pscript.js** |
| sadmin.html | SheetJS, Chart.js, Lucide, Firebase(인라인), **sscript.js** |
| scanner.html | html5-qrcode, Firebase(인라인), **scan_script.js** |
| order.html | 인라인 스크립트만 (menu_list.html?table= 으로 이동) |

→ **사용자 앱(index)은 script.js 한 파일에 모든 로직이 있음. map.js, orders.js, auth.js는 이 앱 경로에서는 미사용.**

---

## 2. 사용자 앱 (index.html + script.js)

### 2.1 구조
- **script.js (~1,583줄):** 전역 변수 다수, Firestore 리스너, To-Do/Schedule/Fav/History/추천/지도/카테고리/주문/멤버십/QR/로그인/다국어 일괄 포함.
- **style.css:** CSS 변수(테마), 레이아웃, 모달, 주문/바우처/이벤트 등 공통 스타일.

### 2.2 버그·위험
- **DOM null:** `document.getElementById('page-order-menu').style.display` (script.js) — 요소 없으면 에러. optional chaining 권장.
- **navigateTo 내부:** `document.getElementById('floatBtn').style.display` — floatBtn 없을 수 있으면 null 체크 권장.
- **에러 처리:** `catch (e) { console.error(e); }` 위주, 사용자 메시지 없음.

### 2.3 보안
- **동적 HTML:** recData, menuData, item.title/desc 등을 innerHTML·템플릿 리터럴에 직접 삽입. 사용자 입력이 섞이면 XSS 위험. 이스케이프 또는 textContent/노드 생성 권장.
- **Firebase 설정:** index 인라인 노출 — 클라이언트 앱에서는 일반적이나, Firestore 보안 규칙으로 접근 제어 필수.

### 2.4 기타
- **setInterval(100ms):** window.db/auth 대기. 최대 시도 횟수 없음. 필요 시 제한 또는 Firebase 초기화 이벤트 사용 고려.
- **페이지 표시:** `style.display === 'block'` 하드코딩. 클래스 토글이면 유지보수 용이.

---

## 3. 파트너 (provider.html + pscript.js)

### 3.1 구조
- 로그인/가입신청/승인대기/대시보드 뷰 전환.
- 대시보드: 혼잡도, 실시간 주문, 메뉴 관리, 매장 설정, 정산/히스토리.

### 3.2 이슈
- **provider.html:** `<link rel="stylesheet" href="https://unpkg.com/lucide@latest">` — Lucide는 아이콘 라이브러리라 link가 아니라 script여야 함. (현재 스크립트도 별도 로드됨.)
- **pscript.js:** `window.auth`, `window.db` 100ms 폴링 대기. index와 동일 패턴.
- **알림:** 새 주문 시 `Notification` API 사용. 권한 요청 후 사용하는 구조는 적절함.

---

## 4. 관리자 (sadmin.html + sscript.js)

### 4.1 구조
- admins 컬렉션으로 관리자 여부 확인.
- 대시보드/파트너관리/회원관리 뷰, Chart.js·SheetJS 사용.

### 4.2 이슈
- **초기 관리자:** admins가 비어 있으면 첫 로그인자를 Super Admin으로 등록하는 옵션 있음. 운영 시 의도된 동작인지 확인 필요.
- **sadmin.html:** Lucide를 link로 로드 — 동일하게 script가 맞음.
- **KPI 전일 대비:** `kpi-users-inc`에 랜덤 값 사용. 실제 지표로 교체 필요.

---

## 5. 스캐너 (scanner.html + scan_script.js)

### 5.1 구조
- html5-qrcode로 QR 스캔 → JSON(uid, timestamp) 파싱.
- active_qrs 컬렉션 및 40초 유효시간 검증 후 결과 모달.

### 5.2 이슈
- **showResult:** `msgEl.innerHTML = msg` — msg에 사용자 입력이 들어가면 XSS. 현재는 서버/앱에서 만든 문자열만 넣는 구조면 제한적 위험.
- **Firebase:** scanner만 별도 모듈로 db/doc/getDoc만 window에 노출. 나머지 페이지와 설정 중복.

---

## 6. order.html

- 테이블 번호 입력 후 `menu_list.html?table=번호`로 이동.
- **menu_list.html이 없음** → 404 발생. order.html을 index.html의 주문 플로우로 연결하거나, menu_list.html 구현/경로 수정 필요.

---

## 7. CSS (style.css)

- **:root** 에서 테마 변수 정의. 일관된 색/높이 사용.
- **#map** 이 .map-wrapper 내부와 겹치는 스타일 가능성 (width/margin). 실제 DOM 구조와 맞는지 확인 필요.
- **style.css만** index에서 사용. styles.css는 다른 페이지용인지 정리 필요.

---

## 8. 공통 이슈

| 항목 | 내용 |
|------|------|
| **Firebase 설정** | index, provider, sadmin, scanner에 동일 firebaseConfig 인라인 중복. 한 곳에서 관리하면 배포/변경 시 유리. |
| **인증/DB 대기** | 각 HTML별 100ms setInterval로 window.auth/db 대기. clearInterval만 하고 최대 횟수 없음. |
| **에러 피드백** | 대부분 console만. 사용자용 메시지·토스트 통일 권장. |
| **미사용 파일** | map.js, orders.js, auth.js — index에서 미로딩. 분리하려면 index에 스크립트 태그 추가 필요. |

---

## 9. 요약 표

| 영역 | 상태 | 비고 |
|------|------|------|
| 사용자 앱 로딩 | ✅ | index → script.js 단일 로드 |
| 사용자 앱 DOM | ⚠️ | null 체크·optional chaining 보강 |
| 사용자 앱 보안 | ⚠️ | 동적 HTML 시 이스케이프 권장 |
| 파트너/관리자 | ⚠️ | Lucide link 오류, KPI mock 등 |
| 스캐너 | ✅ | 로직·검증 명확 |
| order.html | ❌ | menu_list.html 없음 → 404 |
| 미로딩 JS | ℹ️ | map/orders/auth.js는 index에서 미사용 |
| Firebase/설정 | ⚠️ | 설정 중복, 보안 규칙 확인 필요 |

---

**이 문서는 코드 수정 없이 진단만 반영한 전체 리뷰입니다.**
