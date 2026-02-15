# imake prototype (Flutter patch)

## 적용 방식(권장)
1) 새 프로젝트 생성
```bash
flutter create imake_proto
cd imake_proto
```

2) 이 패치의 `lib/main.dart`로 교체

3) `pubspec.yaml`의 dependencies 반영 후
```bash
flutter pub get
```

4) 실행
```bash
flutter run
```

## 포함 기능(현재까지 상태)
- 고정 Header(로고/QR/언어/메뉴)
- HELP 슬라이드(닫힘: 헤더 경계 탭만 노출 / 열림: dim + 바깥 클릭 닫기 + 스크롤락)
- Home: ToDo/Favorites/Schedule 카운트 + 모달
- ToDo: 추가/편집/삭제/완료체크 + (정책) 날짜가 오늘이면 자동으로 Today Schedule로 이동
- Favorites: 편집(날짜+시간), 삭제
- Schedule: 추가/편집/삭제/완료체크(지나간 시간 흐림 표시)
- Bottom Nav: stub pages (Map/MyFit/History/My)

## 지도 연동(다음 단계)
Favorites/Schedule은 항상 지도 레이어로 표시하도록 placeId/lat/lng 필드를 이미 모델에 포함해 두었습니다.
