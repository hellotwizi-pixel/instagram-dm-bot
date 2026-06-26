# 인스타그램 댓글 → DM 자동발송 봇 | 전체 개발 청사진

## 📊 전체 진행 상황

| Phase | 단계명 | 상태 | 진행률 |
|-------|--------|------|--------|
| **1** | 🎯 기획 & 설계 | ✅ 완료 | 100% |
| **2** | 💻 로컬 개발 & 구현 | ✅ 완료 | 100% |
| **3** | 🚀 GitHub & Vercel 배포 | 🔄 진행 중 | 30% |
| **4** | 🔗 Meta 앱 연결 & 웹훅 등록 | ⏳ 대기 | 0% |
| **5** | 🧪 실제 테스트 & 운영 | ⏳ 대기 | 0% |

---

# 📍 Phase 1: 기획 & 설계 ✅ 완료

## 🎯 요구사항 분석

**사용자 니즈:**
- Instagram 게시물의 댓글을 자동으로 감지
- 특정 키워드가 포함된 댓글 감지
- 댓글 작성자에게 자동으로 DM 발송 (노션 링크, PDF 파일 등)
- **ManyChat의 "댓글 트리거 → DM 자동응답"과 동일한 기능**

**핵심 제약사항:**
- 무료로 구축 가능해야 함
- 댓글 답글이 아닌 **DM 전용 발송**
- 키워드 기반 매칭
- 대규모 트래픽 불필요 (소규모 운영)

---

## 🏗️ 아키텍처 설계

### **핵심 기술 결정**

| 요소 | 선택 | 이유 |
|------|------|------|
| **DM 발송 API** | `POST /{comment_id}/private_replies` | Instagram Graph API의 정식 댓글 비공개 답장 엔드포인트 (ManyChat과 동일) |
| **호스팅** | Vercel 서버리스 (무료) | 웹훅 수신에 최적, 항상 켜있을 필요 없음 |
| **키워드 저장소** | JSON 파일 + Google Sheets 옵션 | DB 비용 제로, 배포 없이 즉시 수정 가능 |
| **PDF 제공** | 공개 URL 다운로드 링크 | Instagram DM은 파일 첨부 미지원 |

### **데이터 흐름**

```
인스타그램 댓글 달기
        ↓
Meta 웹훅 → Vercel 함수 수신
        ↓
댓글 텍스트 추출 & 키워드 매칭
        ↓
매칭 규칙 찾기
        ↓
Instagram Graph API → private_replies 호출
        ↓
댓글 작성자 DM으로 자동 발송 ✅
```

---

## 📁 프로젝트 구조 설계

```
instagram-dm-bot/
├── api/
│   └── webhook.ts              # Vercel 서버리스 함수 (GET 검증 + POST 처리)
├── src/
│   ├── services/
│   │   ├── instagramApi.ts      # Graph API 호출 (private_replies)
│   │   ├── keywordMatcher.ts    # 댓글 텍스트 ↔ 키워드 매칭
│   │   └── googleSheetsLoader.ts # Google Sheets 연동 (선택)
│   ├── config/
│   │   └── keywords.json         # 키워드 & 응답 규칙 저장소
│   ├── types.ts                  # TypeScript 타입 정의
│   └── __tests__/
│       └── googleSheetsLoader.test.ts # 테스트
├── public/
│   └── pdfs/                     # 정적 PDF 파일 (Vercel 자동 공개)
├── .env.example                  # 환경변수 템플릿
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

---

# 💻 Phase 2: 로컬 개발 & 구현 ✅ 완료

## ✅ 구현 완료 사항

### **1️⃣ 웹훅 수신 처리** (`api/webhook.ts`)
- ✅ GET 요청: `hub.verify_token` 검증 (Meta 웹훅 등록용)
- ✅ POST 요청: 댓글 이벤트 payload 파싱
- ✅ 환경변수에서 토큰 읽기
- ✅ 에러 처리 및 로깅

### **2️⃣ 키워드 매칭 로직** (`src/services/keywordMatcher.ts`)
- ✅ 댓글 텍스트에서 키워드 검색 (대소문자 무시, 부분 일치)
- ✅ 첫 매칭 규칙 반환
- ✅ 매칭 실패 시 무시
- ✅ 단위 테스트 작성 (vitest)

### **3️⃣ Instagram Graph API 호출** (`src/services/instagramApi.ts`)
- ✅ `POST /{comment_id}/private_replies` 엔드포인트 호출
- ✅ 액세스 토큰 유효성 검증
- ✅ 응답 처리 및 에러 로깅
- ✅ 타입스크립트 타입 정의

### **4️⃣ Google Sheets 연동** (선택사항)
- ✅ Google Sheets에서 키워드 동적 로드
- ✅ JSON 폴백 자동 적용
- ✅ 캐싱으로 성능 최적화

### **5️⃣ 설정 & 타입**
- ✅ `keywords.json` 예시 데이터 포함
- ✅ TypeScript 타입 정의 (`InstagramWebhookPayload`, `KeywordRule` 등)
- ✅ 환경변수 템플릿 (`.env.example`)

---

## 📊 현재 코드 통계

```
✅ Total: 12 files, 438 lines of code
- TypeScript: api/webhook.ts, src/services/*, src/types.ts
- Config: keywords.json, .env.example
- Tests: src/__tests__/googleSheetsLoader.test.ts
- Docs: README.md, QUICKSTART.md
```

---

# 🚀 Phase 3: GitHub & Vercel 배포 🔄 진행 중 (30%)

## 현재 진행 상황

### ✅ 완료된 것
- ✅ 코드 로컬 커밋 완료
- ✅ 커밋 메시지: "Initial Deployment - Project Structure Complete"

### 🔄 진행 중
- 🔄 **GitHub 저장소 생성** (지금 진행 중!)

### ⏳ 다음 단계
1. GitHub 저장소 생성
2. `git remote add origin` 설정
3. GitHub에 푸시
4. Vercel에 배포
5. 환경변수 설정

---

## 📝 Phase 3 상세 단계

### **Step 1️⃣: GitHub 저장소 생성**
```
1. github.com 로그인
2. "+" → "New repository"
3. 이름: instagram-dm-bot
4. "Create repository" 클릭
5. URL 복사 (예: https://github.com/당신아이디/instagram-dm-bot.git)
```

### **Step 2️⃣: GitHub에 코드 푸시**
```bash
git remote add origin https://github.com/YOUR_USERNAME/instagram-dm-bot.git
git branch -M master main
git push -u origin main
```

### **Step 3️⃣: Vercel에 배포**
```
1. vercel.com 로그인
2. "Add New Project"
3. GitHub 저장소 (instagram-dm-bot) 선택
4. "Deploy" 클릭
5. 배포 완료 대기 (1-2분)
```

### **Step 4️⃣: Vercel 환경변수 설정**
```
Vercel 프로젝트 → Settings → Environment Variables

추가할 변수:
- IG_PAGE_ACCESS_TOKEN = [Meta에서 복사한 토큰]
- IG_VERIFY_TOKEN = [당신이 정한 검증 토큰, 예: mysecret123]
- GOOGLE_SHEETS_ID = [선택사항]
```

### **Step 5️⃣: Vercel URL 확인**
```
배포 완료 후: https://xxx.vercel.app
이 URL을 Phase 4에서 사용!
```

---

# 🔗 Phase 4: Meta 앱 연결 & 웹훅 등록 ⏳ 대기

## 준비 사항 (개발자가 아닌 사용자도 가능!)

### **Step 1️⃣: Instagram 비즈니스 계정 설정** (이미 완료됨!)
- ✅ Meta 앱 생성: "Auto DM Bot"
- ✅ Instagram Graph API 추가
- ✅ Instagram 비즈니스 계정 연결
- ✅ 페이지 액세스 토큰 확보 ← **지금 이것!**

### **Step 2️⃣: 필수 권한 요청** (다음 단계)
```
Meta 앱 → 제품 → Instagram Graph API → 권한

필요한 권한:
- instagram_basic
- instagram_manage_comments
- pages_messaging
```

### **Step 3️⃣: 웹훅 등록** (다음 단계)
```
Meta 앱 → 설정 → Webhooks

콜백 URL: https://xxx.vercel.app/api/webhook
검증 토큰: [Phase 3에서 설정한 IG_VERIFY_TOKEN]
구독 필드: comments ✓
```

---

# 🧪 Phase 5: 실제 테스트 & 운영 ⏳ 대기

## 테스트 흐름

### **Step 1️⃣: 로컬 테스트**
```bash
npm install
npm test              # 키워드 매칭 테스트
npm run build         # 타입스크립트 컴파일
npm run dev           # 로컬 서버 (선택)
```

### **Step 2️⃣: 실제 Instagram 테스트**
```
1. Instagram 게시물 작성
2. 키워드가 포함된 댓글 달기 (예: "가격")
3. 몇 초 대기
4. 비공개 DM 확인
5. Vercel 로그에서 처리 과정 확인
```

### **Step 3️⃣: 키워드 커스터마이징**

**방법 A: JSON 파일 수정** (배포 필요)
```json
{
  "keywords": ["가격", "비용", "얼마"],
  "replyText": "가격 정보입니다!",
  "url": "https://www.notion.so/pricing"
}
```

**방법 B: Google Sheets 사용** (배포 불필요!)
```
Google Sheets 생성:
- 헤더: keywords | replyText | url
- 행: 가격,비용 | 가격 정보입니다! | https://...
- 공유: 링크가 있는 모든 사람 (뷰어)

Vercel에서:
- GOOGLE_SHEETS_ID = [Sheet ID]
- 저장

→ 5초 후 자동 반영!
```

### **Step 4️⃣: 운영 & 모니터링**
```
Vercel 대시보드 → Logs 탭
- 웹훅 수신 로그
- 키워드 매칭 결과
- API 호출 성공/실패
- 에러 추적
```

---

# 📋 체크리스트 | 실제 사용까지의 남은 작업

## 🔄 지금 진행 중 (Phase 3)

- [ ] GitHub 저장소 생성
- [ ] `git push origin main` 완료
- [ ] Vercel 배포 완료
- [ ] Vercel 환경변수 설정 (IG_PAGE_ACCESS_TOKEN, IG_VERIFY_TOKEN)

## ⏳ 다음 단계 (Phase 4)

- [ ] Meta 앱에서 필수 권한 요청
- [ ] Meta 앱 → Webhooks에서 등록
  - [ ] 콜백 URL: `https://xxx.vercel.app/api/webhook`
  - [ ] 검증 토큰 설정
  - [ ] `comments` 구독 필드 체크
- [ ] 웹훅 검증 성공 확인 ✅

## 🧪 테스트 (Phase 5)

- [ ] Instagram 게시물에 키워드 댓글 달기
- [ ] 비공개 DM 수신 확인
- [ ] Vercel 로그에서 처리 과정 확인
- [ ] 여러 키워드로 반복 테스트
- [ ] Google Sheets 키워드 수정 후 자동 반영 확인

## 🎯 최종 완료

- [ ] 모든 Phase 완료
- [ ] 실제 운영 시작!

---

# 📚 참고 자료

## 빠른 시작 가이드
👉 [QUICKSTART.md](./QUICKSTART.md)

## 상세 README
👉 [README.md](./README.md)

## 환경 변수 템플릿
👉 [.env.example](./.env.example)

---

## 🎯 핵심 요약

| 항목 | 상태 | 소요 시간 |
|------|------|---------|
| 기획 & 설계 | ✅ 완료 | (완료) |
| 코드 개발 | ✅ 완료 | (완료) |
| **GitHub 배포** | 🔄 진행 중 | ~5분 |
| **Vercel 배포** | ⏳ 대기 | ~5분 |
| **Meta 웹훅 등록** | ⏳ 대기 | ~5분 |
| **실제 테스트** | ⏳ 대기 | ~10분 |
| **전체 소요 시간** | | **~25분** |

---

**다음 액션: GitHub 저장소를 생성하고 코드를 푸시하세요!** 🚀
