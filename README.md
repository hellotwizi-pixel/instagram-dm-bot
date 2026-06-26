# 📱 인스타그램 댓글 → DM 자동발송 봇

인스타그램 게시물의 **특정 키워드를 포함한 댓글**을 자동 감지하여, 댓글 작성자에게 **비공개 DM으로 노션 링크나 PDF 파일을 자동 전송**하는 봇입니다. ManyChat의 "댓글 트리거 → DM" 기능을 무료로 자체 구축한 솔루션입니다.

## ✨ 주요 특징

- ✅ **Google Sheets 키워드 관리** ⭐: 코드 수정 없이 시트에서 즉시 변경 (5초 내 반영)
- ✅ **키워드 기반 자동 감지**: 매 게시물마다 다른 키워드 설정 가능
- ✅ **DM 자동 발송**: Instagram Graph API의 `private_replies` 엔드포인트로 비공개 메시지 전송
- ✅ **완전 무료**: Vercel 호스팅 + Meta for Developers 앱 (가격 무료)
- ✅ **배포 간편**: Vercel 한 번 클릭으로 배포, GitHub 연동 지원
- ✅ **TypeScript**: 완전한 타입 안전성
- ✅ **테스트 포함**: Vitest 단위 테스트로 로직 검증 (14개 테스트 모두 통과 ✅)

## 🚀 빠른 시작

### 사전 요구사항

1. **GitHub 계정** + **Vercel 계정** (무료)
2. **Meta for Developers 계정** (무료)
3. **Instagram 비즈니스 계정** (개인 계정을 비즈니스로 변환 가능)
4. **Facebook 페이지** (Instagram 비즈니스 계정과 연동 필요)

### 단계 1: Meta 앱 생성 및 권한 설정

#### 1-1. Meta for Developers 앱 생성
1. [Meta for Developers](https://developers.facebook.com) 방문
2. **내 앱** → **앱 만들기** 클릭
3. **앱 유형**: "비즈니스" 선택
4. **앱 이름**: "Instagram DM Bot" (원하는 이름)
5. **앱 ID** 및 **앱 비밀번호** 메모해두기

#### 1-2. Instagram Graph API 권한 설정
1. 앱의 **설정** → **기본 설정**에서 **앱 비밀번호** 확인
2. **제품** → **+ 제품 추가** → **Instagram Graph API** 검색 후 추가
3. **Instagram Graph API** 설정 페이지에서:
   - **Instagram 계정** 연결 (비즈니스 계정)
   - **페이지 액세스 토큰** 생성
4. **필요한 권한 요청**:
   - `instagram_basic` (기본)
   - `instagram_manage_comments` (댓글 접근)
   - `pages_messaging` (DM 발송)

#### 1-3. 페이지 액세스 토큰 생성
1. **설정** → **기본 설정** → **페이지 액세스 토큰** 섹션
2. Instagram 비즈니스 계정이 연결된 **Facebook 페이지** 선택
3. **토큰 생성** 클릭
4. 생성된 **장기 액세스 토큰** 복사해두기 (이것이 `IG_PAGE_ACCESS_TOKEN`)

#### 1-4. 웹훅 verify token 설정
1. 아무 영숫자 조합으로 verify token 만들기 (예: `my_webhook_verify_2024`)
2. 이것이 `IG_VERIFY_TOKEN`

### 단계 2: 로컬 테스트 (선택사항)

저장소를 clone하고 로컬에서 테스트:

```bash
# 저장소 clone
git clone <your-repo-url>
cd instagram-dm-bot

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env.local
# .env.local 파일 편집:
# IG_PAGE_ACCESS_TOKEN=<Meta에서 생성한 토큰>
# IG_VERIFY_TOKEN=<원하는 verify token>

# 단위 테스트 실행 (환경변수 필요 없음)
npm test

# 로컬 개발 서버 실행 (Vercel CLI 필요)
vercel dev
```

테스트 웹훅 payload 전송:
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "test",
      "time": '$(date +%s)',
      "changes": [{
        "value": {
          "id": "17999999999999",
          "text": "가격이 얼마예요?",
          "from": {
            "username": "test_user",
            "id": "12345"
          }
        },
        "field": "comments"
      }]
    }]
  }'
```

### 단계 3: Vercel 배포

#### 3-1. GitHub에 코드 푸시
```bash
git add .
git commit -m "초기 인스타그램 봇 배포"
git push origin main
```

#### 3-2. Vercel에서 배포
1. [Vercel](https://vercel.com) 로그인
2. **새 프로젝트** → GitHub 저장소 선택 (`instagram-dm-bot` 폴더 선택)
3. **환경 변수** 설정:
   - `IG_PAGE_ACCESS_TOKEN`: Meta에서 생성한 페이지 액세스 토큰
   - `IG_VERIFY_TOKEN`: 위에서 설정한 verify token
   - `GOOGLE_SHEETS_ID` (선택): Google Sheets ID (아래 "단계 5: Google Sheets 설정" 참고)
4. **배포** 클릭
5. Vercel이 제공하는 **배포 URL** 복사 (예: `https://instagram-dm-bot.vercel.app`)

### 단계 4: Instagram 웹훅 등록

1. [Meta for Developers](https://developers.facebook.com) → 앱 → **설정** → **기본 설정**
2. **Webhooks** 또는 **Messenger Webhooks** 섹션:
   - **콜백 URL**: `https://instagram-dm-bot.vercel.app/api/webhook`
   - **Verify Token**: `.env`에서 설정한 `IG_VERIFY_TOKEN`
   - **구독 필드**: `comments`
3. **저장** 또는 **검증** 클릭

### 단계 5: Google Sheets 키워드 설정 (추천) ⭐

**Google Sheets를 사용하면 코드 수정 없이 키워드를 즉시 변경할 수 있습니다!**

#### 5-1. Google Sheets 생성
1. [Google Sheets](https://sheets.google.com) 접속
2. **새 스프레드시트** 클릭
3. 제목: "Instagram Bot Keywords"
4. 다음과 같이 시트 구성:

| keywords | replyText | url |
|----------|-----------|-----|
| 가격,비용,얼마 | 가격 정보를 원하시는군요! 아래 링크에서 확인하세요. | https://www.notion.so/pricing |
| 구독,가입,신청 | 구독 방법은 다음 링크에서 확인할 수 있습니다. | https://www.notion.so/subscribe |
| PDF,자료,문서 | 요청하신 자료입니다. 아래 링크에서 다운로드하세요. | https://example.com/files/document.pdf |

**중요:**
- **헤더**: 정확히 `keywords`, `replyText`, `url`로 입력 (대소문자 상관없음)
- **keywords**: 쉼표로 구분된 여러 단어 (예: `가격,비용,얼마`)
- 첫 번째 행은 헤더, 두 번째 행부터 데이터

#### 5-2. Google Sheets 공개 설정
1. 우상단 **공유** 클릭
2. **일반 액세스**: "링크가 있는 모든 사용자" → "뷰어"
3. 시트 URL 복사:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
   ```
   이 URL에서 `d/` 다음부터 `/edit` 전까지의 **긴 문자열**이 `GOOGLE_SHEETS_ID`입니다.
   
   예: `https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit`
   → `GOOGLE_SHEETS_ID = 1a2b3c4d5e6f7g8h9i0j`

#### 5-3. Vercel에 환경변수 설정
1. Vercel 프로젝트 → **설정** → **환경 변수**
2. **새 변수 추가**:
   - **이름**: `GOOGLE_SHEETS_ID`
   - **값**: 위에서 복사한 Sheet ID
3. **저장** 클릭

이제 끝! 🎉 Google Sheets의 키워드를 수정하면 **5초 내에 자동 적용**됩니다.

#### 5-4. JSON 파일로도 관리 가능 (선택사항)

Google Sheets를 설정하지 않으면 `src/config/keywords.json`을 사용합니다:

```json
[
  {
    "keywords": ["가격", "비용", "얼마"],
    "replyText": "가격 정보를 원하시는군요! 아래 링크에서 확인하세요.",
    "url": "https://www.notion.so/pricing"
  },
  {
    "keywords": ["구독", "가입", "신청"],
    "replyText": "구독 방법은 다음 링크에서 확인할 수 있습니다.",
    "url": "https://www.notion.so/subscribe"
  }
]
```

JSON 사용 시 변경 후 Vercel에 재배포:
```bash
git add src/config/keywords.json
git commit -m "키워드 규칙 업데이트"
git push origin main
```

## 🧪 테스트

### 단위 테스트 실행
```bash
npm test
```

### 로컬 환경 테스트 (Vercel CLI)
```bash
vercel dev
```

### 실제 인스타그램 테스트

1. 봇이 배포된 후 웹훅 등록 완료
2. Instagram 게시물에 키워드가 포함된 댓글 작성
3. **몇 초 후** 비공개 DM으로 자동 응답 수신
4. **만약 응답이 없다면**:
   - Vercel 대시보드의 **Logs** 탭 확인
   - Meta 앱 대시보드의 **Webhooks** 로그 확인
   - `IG_PAGE_ACCESS_TOKEN` 및 웹훅 구독 필드(`comments`) 확인

## 🏗️ 프로젝트 구조

```
instagram-dm-bot/
├── api/
│   └── webhook.ts                     # Vercel 함수 진입점
├── src/
│   ├── config/
│   │   └── keywords.json              # 키워드 규칙 (JSON 폴백)
│   ├── services/
│   │   ├── googleSheetsLoader.ts      # Google Sheets API (신규)
│   │   ├── instagramApi.ts            # Graph API 호출
│   │   └── keywordMatcher.ts          # 키워드 매칭 로직
│   ├── types.ts                       # TypeScript 타입
│   └── __tests__/
│       ├── keywordMatcher.test.ts     # 단위 테스트
│       └── googleSheetsLoader.test.ts # Google Sheets 테스트 (신규)
├── package.json
├── tsconfig.json
├── vercel.json                        # Vercel 설정
├── .env.example                       # 환경변수 예시
└── README.md                           # 이 파일
```

## 🔐 보안 주의사항

- **`IG_PAGE_ACCESS_TOKEN`을 절대 공개하지 마세요** (GitHub 커밋 금지)
- `.env` 파일은 버전 관리에서 제외됨 (`.gitignore`에 이미 포함)
- Vercel 프로젝트의 환경변수는 암호화되어 저장됨
- 토큰 재발급이 필요한 경우: Meta 대시보드 → 설정 → 새 토큰 생성

## 📋 FAQ

### Q: Google Sheets 키워드가 언제 적용되나요?
**A:** 시트를 수정하면 **5초 이내에 자동 적용**됩니다. (캐싱 메커니즘 덕분) 배포나 코드 수정이 전혀 필요 없습니다.

### Q: 매 게시물마다 키워드를 다르게 설정할 수 있나요?
**A:** 네! 이것이 Google Sheets 연동의 장점입니다. 새 게시물을 올리기 전에 Google Sheets의 키워드만 수정하면 끝입니다. 배포 불필요.

### Q: Google Sheets를 설정하지 않으면 어떻게 되나요?
**A:** `src/config/keywords.json`을 사용합니다 (JSON으로 폴백). 이 경우 변경 후 GitHub에 푸시하고 Vercel 재배포가 필요합니다 (1-2분 소요).

### Q: Google Sheets를 공개해야 하나요? 보안은?
**A:** Google Sheets는 "뷰어" 권한으로 공개하면 됩니다. 누군가 읽을 수는 있지만, **수정은 불가능**합니다. 민감한 URL(비공개 링크)은 Google Sheets에 저장하지 않는 것을 권장합니다.

### Q: 댓글 달린 직후 몇 초 안에 DM이 와야 하나요?
**A:** Meta의 webhook 처리 시간에 따라 1~10초 정도 걸립니다. 최대 몇 분까지 걸릴 수도 있습니다.

### Q: 여러 키워드가 매칭되면 어떻게 되나요?
**A:** Google Sheets (또는 `keywords.json`)에 먼저 작성된 규칙이 우선적으로 매칭되고 응답됩니다.

### Q: PDF를 Instagram DM으로 직접 첨부할 수 있나요?
**A:** 아니요. Instagram DM은 네이티브 파일 첨부를 지원하지 않습니다. PDF는 **다운로드 URL** 형태로 메시지에 포함되어 전송됩니다 (ManyChat도 동일).

### Q: 앱을 심사 없이 자신의 계정에만 사용할 수 있나요?
**A:** 네. Meta 앱이 **개발 모드**일 때는 앱 소유자와 테스트 계정에만 권한이 작동합니다. 다른 사람의 계정에도 운영하려면 앱 심사를 통과해야 합니다.

### Q: 비용이 발생하나요?
**A:**
- **Vercel**: Hobby 플랜 (무료) — 매월 충분한 요청 수 포함
- **Meta**: 완전 무료 (API 호출 비용 없음)
- **Google Sheets**: 완전 무료
- **총 비용**: 0원 (도메인 커스텀 필요 시 별도 비용)

### Q: 개인 계정(비즈니스 아님)에서도 되나요?
**A:** 아니요. Instagram Graph API는 **비즈니스 또는 크리에이터 계정**이 필요합니다. 개인 계정을 비즈니스로 변환해야 합니다.

## 🛠️ 트러블슈팅

### 웹훅 등록이 안 될 때
1. **Verify Token 확인**: Vercel의 환경변수와 Meta 대시보드의 token이 정확히 일치하는지 확인
2. **배포 완료 확인**: `vercel deploy`로 최신 코드가 배포됐는지 확인
3. **콜백 URL 확인**: `https://your-vercel-domain/api/webhook` 형식 정확성 확인
4. **Meta 대시보드 로그**: Webhooks 섹션의 로그에서 실패 원인 확인

### DM이 도착하지 않을 때
1. **로그 확인**: Vercel 대시보드 → 해당 프로젝트 → **Logs** 탭
2. **access token 확인**: 토큰이 유효한지, 만료되지 않았는지 확인
3. **권한 확인**: Meta 앱에서 `instagram_manage_comments`, `pages_messaging` 권한 요청 완료 확인
4. **키워드 규칙 확인**: 댓글 텍스트가 `keywords.json`의 키워드와 정확히 매칭되는지 확인 (대소문자 무관)

### 로컬 테스트가 안 될 때
```bash
# Vercel CLI 설치
npm i -g vercel

# 로그인
vercel login

# 로컬 개발 서버 실행
vercel dev
```

## 📞 지원

문제 발생 시:
1. [Vercel 문서](https://vercel.com/docs)
2. [Meta for Developers 문서](https://developers.facebook.com/docs)
3. [Instagram Graph API 문서](https://developers.facebook.com/docs/instagram-api)

---

**Happy automating! 🚀**
