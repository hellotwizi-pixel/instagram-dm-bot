# Hermes Desk · 미미르 대시보드

2026-09-28 기준 실행 중인 대시보드의 소스 사본. 원본 코드와 그래픽 자산을 그대로 포함한다. 현재 연결된 GitHub 저장소는 없다.

## 포함 기능

- 미미르와 데이터 원천, 프로젝트를 연결한 입체 화면.
- 원천별 전체 기간 누적 건수와 중복을 제외한 전체 합계.
- 연결 유지 상태를 굵은 파란 선과 흐르는 빛으로 표시.
- 프로젝트별 업무 진행, 담당 에이전트, 막힌 이유, 결과물 확인.
- 에이전트 조직도와 기능 안내, 기존 업무 마을 화면.
- 대시보드 전용 Hermes 명령창.

## 실행

현재 Hermes가 설치된 Mac에서는 압축을 푼 뒤 `Hermes Desk 열기.command`를 실행한다. 기존 대시보드와 별도의 로컬 포트가 열리며 서버 터미널은 열어둔다.

일반 개발 환경에서는 Python 3.10 이상과 PyYAML이 필요하다. 현재 구현은 macOS/POSIX 환경 기준이다.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python server.py
```

특정 포트에서 실행하려면:

```sh
python server.py --port 64729
```

이미 같은 포트의 서버가 실행 중이면 다른 포트를 사용하거나 `--port`를 생략한다. 별도 프런트엔드 빌드나 npm 설치는 필요 없다.

## 실제 데이터 연결

이 소스는 기존 Hermes·미미르 환경의 기록을 읽는 대시보드다. 다른 컴퓨터에서 실제 업무를 보려면 해당 환경과 호환되는 기록 및 설정이 필요하다.

- `~/.hermes/config.yaml`, `~/.hermes/profiles/`: 에이전트·채널·모델 설정.
- `~/.hermes/kanban.db`, `projects.db`, `state.db`: 업무·프로젝트·대화 기록.
- `~/.company-memory/ledger.db`: 미미르 누적 자료.
- `~/.local/bin/hermes`: 명령 실행에 사용하는 기존 CLI.
- `local-data/`: 실행 시 생성되는 연결 정보와 관측 기록.

`observer/`에는 실행 관측 플러그인 소스를 포함했다. 대시보드를 실행하는 것만으로 플러그인을 설치하거나 Hermes 설정을 변경하지 않는다. 기존 기록이 없는 환경에서는 실제 현황을 표시할 수 없으며 `흐름 체험`으로 가상 흐름을 볼 수 있다.

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 시작점 |
| `ecosystem.js`, `ecosystem.css` | 미미르·프로젝트 생태계 화면과 효과 |
| `ecosystem-engine.js` | 입체 그래픽 렌더링 |
| `ecosystem-model.js` | 화면 상태와 누적량 처리 |
| `ecosystem.py` | 미미르 원천·누적량·연결 근거 조회 |
| `server.py` | 로컬 서버와 API, Hermes 명령 실행 |
| `operations.py`, `slack_operations.py`, `reporting.py` | 업무·Slack 진행·결과 정리 |
| `workflow-view.*`, `slack.*` | 업무 보고 화면 |
| `app.js`, `capabilities.js`, `style.css` | 조직도·기능 안내·기본 화면 |
| `village*`, `office*` | 기존 마을·오피스 화면 |
| `observer/` | 에이전트 실행 관측 플러그인 |
| `mimir-core-v3.png` | 미미르 뇌 그래픽 |

## 소스 패키지 범위

인증정보, 실행 기록, 회사 원본 자료, 데이터베이스, 설치 현황 스냅샷, 업무별 요약 파일은 포함하지 않았다. 해당 파일이 없는 경우 코드의 기본 표시가 사용된다. 운영 게이트웨이 재시작용 명령 파일도 제외했다.

화면 조회는 기존 기록을 읽는다. 명령창에서 작업을 보내면 설치된 Hermes가 실제로 실행한다. 서버는 `127.0.0.1`에 바인딩하며 인터넷 공개용 배포 구성이 아니다.

`SOURCE-MANIFEST.json`은 복사한 원본 파일의 SHA-256 목록이다. GitHub 공개 게시나 업로드는 수행하지 않았다.
