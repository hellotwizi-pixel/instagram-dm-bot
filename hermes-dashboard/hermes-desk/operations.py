"""Read-only, consistent operational view of the real Hermes board.

No inferred percentage and no fabricated work. Event cursors are board event IDs.
"""
import json
import sqlite3
import time
import pathlib
import shutil
import tempfile
from contextlib import contextmanager

ACTIVE = {'running', 'in_progress', 'claimed'}
TERMINAL = {'done', 'archived'}
REPORTABLE = {'spawned','commented','completed','blocked','gave_up','crashed','timed_out','status','archived','unblocked','block_loop_detected','review_requested'}

@contextmanager
def board_read(path):
    # A read-only SQLite open can still need to create a WAL shared-memory file.
    # Read a stable private copy instead, so dashboard reads never touch Hermes.
    def stamp(p):
        try:
            st=p.stat();return (st.st_ino,st.st_size,st.st_mtime_ns)
        except FileNotFoundError:return None
    with tempfile.TemporaryDirectory(prefix='hermes-live-') as folder:
        target=pathlib.Path(folder)/'board.db'
        wal=pathlib.Path(str(path)+'-wal')
        for attempt in range(40):
            try:
                before=(stamp(path),stamp(wal))
                if before[1] and before[1][1]<=32:before=(before[0],None)
                shutil.copyfile(path,target)
                tw=pathlib.Path(str(target)+'-wal');tw.unlink(missing_ok=True)
                if before[1]:shutil.copyfile(wal,tw)
                after=(stamp(path),stamp(wal))
                if after[1] and after[1][1]<=32:after=(after[0],None)
                if before!=after:
                    time.sleep(.02);continue
                break
            except FileNotFoundError:
                if not path.exists():raise
                time.sleep(.02)
        else:raise RuntimeError('기록 변경 중 · 다음 갱신에서 재확인')
        con=sqlite3.connect(target,timeout=2);con.row_factory=sqlite3.Row
        try:
            con.execute('pragma query_only=on');con.execute('begin')
            yield con
        finally:con.close()

def obj(raw):
    try:
        value=json.loads(raw or '{}')
        return value if isinstance(value,dict) else {}
    except (ValueError,TypeError):
        return {}

def read_operations(home, labels, redact, after=None, now=None):
    now=now or time.time()
    path=home/'kanban.db'
    if not path.exists():raise FileNotFoundError('작업 기록이 없습니다')
    with board_read(path) as c:
        tasks=[dict(r) for r in c.execute('select id,title,assignee,status,created_by,created_at,started_at,completed_at,last_heartbeat_at,block_kind,last_failure_error,current_run_id,model_override,provider_override,session_id,result from tasks order by created_at desc')]
        by_id={t['id']:t for t in tasks}
        parents={}
        for r in c.execute('select parent_id,child_id from task_links'):
            parents.setdefault(r['child_id'],[]).append(r['parent_id'])
        runs={r['task_id']:dict(r) for r in c.execute('select r.* from task_runs r join (select task_id,max(id) id from task_runs group by task_id) latest on r.id=latest.id')}
        activity={r['task_id']:dict(r) for r in c.execute("select e.* from task_events e join (select task_id,max(id) id from task_events where kind not in ('heartbeat') group by task_id) latest on e.id=latest.id")}
        blocks={r['task_id']:obj(r['payload']).get('reason','') for r in c.execute("select e.* from task_events e join (select task_id,max(id) id from task_events where kind='blocked' group by task_id) latest on e.id=latest.id")}
        latest=c.execute('select coalesce(max(id),0) from task_events').fetchone()[0]
        start=max(0,latest-100) if after is None else max(0,after)
        events=[]
        for r in c.execute('select id,task_id,kind,created_at,payload from task_events where id>? order by id limit 500',(start,)):
            e=dict(r);payload=obj(e.pop('payload'));t=by_id.get(e['task_id'],{})
            e.update(assignee=payload.get('assignee') or t.get('assignee'),title=redact(t.get('title','')),detail=redact(payload.get('summary') or payload.get('reason') or payload.get('text') or '')[:1000])
            events.append(e)
        subs={}
        for r in c.execute('select task_id,platform,notifier_profile,last_event_id,delivery_mode from kanban_notify_subs'):
            sub=dict(r)
            sub['pending']=c.execute('select count(*) from task_events where task_id=? and id>? and kind in ('+','.join('?' for _ in REPORTABLE)+')',(sub['task_id'],sub['last_event_id'],*sorted(REPORTABLE))).fetchone()[0]
            subs.setdefault(sub['task_id'],[]).append(sub)
        for t in tasks:
            run=runs.get(t['id'],{});a=activity.get(t['id'],{})
            t['title']=redact(t['title']);t['group'],t['role']=labels.get(t['assignee'],('미분류','담당 확인 필요'))
            t['parents']=[{'id':p,'status':by_id[p]['status'],'title':redact(by_id[p]['title'])} for p in parents.get(t['id'],[]) if p in by_id]
            waits=[p for p in t['parents'] if p['status'] not in TERMINAL]
            t['result']=redact(run.get('summary') or t.get('result') or '')[:5000]
            t['last_failure_error']=redact(t['last_failure_error'])[:1500]
            t['lastProgressAt']=a.get('created_at')
            t['lastProgressKind']=a.get('kind')
            t['heartbeatStale']=t['status'] in ACTIVE and now-(t['last_heartbeat_at'] or t['started_at'] or t['created_at'])>180
            t['progressStale']=t['status'] in ACTIVE and now-(a.get('created_at') or t['started_at'] or t['created_at'])>900
            if t['status']=='blocked':t['reason']=redact(blocks.get(t['id'],'') or t['last_failure_error'] or t['result'] or '차단 사유 기록 필요')
            elif waits:t['reason']='선행 작업 대기: '+', '.join(p['title'] for p in waits)
            elif t['heartbeatStale']:t['reason']='실행 신호가 3분 넘게 없음 · 실행 확인 필요'
            elif t['progressStale']:t['reason']='15분 넘게 단계 변화 없음 · 진행 확인 필요'
            elif t['status'] in {'todo','ready'}:t['reason']='실행 배정 대기' if t['assignee'] else '담당자 미지정'
            else:t['reason']=''
            t['subscriptions']=subs.get(t['id'],[])
            meta=obj(run.get('metadata'));t['actualModel']=meta.get('actual_model') or meta.get('model');t['actualProvider']=meta.get('actual_provider') or meta.get('provider');t['modelEvidence']='실행 기록' if t['actualModel'] else '미확인'
            t['runId']=run.get('id')
        recovered=[]
        if c.execute("select 1 from sqlite_master where type='table' and name='hermes_desk_report_recovery'").fetchone():
            for r in c.execute('select * from hermes_desk_report_recovery order by id desc'):
                evs=[e for e in json.loads(r['events']) if e['kind'] in REPORTABLE]
                if not evs:continue
                notes=[]
                for e in evs:
                    payload=obj(e.get('payload'));body=payload.get('summary') or payload.get('reason') or payload.get('text') or payload.get('comment') or ''
                    notes.append({'kind':e['kind'],'at':e.get('created_at'),'text':redact(str(body))[:2000]})
                recovered.append({'taskId':r['task_id'],'title':redact(by_id.get(r['task_id'],{}).get('title',r['task_id'])),'profile':r['profile'],'events':notes})
        return {'recoveredReports':recovered,'checked':now,'cursor':events[-1]['id'] if events else latest,'latestCursor':latest,'events':events,'tasks':tasks,'counts':dict(c.execute('select status,count(*) from tasks group by status')),'source':'kanban.db','history':after is None}

def attach_observations(out, path):
    """Only join recorded task IDs; a dependency graph is not a request group."""
    out['requests']=[]
    out['liveAgents']=[]
    out['observer']={'available':path.exists()}
    if not path.exists():return out
    with board_read(path) as c:
        rows=[dict(r) for r in c.execute('select * from activity order by id desc limit 3000')]
        latest_by_task={};success_by_task={};activity_by_task={};by_profile={}
        for r in rows:by_profile.setdefault(r['profile'],r)
        for profile,r in by_profile.items():
            state='idle' if r['event']=='post_llm_call' else 'attention' if r['event']=='api_request_error' else 'working'
            if state!='idle' and out['checked']-r['created_at']>180:state='unknown'
            out['liveAgents'].append({'profile':profile,'state':state,'event':r['event'],'tool':r['tool'],'model':r['response_model'] or r['model'],'at':r['created_at']})
        for r in rows:
            tid=r['task_id']
            if not tid:continue
            latest_by_task.setdefault(tid,r)
            if r['event']=='post_api_request':success_by_task.setdefault(tid,r)
            if r['event']=='post_tool_call' and r['status'] not in ('error','failed'):activity_by_task.setdefault(tid,r)
        for t in out['tasks']:
            successful=success_by_task.get(t['id']);recent=latest_by_task.get(t['id']);progress=activity_by_task.get(t['id'])
            if successful:
                t['actualModel']=successful['response_model'] or successful['model'];t['actualProvider']=successful['provider'];t['modelEvidence']='실제 응답 기록';t['modelObservedAt']=successful['created_at']
            if recent:t['activity']={k:recent[k] for k in ('event','created_at','tool','model','provider','status')}
            if progress:t['lastToolAt']=progress['created_at']
        members={}
        for r in c.execute('select task_id,request_id,parent_task_id from request_tasks'):
            members.setdefault(r['request_id'],[]).append(r['task_id'])
        indexed={t['id']:t for t in out['tasks']}
        for r in c.execute('select * from requests order by created_at desc limit 30'):
            request=dict(r);ids=members.get(r['id'],[]);tasks=[indexed[i] for i in ids if i in indexed];missing=[i for i in ids if i not in indexed]
            request['taskIds']=ids;request['done']=sum(t['status']=='done' for t in tasks);request['total']=len(ids)
            # Archived work is not proof of successful delivery.
            if not request['dispatch_finished_at']:state='dispatching'
            elif missing:state='unknown'
            elif not ids:state='no_tasks'
            elif all(t['status']=='done' for t in tasks):state='complete'
            elif any(t['status'] in ACTIVE for t in tasks):state='working'
            elif any(t['status']=='blocked' for t in tasks):state='blocked'
            else:state='waiting'
            request['state']=state;out['requests'].append(request)
        out['observer']['lastEventAt']=rows[0]['created_at'] if rows else None
    return out
