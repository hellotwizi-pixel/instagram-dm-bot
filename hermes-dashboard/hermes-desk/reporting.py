"""Plain-language views of recorded evidence; no guessed request ownership."""
import pathlib
import re
import hashlib
import json
from operations import board_read

ROLE_NAMES = {
 'devpm':'개발 업무 조율', 'devcoder':'개발 담당', 'devreview':'검토 담당', 'devqa':'테스트 담당',
 'planpm':'기획 업무 조율', 'planproduct':'제품 기획', 'planspec':'요구사항 정리',
 'designpm':'디자인 업무 조율', 'designux':'화면·사용 흐름 설계', 'designbrand':'브랜드 디자인',
 'mktpm':'마케팅 업무 조율', 'mktwriter':'콘텐츠 작성', 'mktseo':'검색 노출 개선', 'mktedit':'콘텐츠 편집',
 'adpm':'광고 업무 조율', 'adgoogle':'구글 광고', 'admeta':'인스타·페이스북 광고',
 'adbudget':'광고 예산·성과 분석', 'adcreative':'광고 소재 검토', 'adcopy':'광고 문구 작성', 'adpolicy':'광고 심사 점검',
 'oppm':'운영 업무 조율', 'opdoc':'문서 작성', 'opcurator':'자료 정리', 'opresearch':'조사·분석',
 'legalpm':'법무 업무 조율', 'legalcontract':'계약 검토', 'legalteam':'법률 문서 검토',
 'secpm':'보안 업무 조율', 'secteam':'보안 사고 대응', 'secsec':'보안 점검',
 'aiospm':'AI-OS 업무 조율', 'aiosops':'AI-OS 운영', 'aiosanalyst':'AI-OS 운영 분석', 'aiosstrat':'AI-OS 개선 기획',
 'default':'공통 업무 담당', 'reviewer':'검토 담당',
}
# Names agreed with the user. IDs come from actual Slack routing, never title similarity.
PROJECT_NAMES = {
 'acepm':'ACE 인도어골프', 'councilpm':'AI Council', 'replypm':'DMmate', 'hahapm':'하하팩토리',
 'ditalkpm':'디토크', 'bbqpm':'바베큐국립공원', 'rewardpm':'리워드드로우',
 'boardpm':'플래닝보드', 'openitpm':'바로열기', 'aiospm':'AI-OS 관리',
}
PROJECT_SLUGS = {'doc-viewer':'openitpm', 'rewarddraw':'rewardpm', 'ai-council':'councilpm'}


def attachment_path(home, stored_path):
    """Only registered regular files inside the attachment store can be downloaded."""
    if not stored_path:
        return None
    try:
        root = (home / 'kanban' / 'attachments').resolve(strict=True)
        path = pathlib.Path(stored_path).resolve(strict=True)
        if path.is_relative_to(root) and path.is_file():
            return path
    except (OSError, RuntimeError, ValueError):
        pass
    return None


def read_attachment(home, attachment_id):
    with board_read(home / 'kanban.db') as c:
        row = c.execute('select filename,stored_path from task_attachments where id=?', (attachment_id,)).fetchone()
    if row is None:
        raise FileNotFoundError('등록된 파일이 없음')
    path = attachment_path(home, row['stored_path'])
    if path is None:
        raise FileNotFoundError('이 컴퓨터에서 파일을 찾을 수 없음. Slack 원래 대화에서 확인.')
    name = re.sub(r'[\x00-\x1f\x7f/\\]', '_', row['filename'] or path.name)
    return name, path.read_bytes()


def brief_title(text, limit=62):
    text = re.sub(r'^\[[^\]\n]+\]\s*', '', text or '').strip('` #\n')
    text = re.sub(r'\bSLACK-E2E-\d+-\d+\s*[—:：-]?\s*', '', text)
    text = re.sub(r'\bt_[0-9a-f]{8}\b', '작업', text)
    text = text.replace('E2E', '전체 흐름 점검').replace('수용 QA', '최종 테스트').replace('QA', '테스트')
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:limit].rstrip() + ('…' if len(text) > limit else '')


def summary_fingerprint(g):
    source = {'request': g.get('requestText'), 'tasks': [(t['id'], t['title']) for t in g['tasks']]}
    return hashlib.sha256(json.dumps(source, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def task_reason(task):
    reason = task.get('reason') or ''
    if task['status'] in ('done', 'archived'):
        return ''
    if task['status'] == 'blocked':
        if '중복' in reason:
            return '중복으로 나뉜 업무 정리 필요'
        if re.search(r'권한|인증|접근|API_KEY|설정.*false', reason):
            return '접근 권한·연결 설정 확인 필요'
        if re.search(r'자료|입력|실기기|테스트 환경|사용자.*승인', reason):
            return '추가 자료·실행 환경 확인 필요'
        if 'without calling' in reason:
            return '작업은 멈췄지만 마무리 보고가 없음'
        return '진행 중 문제가 생겨 점검 필요'
    if task.get('heartbeatStale') or task.get('progressStale'):
        return '최근 진행 소식이 없어 확인 필요'
    if any(p['status'] not in ('done', 'archived') for p in task.get('parents', [])):
        return '앞 업무가 끝나기를 기다리는 중'
    if task['status'] in ('todo', 'ready'):
        return '시작 순서를 기다리는 중' if task.get('assignee') else '담당 배정 필요'
    if task['status'] == 'triage':
        return '업무 분담 확인 필요'
    return ''


def enrich_report(result, home, routes):
    # Reviewed short labels expire whenever the source request or task list changes.
    try:
        summaries = json.loads(pathlib.Path(__file__).with_name('reporting_summaries.json').read_text())
    except (OSError, ValueError):
        summaries = {}
    projects = {}
    route_projects = {}
    for r in routes:
        profile = r.get('profile')
        name = r.get('name') or ''
        if profile in PROJECT_NAMES or name.startswith(('프로젝트-', '개인-')):
            pid = 'channel:' + r['chat_id']
            route_projects[r['chat_id']] = pid
            category = '개인 프로젝트' if name.startswith('개인-') else 'AI-OS 관리' if profile == 'aiospm' else '팀 프로젝트'
            projects[pid] = dict(id=pid, name=PROJECT_NAMES.get(profile) or re.sub(r'^(프로젝트|개인)-', '', name), category=category)
    db_projects = {}
    if (home / 'projects.db').exists():
        with board_read(home / 'projects.db') as c:
            for r in c.execute('select id,slug,name from projects where archived=0'):
                target_profile = PROJECT_SLUGS.get(r['slug'])
                route = next((r for r in routes if target_profile and r.get('profile') == target_profile), None)
                pid = route_projects.get(route['chat_id']) if route else None
                if not pid:
                    pid = 'project:' + r['id']
                    projects[pid] = dict(id=pid, name=r['name'], category='등록 프로젝트')
                db_projects[r['id']] = pid
    unknown = 'unassigned'
    projects[unknown] = dict(id=unknown, name='프로젝트 미분류', category='분류 확인')
    linked_ids = {t['id'] for g in result['conversations'] for t in g['tasks']}
    for t in [*result['unlinked'], *[t for g in result['conversations'] for t in g['tasks']]]:
        t['roleName'] = ROLE_NAMES.get(t.get('assignee')) or (PROJECT_NAMES[t['assignee']] + ' 담당' if t.get('assignee') in PROJECT_NAMES else t.get('role') or '담당 확인 필요')
        t['shortTitle'] = brief_title(t['title'])
        t['reasonBrief'] = task_reason(t)
    for g in result['conversations']:
        tasks = g['tasks']
        ids = list(dict.fromkeys(db_projects[t['project_id']] for t in tasks if t.get('project_id') in db_projects))
        has_registered_project = bool(ids)
        routed = route_projects.get(g['chatId'])
        if routed and routed not in ids:
            ids.insert(0, routed)
        g['projectIds'] = ids or [unknown]
        g['projectNames'] = [projects[p]['name'] for p in g['projectIds']]
        g['projectBasis'] = 'Slack 프로젝트 채널·업무에 등록된 프로젝트' if routed and has_registered_project else 'Slack 프로젝트 채널' if routed else '업무에 등록된 프로젝트' if ids else '프로젝트 연결 기록 없음'
        if tasks:
            g['summary'] = brief_title(tasks[0]['title'])
            g['summaryBasis'] = '업무 제목 기준' + (f' · 연결된 업무 {len(tasks)}개' if len(tasks) > 1 else '')
        else:
            g['summary'] = brief_title(g.get('requestText') or g['title'])
            g['summaryBasis'] = '요청 원문 기준' if g['originKnown'] else '요청 원문 없음'
        reviewed = summaries.get(g['id'], {})
        if reviewed.get('fingerprint') == summary_fingerprint(g):
            g['summary'] = reviewed['summary']
            g['summaryBasis'] = '요청·업무 내용을 정리한 제목'
        # The requester is the recorded Slack identity, never the PM creating task cards.
        g['requesterKey'] = g.get('userId') or ('name:' + g['user'] if g.get('user') else 'unknown')
        g['reportable'] = bool(tasks or (g['originKnown'] and not re.search(r'님이 채널에 참여함\s*$', g.get('requestText', ''))))
        g['attentionReasons'] = list(dict.fromkeys(t['reasonBrief'] for t in tasks if t['status'] in ('blocked', 'triage') or t.get('heartbeatStale') or t.get('progressStale')))
        if g['attentionReasons'] and g['state'] == 'working':
            g['state'] = 'attention'
        g['attachments'] = list({a['id']: dict(a, taskId=t['id'], taskTitle=t['shortTitle'], taskStatus=t['status'], roleName=t['roleName']) for t in tasks for a in t.get('attachments', [])}.values())
    result['projects'] = list(projects.values())
    result['coverage'] = dict(
        olderUnlinkedTasks=sum(t['id'] not in linked_ids for t in result['unlinked']),
        hiddenConversations=sum(not g['reportable'] for g in result['conversations']),
        unknownRequesters=sum(g['reportable'] and g['requesterKey'] == 'unknown' for g in result['conversations']),
    )
