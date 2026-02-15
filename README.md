# imake UI Prototype (Firebase Hosting)

## Quick Start
1) Copy `public/` and `firebase.json` into your Firebase Hosting project.
2) Deploy:

```bash
firebase deploy
```

## QR Landing 테스트
- 입구 QR(오프라인):
  - 웹(미설치자): `/?mode=entrance&pid=STORE001&app=0`
  - 앱(설치자): `/?mode=entrance&pid=STORE001&app=1`

- 매장 QR 메뉴판:
  - 웹(미설치자): `/?mode=menu&pid=STORE001&app=0`
  - 앱(설치자): `/?mode=menu&pid=STORE001&app=1`

## Notes
- 결제/QR 그룹/대사관/날씨 서버 캐시는 스텁입니다.
- 다음 단계에서 Cloud Functions + Firestore로 날씨 10분 캐시, QR 그룹 토큰, 결제 콜백을 붙이면 요구사항에 가까워집니다.

## v14 (App-only)
- 랜딩/QR 진입(mode, pid, app) 라우팅을 비활성화했습니다.
- 모든 진입은 홈 SPA로 통일됩니다.
