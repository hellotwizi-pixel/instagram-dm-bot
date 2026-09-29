"""Read-only evidence for the Hermes/Mimir scene. Never runs collectors or tools."""
from pathlib import Path
import datetime,json,re,shlex,sqlite3,time,plistlib
from operations import board_read

# Descriptions explain the installed collectors. Membership and counts come from
# the ledger; a new source is rendered even before it has a friendly description.
SOURCES=[
 ('gmail','Gmail',2,'M','자료·실적','메일 본문 · PDF 첨부 · 사진 속 글자','메일 읽기 → 본문·첨부 분리 → 미미르'),
 ('drive','Google Drive',7,'D','자료·실적','새 파일 발견 · 문서·이미지 수집의 입구','공유 폴더 감시 → 문서·이미지 처리 → 미미르'),
 ('document','문서·글자 추출',30,'T','자료·실적','PDF · 엑셀 · 워드 · 문서 · 사진 속 글자','Drive 문서 변환·글자 추출 → 미미르'),
 ('image','현장 사진 판독',30,'◩','자료·실적','간판 · 소재 · 위치 · 공사 모습','사진 내용 해석 → 설명 저장 → 미미르'),
 ('calendar','Google 캘린더',14,'C','자료·실적','일정 · 장소 · 설명 · 참석자','캘린더 일정 수집 → 미미르'),
 ('instagram','인스타 실적',2,'◎','자료·실적','팔로워 · 도달 · 조회 · 프로필 방문','연결된 계정 실적 수집 → 미미르'),
 ('ga4','사이트 실적',2,'↗','자료·실적','방문 · 인기 페이지 · 유입 · 전환','사이트 방문 통계 수집 → 미미르'),
 ('kakao','카카오톡',999,'K','자료·실적','내보낸 대화 파일','대화 내보내기 파일 → 수집 폴더 → 미미르'),
 ('slack','Slack',3,'#','대화·AI 작업','업무 채널 대화 · 답글','채널·대화 묶음 수집 → 미미르'),
 ('council','AI Council',21,'AI','대화·AI 작업','회의 요약 · 할 일 · 화자별 발언','회의 기록 수집 → 미미르'),
 ('claude-code','Claude Code',3,'✳','대화·AI 작업','사람이 내린 요청 · 작업 결론','Claude Code 작업 대화 파일 → 정리 → 미미르'),
 ('chatgpt','ChatGPT / GPT',3,'G','대화·AI 작업','GPT와 나눈 대화','수집 경로 확인 중'),
 ('telegram','텔레그램·터미널',7,'›_','대화·AI 작업','헤르메스에 내린 지시 · 답변','Hermes 대화 기록 → 미미르'),
 ('kanban','에이전트 작업',7,'W','대화·AI 작업','작업 지시 · 실행 결과 · 의견','작업 보드 기록 수집 → 미미르'),
 ('card','프로젝트 지식',14,'P','대화·AI 작업','프로젝트 문서 · 결정사항','정리된 프로젝트 카드 → 미미르'),
 ('manual','직접 넣은 자료',30,'+','대화·AI 작업','직접 전달한 링크 · 자료','추가된 자료의 원천 이름으로 저장될 수 있음'),
]
KINDS={'body':'메일 본문','pdf':'PDF 첨부','image-ocr':'첨부 사진 글자','held':'보류','failed':'가져오기 실패','document':'문서 본문','document_unread':'읽기 실패','image_notext':'사진 글자 없음','image_text':'사진 속 글자','meeting_summary':'회의 요약','meeting_talk':'화자별 발언','meeting_todo':'회의 할 일','instruction':'사람의 지시','reply':'답변','message':'대화','comment':'작업 의견','run':'실행 기록','task':'작업 지시','file':'새 파일 발견','card':'프로젝트 카드','event':'일정','metric':'실적','image_seen':'사진 판독','worklog':'작업 대화'}
ISSUES={'held','failed','document_unread','image_notext'}

def gpt_memory_evidence(home,ids):
    """Match only stored Hermes reply IDs to their model metadata, never prompts."""
    if not ids:return None
    try:
        total=0
        with board_read(home/'state.db') as c:
            for start in range(0,len(ids),400):
                part=ids[start:start+400]
                total+=c.execute("select count(*) from messages m join sessions s on s.id=m.session_id where m.id in ("+','.join('?' for _ in part)+") and (lower(s.model) like 'gpt-%' or lower(s.model) like 'openai/gpt-%')",part).fetchone()[0]
        return total
    except (OSError,sqlite3.Error):return None

def cadence(schedule):
    expr=(schedule or {}).get('expr','') if isinstance(schedule,dict) else ''
    match=re.fullmatch(r'(\d+) \* \* \* \*',expr)
    if match:return f'매시간 {int(match[1])}분'
    match=re.fullmatch(r'(\d+) (\d+) \* \* \*',expr)
    if match:return f'매일 {int(match[2]):02d}:{int(match[1]):02d}'
    return '예약 실행'

def _time(value):
    try:return datetime.datetime.fromisoformat(value).timestamp()
    except (ValueError,TypeError):return None

def source_state(count,last,days,now):
    if not count:return 'waiting'
    return 'quiet' if not last or now-last>days*86400 else 'recent'

def _is_memory_call(call):
    """Recognize explicit read commands, not documentation or echoed examples."""
    f=call.get('function') or call;name=f.get('name','');args=f.get('arguments',{})
    try:args=json.loads(args) if isinstance(args,str) else args
    except (ValueError,TypeError):return False
    if not isinstance(args,dict):return False
    if re.fullmatch(r'(?:mcp[_-])?company[_-]memory[_-](?:search|ask|brief)',name):return True
    if name not in ('terminal','shell','exec_command'):return False
    command=args.get('command') or args.get('cmd') or ''
    if not isinstance(command,str):return False
    try:tokens=shlex.split(command)
    except ValueError:return False
    if not tokens:return False
    start=1 if Path(tokens[0]).name in ('python','python3') else 0
    return len(tokens)>start+1 and Path(tokens[start]).name=='company-memory.py' and tokens[start+1] in ('ask','search','brief')

def _tool_outcome(content):
    try:body=json.loads(content or '')
    except (ValueError,TypeError):return 'requested'
    if not isinstance(body,dict):return 'requested'
    code=body.get('exit_code',body.get('returncode'))
    if code is None:return 'requested'
    return 'returned' if code==0 else 'error'

def memory_activity(home,observations,now):
    """Join only exact observed session/task IDs. No prompt or query text leaves here."""
    if not observations.exists():return [],False
    with board_read(observations) as c:
        rows=c.execute("select profile,session_id,task_id,max(created_at) at from activity where created_at>? and session_id!='' and event='pre_tool_call' group by profile,session_id,task_id order by at desc limit 40",(now-3600,)).fetchall()
    grouped={}
    for r in rows:
        if re.fullmatch(r'[a-zA-Z0-9_-]{1,70}',r['profile'] or ''):grouped.setdefault(r['profile'],[]).append(dict(r))
    out=[];readable=True
    for profile,items in list(grouped.items())[:8]:
        path=home/'state.db' if profile=='default' else home/'profiles'/profile/'state.db'
        try:
            with board_read(path) as c:
                for session in dict.fromkeys(r['session_id'] for r in items):
                    tids={r['task_id'] for r in items if r['session_id']==session and r['task_id']}
                    tid=next(iter(tids)) if len(tids)==1 else None
                    for row in c.execute('select id,tool_calls,timestamp from messages where session_id=? and timestamp>? and tool_calls is not null order by id desc limit 100',(session,now-3600)):
                        try:calls=json.loads(row['tool_calls'])
                        except (ValueError,TypeError):continue
                        if not isinstance(calls,list):continue
                        for call in calls:
                            if not isinstance(call,dict) or not _is_memory_call(call):continue
                            outcome='requested';at=row['timestamp']
                            if call.get('id'):
                                result=c.execute("select content,timestamp from messages where session_id=? and tool_call_id=? and role='tool' order by id desc limit 1",(session,call['id'])).fetchone()
                                if result:outcome=_tool_outcome(result['content']);at=result['timestamp']
                            out.append({'id':f"{profile}:{row['id']}:{call.get('id','')}",'profile':profile,'taskId':tid,'at':at,'state':outcome})
        except (OSError,sqlite3.Error):readable=False
    return sorted(out,key=lambda r:r['at'],reverse=True)[:40],readable

def read_ecosystem(home,data,memory=None,now=None):
    home=Path(home);data=Path(data);memory=Path(memory) if memory else Path.home()/'.company-memory/ledger.db';now=now or time.time()
    out={'checked':now,'sources':[],'brain':{'readable':False,'total':None,'facts':None},'jobs':[],'memoryActivity':[],'errors':[]}
    seen={};parts={};reply_ids=[];drive_rollup=None;gmail_checked=None
    try:
        with board_read(memory) as c:
            seen={r['source']:dict(r) for r in c.execute('select source,count(*) count,max(added_at) lastAdded from entries group by source')}
            columns={r['name'] for r in c.execute('pragma table_info(entries)')}
            if {'channel','kind'}<=columns:
                # Drive is an upstream folder, document/image are its processing
                # branches. Count their persisted history, never a recent delta.
                drive_rows=[dict(r) for r in c.execute("select kind,count(*) count,max(added_at) lastAdded from entries where source='drive' or (source in ('document','image') and channel in ('드라이브 문서','드라이브 사진')) group by kind")]
                if drive_rows:drive_rollup=drive_rows
            if c.execute("select 1 from sqlite_master where type='table' and name='cursors'").fetchone():
                gmail_checked=c.execute("select max(updated_at) from cursors where key like 'gmail:%'").fetchone()[0]
            if 'kind' in columns:
                for r in c.execute('select source,kind,count(*) n from entries group by source,kind'):
                    parts.setdefault(r['source'],[]).append({'kind':r['kind'],'name':KINDS.get(r['kind'],r['kind'] or '수집 기록'),'count':r['n'],'issue':r['kind'] in ISSUES,'metadata':r['kind']=='file'})
            if {'kind','source_id'}<=columns:
                reply_ids=[str(r[0]).split(':')[-1] for r in c.execute("select source_id from entries where source='telegram' and kind='reply' and source_id like 'hermes:%'")]
            total=sum(r['count'] for r in seen.values());issues=sum(p['count'] for rows in parts.values() for p in rows if p['issue']);metadata=sum(p['count'] for rows in parts.values() for p in rows if p['metadata'])
            out['brain']={'readable':True,'countScope':'all_stored','total':total,'usable':total-issues-metadata if parts else None,'needsReview':issues,'metadata':metadata,'recordedSources':len(seen),'facts':c.execute('select count(*) from facts').fetchone()[0],'latest':max([r['lastAdded'] for r in seen.values()] or [0])}
    except (OSError,sqlite3.Error):out['errors'].append('미미르 저장 기록을 읽지 못함')
    definitions=SOURCES+[(k,k,30,'+','추가된 원천','새로 저장된 자료','미미르 저장 기록에서 자동 발견') for k in seen if k not in {s[0] for s in SOURCES}]
    for key,label,days,mark,category,what,route in definitions:
        r=seen.get(key,{});count=r.get('count',0);last=r.get('lastAdded');state=source_state(count,last,days,now) if out['brain']['readable'] else 'unknown'
        note='최근 자료 적재 확인' if state=='recent' else '새 자료가 오래 없음 · 연결 장애 여부는 추가 확인' if state=='quiet' else '아직 저장된 자료 없음' if state=='waiting' else '저장 기록을 읽지 못함'
        if key=='kakao' and state=='waiting':note='대화 내보내기 파일의 적재 기록 없음'
        if key=='chatgpt' and not count:state='unknown';note='ChatGPT 앱 대화를 직접 가져오는 경로는 확인 중'
        if key=='manual' and not count:state='unknown';note='직접 넣은 링크·자료는 문서나 프로젝트 카드에 포함될 수 있음. 별도 원천으로는 아직 확인되지 않음'
        if key=='drive' and count:
            # This branch records new-file sightings, not heartbeat or document content.
            state='recorded';note='새 파일 발견 기록. 실제 문서 내용과 사진은 문서·사진 원천에 따로 집계'
        rows=parts.get(key,[])
        out['sources'].append({'id':key,'name':label,'mark':mark,'category':category,'what':what,'route':route,'state':state,'countScope':'all_stored','count':count if out['brain']['readable'] else None,'lastAdded':last,'note':note,'parts':rows,'usable':sum(p['count'] for p in rows if not p['issue'] and not p['metadata']) if rows else None,'needsReview':sum(p['count'] for p in rows if p['issue']),'recorded':key in seen})
    if drive_rollup and out['brain']['readable']:
        s=next(s for s in out['sources'] if s['id']=='drive')
        s.update(displayCount=sum(r['count'] for r in drive_rollup),includes=['drive','document','image'],lastAdded=max(r['lastAdded'] or 0 for r in drive_rollup),what='Drive에서 가져온 문서 · 사진 · 파일 기록',note='문서·사진 처리 경로까지 포함한 전체 누적 기록. 문서·사진 카드와 겹치는 수는 미미르 전체 합계에 한 번만 반영',parts=[{'kind':r['kind'],'name':KINDS.get(r['kind'],r['kind']),'count':r['count'],'issue':r['kind'] in ISSUES,'metadata':r['kind']=='file'} for r in drive_rollup],usable=sum(r['count'] for r in drive_rollup if r['kind'] not in ISSUES|{'file'}),needsReview=sum(r['count'] for r in drive_rollup if r['kind'] in ISSUES))
    # A derived view makes GPT conversations visible without double-counting them
    # as an extra upstream collector. Direct ChatGPT records, if added, take over.
    gpt=gpt_memory_evidence(home,reply_ids)
    out['llm']={'hermesGptReplies':gpt,'chatgptDirect':bool(seen.get('chatgpt'))}
    if gpt and not seen.get('chatgpt'):
        s=next(s for s in out['sources'] if s['id']=='chatgpt');t=seen.get('telegram',{})
        s.update(name='GPT 대화 · Hermes',state='recorded',count=gpt,usable=gpt,derived=True,recorded=False,lastAdded=None,what='GPT 모델이 답한 헤르메스 대화',route='GPT 답변 → Hermes 대화 기록 → 미미르',note='텔레그램·터미널 기록에 포함된 답변. 전체 건수에 중복 합산하지 않음. ChatGPT 앱 직접 수집은 경로 확인 중',parts=[{'kind':'reply','name':'GPT 답변','count':gpt,'issue':False}])
    try:
        raw=json.loads((home/'cron/jobs.json').read_text());jobs=raw if isinstance(raw,list) else raw.get('jobs',[])
        for j in jobs:
            if j.get('name') not in ('memory-collect','memory-distill'):continue
            at=_time(j.get('last_run_at'));age=now-at if at else None;status=j.get('last_status');enabled=j.get('enabled',True) and j.get('state')!='paused'
            fresh=age is not None and age<(3*3600 if j['name']=='memory-collect' else 36*3600)
            state='paused' if not enabled else 'unknown' if not fresh else 'ok' if status=='ok' else 'error' if status in ('error','failed','failure') else 'unknown'
            out['jobs'].append({'id':j['name'],'name':'자료 수집' if j['name']=='memory-collect' else '지식 정리','state':state,'at':at,'cadence':cadence(j.get('schedule')),'enabled':enabled,'lastResult':status if status in ('ok','error','failed','failure') else None})
    except (OSError,ValueError):out['errors'].append('자동 수집 상태 기록을 읽지 못함')
    collect=next((j for j in out['jobs'] if j['id']=='memory-collect'),None)
    for s in out['sources']:
        if s['recorded'] and s['id'] in {d[0] for d in SOURCES if d[0] not in ('gmail','manual','chatgpt')} and collect:s['cadence']=collect['cadence']+' 수집 예약' if collect['enabled'] else '자동 수집 일시 중지'
    gmail_interval=None
    try:
        setup=plistlib.loads((home.parent/'Library/LaunchAgents/com.aicouncil.gmail-knowledge.plist').read_bytes())
        interval=setup.get('StartInterval')
        if isinstance(interval,int) and interval>0:
            gmail_interval=interval;next(s for s in out['sources'] if s['id']=='gmail')['cadence']=f'{interval//60}분마다 수집 예약'
    except (OSError,ValueError,plistlib.InvalidFileException):pass
    known_collectors={d[0]:d[2] for d in SOURCES if d[0] not in ('gmail','manual','chatgpt')}
    for s in out['sources']:
        s['connection']='unknown'
        if not out['brain']['readable']:continue
        if not (s.get('displayCount',s['count']) or 0):s['connection']='waiting';continue
        if s['id']=='gmail':
            if gmail_interval and gmail_checked and 0<=now-gmail_checked<max(gmail_interval*4,3600):s['connection']='connected'
        elif s['id'] in known_collectors:
            if collect and not collect['enabled']:s['connection']='paused'
            elif collect and collect['state']=='ok' and source_state(s.get('displayCount',s['count']),s['lastAdded'],known_collectors[s['id']],now)=='recent':s['connection']='connected'
        s['connectionNote']='빛의 흐름은 누적 적재·최근 수집 확인에 따른 연결 유지 표시. 개별 파일의 실시간 전송 속도는 아님'
    gpt_source=next(s for s in out['sources'] if s['id']=='chatgpt')
    if gpt_source.get('derived'):gpt_source['connection']=next(s for s in out['sources'] if s['id']=='telegram')['connection']
    try:out['memoryActivity'],out['memoryObservationReadable']=memory_activity(home,data/'observations.db',now)
    except (OSError,sqlite3.Error):out['memoryObservationReadable']=False
    return out
