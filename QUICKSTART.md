# 🚀 인스타그램 DM 봇 - 빠른 시작 가이드

이 가이드는 **5분 안에** 봇을 배포하는 최소한의 단계만 담았습니다.

## 1️⃣ Meta 앱 생성 (3분)

1. [developers.facebook.com](https://developers.facebook.com) 접속
2. **내 앱** → **앱 만들기** → 타입 "비즈니스" 선택
3. 앱 설정 → **제품** → Instagram Graph API 추가
4. Instagram 비즈니스 계정 연결
5. **설정** → **기본 설정**에서 **페이지 액세스 토큰** 복사
   ```
   이것이 IG_PAGE_ACCESS_TOKEN
   ```

## 2️⃣ Verify Token 생성 (1분)

영숫자로 아무거나: `my_verify_123` (이것이 `IG_VERIFY_TOKEN`)

## 3️⃣ Vercel 배포 (1분)

### 3-1. GitHub에 푸시
```bash
cd instagram-dm-bot
git add .
git commit -m "초기 배포"
git push origin main
```

### 3-2. Vercel 배포
1. [vercel.com](https://vercel.com) → **새 프로젝트**
2. GitHub 저장소 선택
3. **환경 변수** 추가:
   - `IG_PAGE_ACCESS_TOKEN`: Meta에서 복사한 값
   - `IG_VERIFY_TOKEN`: 위에서 정한 값
4. **배포** 클릭
5. Vercel URL 복사: `https://xxx.vercel.app`

## 4️⃣ 웹훅 등록 (1분)

1. Meta 앱 → **설정** → **Webhooks** (또는 **Messenger Webhooks**)
2. **콜백 URL**: `https://xxx.vercel.app/api/webhook`
3. **Verify Token**: 위에서 정한 verify token
4. **구독 필드**: `comments` 체크
5. **저장** 또는 **검증** 클릭 ✅

## 5️⃣ Google Sheets 키워드 설정 (추천) ⭐

배포 없이 즉시 변경 가능!

### 5-1. Google Sheets 생성
1. [Google Sheets](https://sheets.google.com) → **새 스프레드시트**
2. 헤더: `keywords` | `replyText` | `url`
3. 데이터 행:
   ```
   가격,비용,얼마 | 가격 정보입니다! | https://www.notion.so/pricing
   ```
4. 우상단 **공유** → "링크가 있는 모든 사용자" → "뷰어"

### 5-2. Sheet ID 추출
URL에서 `d/` 다음 부분:
```
https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit
                                      ↑ 이 부분이 GOOGLE_SHEETS_ID
```

### 5-3. Vercel 환경변수
1. Vercel 프로젝트 → **설정** → **환경 변수**
2. `GOOGLE_SHEETS_ID` = 위의 ID
3. **저장** ✅

**완료!** Google Sheets를 수정하면 5초 내 적용됩니다.

---

## 🧪 로컬 테스트 (선택사항)

```bash
npm install
npm test            # 단위 테스트
npm run build       # TypeScript 컴파일
```

## 🎯 테스트

1. Instagram 게시물에 "가격" 댓글 달기
2. 몇 초 후 비공개 DM 수신 확인
3. **만약 안 오면**: Vercel **Logs** 탭 확인

---

**더 자세한 내용은 [README.md](./README.md) 참고**
