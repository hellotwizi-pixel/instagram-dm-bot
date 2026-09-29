"""Local evidence only. Never forwards prompts, tool bodies, or credentials."""
from __future__ import annotations
import json,os,pathlib,sqlite3,time,uuid,logging
from contextlib import closing

HOOKS=('pre_llm_call','pre_api_request','post_api_request','api_request_error','post_llm_call','pre_tool_call','post_tool_call')
_current={}

def connect():
    settings=json.loads((pathlib.Path(__file__).parent/'settings.json').read_text())
    path=pathlib.Path(settings['database']);path.parent.mkdir(parents=True,exist_ok=True)
    c=sqlite3.connect(path,timeout=2)
    c.execute('pragma journal_mode=wal')
    c.executescript('''create table if not exists activity(id integer primary key,created_at real,event text,profile text,session_id text,task_id text,request_id text,model text,provider text,response_model text,tool text,status text,call_id text);
    create index if not exists activity_task on activity(task_id,id);
    create table if not exists requests(id text primary key,session_id text,profile text,created_at real,dispatch_finished_at real);
    create table if not exists request_tasks(task_id text primary key,request_id text,parent_task_id text,created_at real);
    ''')
    return c

def capture(event,**kw):
    session=str(kw.get('session_id') or '')[:150]
    task=os.environ.get('HERMES_KANBAN_TASK','')
    try:
        from hermes_constants import get_hermes_home
        runtime_home=get_hermes_home()
    except ImportError:
        runtime_home=pathlib.Path(os.environ.get('HERMES_HOME','default'))
    profile=runtime_home.name if runtime_home.parent.name=='profiles' else os.environ.get('HERMES_PROFILE','default')
    with closing(connect()) as c, c:
        request=None
        if task:
            row=c.execute('select request_id from request_tasks where task_id=?',(task,)).fetchone()
            request=row[0] if row else None
        elif event=='pre_llm_call':
            request='req_'+uuid.uuid4().hex[:16];_current[session]=request
            c.execute('insert into requests values(?,?,?,?,null)',(request,session,profile,time.time()))
        else:request=_current.get(session)
        fields=[kw.get(k) for k in ('model','provider','response_model','tool_name','status','api_request_id')]
        fields=[str(v)[:160] if v is not None else None for v in fields]
        c.execute('insert into activity(created_at,event,profile,session_id,task_id,request_id,model,provider,response_model,tool,status,call_id) values(?,?,?,?,?,?,?,?,?,?,?,?)',(time.time(),event,profile,session,task,request,*fields))
        if event=='post_llm_call' and request and not task:
            c.execute('update requests set dispatch_finished_at=? where id=?',(time.time(),request))
        if event=='post_tool_call' and kw.get('tool_name')=='kanban_create' and request:
            result=kw.get('result')
            try:result=json.loads(result) if isinstance(result,str) else result
            except (TypeError,ValueError):result={}
            if isinstance(result,dict):
                child=result.get('task_id') or (result.get('data') or {}).get('task_id')
                if child and str(child).startswith('t_'):
                    c.execute('insert or ignore into request_tasks values(?,?,?,?)',(child,request,task or None,time.time()))

def register(ctx):
    def make_hook(event):
        def hook(**kw):
            try:capture(event,**kw)
            except Exception as exc:logging.getLogger(__name__).warning('Hermes Desk observation failed: %s',type(exc).__name__)
        return hook
    for event in HOOKS:ctx.register_hook(event,make_hook(event))
