"""Local Hermes control surface. No gateway mutations; user-owned PTY only."""
from __future__ import annotations
import argparse, codecs, datetime, fcntl, hashlib, http.server, json, os, pathlib, pty, re, secrets, shutil, signal, socket, sqlite3, struct, subprocess, tempfile, termios, threading, time, urllib.parse, webbrowser
import yaml
from operations import board_read, read_operations, attach_observations
from slack_operations import read_slack
from reporting import read_attachment
from ecosystem import read_ecosystem

ROOT=pathlib.Path(__file__).resolve().parent
HOME=pathlib.Path.home()/'.hermes'
CLI=pathlib.Path.home()/'.local/bin/hermes'
TOKEN=secrets.token_urlsafe(32)
DATA=ROOT/'local-data'
SLACK_CACHE={'at':0,'value':None}
SLACK_LOCK=threading.Lock()
ECO_CACHE={'at':0,'value':None}
ECO_LOCK=threading.Lock()
LABELS={
 'devpm':('개발팀','업무 접수·분담·검수 조율'),'devcoder':('개발팀','기능 구현·수정·리팩터링'),'devreview':('개발팀','코드 품질·요구사항·보안 검토'),'devqa':('개발팀','실행 검증·시나리오 테스트·버그 재현'),
 'planpm':('기획팀','기획 접수·범위 정리'),'planproduct':('기획팀','제품 방향·우선순위·성공 기준'),'planspec':('기획팀','요구사항·작업 분해·구현 순서'),
 'designpm':('디자인팀','디자인 업무 조율'),'designux':('디자인팀','사용자 여정·화면 흐름·접근성'),'designbrand':('디자인팀','브랜드 방향·톤·비주얼 체계'),
 'mktpm':('마케팅팀','콘텐츠 업무 조율'),'mktwriter':('마케팅팀','콘텐츠 초안 작성'),'mktseo':('마케팅팀','키워드·검색 최적화'),'mktedit':('마케팅팀','구조 편집·문장 다듬기'),
 'adpm':('광고팀','광고 업무 조율'),'adgoogle':('광고팀','Google 광고 계정·전환 점검'),'admeta':('광고팀','Meta 광고 계정·타겟 점검'),'adbudget':('광고팀','예산·입찰·성과 분석'),'adcreative':('광고팀','소재 품질·성과 신호 검토'),'adcopy':('광고팀','광고 문구 작성'),'adpolicy':('광고팀','정책·심사 위험 점검'),
 'oppm':('운영팀','운영 업무 조율'),'opdoc':('운영팀','안내문·기술 문서 작성'),'opcurator':('운영팀','자료 정리·지식 관리'),'opresearch':('운영팀','조사·근거 수집·비교 분석'),
 'legalpm':('법무팀','법무 업무 조율'),'legalcontract':('법무팀','계약 검토·협상 지원'),'legalteam':('법무팀','법률 문서·자문 지원'),
 'secpm':('보안팀','보안 업무 조율'),'secteam':('보안팀','침해 대응·포렌식 지원'),'secsec':('보안팀','취약점·코드 보안 검토'),
 'aiospm':('AI-OS 관리','에이전트 운영 업무 조율'),'aiosops':('AI-OS 관리','운영·배포·권한 관리'),'aiosanalyst':('AI-OS 관리','운영 분석'),'aiosstrat':('AI-OS 관리','도입·운영 전략'),
 'acepm':('프로젝트','ACE 인도어골프 담당'),'councilpm':('프로젝트','AI Council 담당'),'replypm':('프로젝트','DMmate 담당'),'hahapm':('프로젝트','하하팩토리 담당'),'ditalkpm':('프로젝트','디토크 담당'),'bbqpm':('프로젝트','바베큐국립공원 담당'),'rewardpm':('프로젝트','리워드드로우 담당'),'boardpm':('프로젝트','Planning Board 담당'),'openitpm':('프로젝트','바로열기 담당'),'default':('공통','기본 프로필'),'reviewer':('기타','검토 프로필 · 실제 역할 지침 확인 필요')}

def redact(text):
    text=str(text or '')
    text=re.sub(r'\b(?:sk-|xox[baprs]-|gh[pousr]_)[A-Za-z0-9_-]+','[인증정보 숨김]',text)
    return re.sub(r'(?i)(authorization\s*[:=]\s*bearer\s+)\S+',r'\1[숨김]',text)

def config(path):
    if not path.exists():return {}
    d=yaml.safe_load(path.read_text()) or {}
    if not isinstance(d,dict):raise ValueError('설정 형식 확인 필요')
    return d

def _snapshot(path,fn):
    """Copy SQLite and WAL only if both remain stable; never write source DB."""
    if not path.exists():return fn(None)
    wal=pathlib.Path(str(path)+'-wal')
    def stamp(p):
        return (p.stat().st_ino,p.stat().st_size,p.stat().st_mtime_ns) if p.exists() else None
    def wal_header():
        if not wal.exists():return None
        with wal.open('rb') as f:return (wal.stat().st_ino,f.read(32))
    for _ in range(5):
        with tempfile.TemporaryDirectory(prefix='hermes-desk-') as td:
            before=stamp(path);wh=wal_header();size=wal.stat().st_size if wal.exists() else 0
            dest=pathlib.Path(td)/'read.db';shutil.copyfile(path,dest)
            if size:
                with wal.open('rb') as src,open(str(dest)+'-wal','wb') as out:
                    remaining=size
                    while remaining:
                        block=src.read(min(remaining,1024*1024))
                        if not block:break
                        out.write(block);remaining-=len(block)
                if remaining:continue
            # Appending WAL frames is safe. Checkpoint/restart or DB changes require retry.
            if stamp(path)!=before or wal_header()!=wh:continue
            con=sqlite3.connect(dest);con.row_factory=sqlite3.Row
            try:
                if con.execute('pragma quick_check').fetchone()[0]!='ok':continue
                return fn(con)
            finally:con.close()
    raise RuntimeError('기록이 변경 중입니다. 잠시 후 새로고침하세요.')

def snapshot(path,fn):
    if not path.exists():return fn(None)
    for attempt in range(3):
        try:
            with board_read(path) as con:return fn(con)
        except sqlite3.OperationalError:
            if attempt==2:raise RuntimeError('작업 기록을 읽지 못했습니다. 다시 연결 중입니다.')
            time.sleep(.1)


def skill_description(path,cache):
    resolved=str(path.resolve())
    if resolved in cache:return cache[resolved]
    raw=path.read_bytes();body=raw.decode('utf-8',errors='replace');description=''
    if body.startswith('---'):
        parts=body.split('---',2)
        if len(parts)>2:
            try:
                meta=yaml.safe_load(parts[1]) or {}
                if isinstance(meta,dict):description=meta.get('description','')
            except yaml.YAMLError:pass
    result={'name':path.parent.name,'description':redact(' '.join(str(description).split()))[:500],'revision':hashlib.sha256(raw).hexdigest()[:16]}
    cache[resolved]=result
    return result

def inventory():
    base=config(HOME/'config.yaml');routes=base.get('gateway',{}).get('profile_routes',[])
    agents=[];skill_cache={}
    for p in sorted((HOME/'profiles').iterdir()):
        if not p.is_dir():continue
        cfg=config(p/'config.yaml');model=cfg.get('model') or {};model={'default':model} if isinstance(model,str) else model
        skills=[];skill_details=[];broken=0
        folder=p/'skills'
        pending=[folder] if folder.exists() else [];visited=set()
        while pending:
            parent=pending.pop()
            if parent.resolve() in visited:continue
            visited.add(parent.resolve())
            for f in sorted(parent.iterdir()):
                if f.name.startswith('.'):continue
                if f.is_symlink() and not f.exists():broken+=1;continue
                if f.is_dir() and (f/'SKILL.md').is_file():
                    skills.append(f.name)
                    try:skill_details.append(dict(skill_description(f/'SKILL.md',skill_cache),name=f.name))
                    except OSError:pass
                elif f.is_dir():pending.append(f)
        group,role=LABELS.get(p.name,('미분류','역할 확인 필요'))
        agents.append({'id':p.name,'group':group,'role':role,'model':model.get('default','자체 설정 없음'),'provider':model.get('provider','자동 선택'),
          'fallbacks':[{k:x.get(k) for k in ['provider','model']} for x in cfg.get('fallback_providers',[]) or []],
          'channels':[r.get('name','이름 없음') for r in routes if r.get('profile')==p.name and r.get('platform')=='slack'],
          'skills':skills,'skillDetails':skill_details,'brokenSkills':broken,'tools':cfg.get('toolsets',[]), 'mcp':list((cfg.get('mcp_servers',{}) or {}).keys()),'hasRole':(p/'SOUL.md').is_file(),
          'observerReady':'hermes-desk-observer' in cfg.get('plugins',{}).get('enabled',[]) and all((p/'plugins/hermes-desk-observer'/name).is_file() for name in ['plugin.yaml','__init__.py','settings.json'])})
    return {'agents':agents,'model':base.get('model',{}),'fallbacks':[{k:x.get(k) for k in ['provider','model']} for x in base.get('fallback_providers',[])], 'routeCount':len([r for r in routes if r.get('platform')=='slack'])}

def task_state():
    def read(c):
        if c is None:return {'tasks':[],'counts':{},'missing':True}
        counts=dict(c.execute('select status,count(*) from tasks group by status'))
        rows=c.execute("select id,title,assignee,status,created_at,last_heartbeat_at,block_kind,model_override,provider_override,last_failure_error from tasks order by case when status in ('done','archived') then 1 else 0 end, created_at desc limit 500").fetchall()
        tasks=[]
        for row in rows:
            d=dict(row);d['title']=redact(d['title']);d['last_failure_error']=redact(d['last_failure_error'])[:400]
            d['parents']=[dict(x) for x in c.execute('select t.id,t.status,t.assignee from task_links l join tasks t on t.id=l.parent_id where l.child_id=?',(row['id'],))]
            e=c.execute('select created_at,kind from task_events where task_id=? order by id desc limit 1',(row['id'],)).fetchone();d['lastEvent']=dict(e) if e else None
            d['subscriptions']=c.execute('select count(*) from kanban_notify_subs where task_id=?',(row['id'],)).fetchone()[0]
            s=c.execute('select profile,status,summary,ended_at from task_runs where task_id=? order by id desc limit 1',(row['id'],)).fetchone()
            d['result']=redact(s['summary'])[:4000] if s else '';tasks.append(d)
        return {'tasks':tasks,'counts':counts,'missing':False}
    return snapshot(HOME/'kanban.db',read)

def status():
    out={'checked':time.time(),'errors':[]}
    health_file=ROOT/'model-health.json'
    if health_file.exists():
        try:out['modelChecks']=json.loads(health_file.read_text())
        except (OSError,ValueError):pass
    for fn in [inventory,task_state]:
        try:out.update(fn())
        except Exception as e:out['errors'].append(type(e).__name__+': '+str(e)[:180])
    p=HOME/'logs/watchdog.log'
    if p.exists():
        with p.open('rb') as f:f.seek(max(0,p.stat().st_size-10000));lines=f.read().decode(errors='replace').splitlines()
        out['watchdog']=redact(lines[-1]) if lines else '기록 없음'
        out['watchdogAge']=max(0,time.time()-p.stat().st_mtime)
    out['note']='설정·기록 기준입니다. 모델 실호출·Slack 최종 전달 성공은 별도 검증이 필요합니다.'
    return out

class Terminal:
    def __init__(self):
        self.lock=threading.RLock();self.proc=None;self.fd=None;self.output='';self.started=None;self.profile=None;self.finished=None;self.exitcode=None
        self.sessionPrefix=secrets.token_hex(4)
    def launch(self,argv,profile,cwd,prompt=None):
        with self.lock:
            if self.fd is not None:raise ValueError('실행 중입니다. 아래 응답 입력을 쓰거나 완료 후 새 명령을 보내세요.')
            master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0))
            env=dict(os.environ,TERM='dumb',NO_COLOR='1',PYTHONUNBUFFERED='1');env.pop('HERMES_YOLO_MODE',None)
            try:self.proc=subprocess.Popen(argv,stdin=slave,stdout=slave,stderr=slave,cwd=cwd,env=env,start_new_session=True,close_fds=True)
            except Exception:os.close(master);raise
            finally:os.close(slave)
            self.fd=master;self.profile=profile;self.started=time.time();self.finished=None;self.exitcode=None
            self.output+=f'\n━━ {profile} · {datetime.datetime.now():%H:%M:%S} ━━\n'
            proc=self.proc;threading.Thread(target=self._read,args=(master,proc,prompt),daemon=True).start()
    def _read(self,fd,proc,prompt):
        decoder=codecs.getincrementaldecoder('utf-8')('replace')
        try:
            while True:
                chunk=os.read(fd,8192)
                if not chunk:break
                with self.lock:self.output=(self.output+decoder.decode(chunk))[-250000:]
        except OSError:pass
        finally:
            proc.wait()
            with self.lock:
                self.exitcode=proc.returncode;self.finished=time.time();self.fd=None
            os.close(fd)
            if prompt:pathlib.Path(prompt).unlink(missing_ok=True)
    def start(self,profile,prompt):
        ids={x['id'] for x in inventory()['agents']}
        if profile not in ids:raise ValueError('설치된 프로필을 선택하세요.')
        if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>30000:raise ValueError('명령은 1~30,000자로 입력하세요.')
        DATA.mkdir(exist_ok=True,mode=0o700)
        fd,path=tempfile.mkstemp(prefix='prompt-',suffix='.txt',dir=DATA)
        with os.fdopen(fd,'w') as f:f.write(prompt)
        argv=[str(CLI),'--profile',profile,'chat','--cli','--continue','hermes-desk-'+self.sessionPrefix+'-'+profile,'--create-if-missing','--query-file',path]
        try:self.launch(argv,profile,str(ROOT),path)
        except Exception:pathlib.Path(path).unlink(missing_ok=True);raise
    def reply(self,text):
        if not isinstance(text,str) or len(text)>4000 or any(ord(x)<32 and x not in '\n\t' for x in text):raise ValueError('응답 입력 형식을 확인하세요.')
        with self.lock:
            if self.fd is None or not self.proc or self.proc.poll() is not None:raise ValueError('현재 응답을 받을 실행이 없습니다.')
            os.write(self.fd,(text+'\n').encode())
    def interrupt(self):
        with self.lock:
            if self.proc and self.proc.poll() is None:os.killpg(self.proc.pid,signal.SIGINT)
    def view(self):
        with self.lock:
            clean=re.sub(r'\x1b\][^\x07]*(?:\x07|\x1b\\)','',self.output)
            clean=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',clean)
            clean=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]','',clean)
            return {'running':bool(self.proc and self.proc.poll() is None),'profile':self.profile,'started':self.started,'finished':self.finished,'exitcode':self.exitcode,'output':redact(clean)}
TERM=Terminal()

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def valid_host(self):return self.headers.get('Host') in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}']
    def send(self,code,data,kind='application/json; charset=utf-8'):
        raw=json.dumps(data,ensure_ascii=False).encode() if kind.startswith('application/json') else data
        self.send_response(code);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");self.end_headers();self.wfile.write(raw)
    def authorized(self):return self.valid_host() and secrets.compare_digest(self.headers.get('X-Desk-Token',''),TOKEN)
    def do_GET(self):
        if not self.valid_host():return self.send(403,{'error':'허용되지 않은 주소'})
        p=urllib.parse.urlparse(self.path).path
        if p=='/api/connect':
            if self.headers.get('X-Desk-Bootstrap')!='1' or self.headers.get('Sec-Fetch-Site') not in (None,'same-origin'):
                return self.send(403,{'error':'허용되지 않은 연결 요청'})
            origin=self.headers.get('Origin')
            if origin and origin not in [f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}']:
                return self.send(403,{'error':'허용되지 않은 연결 요청'})
            return self.send(200,{'token':TOKEN})
        if p=='/mimir-core-v3.png':return self.send(200,(ROOT/'mimir-core-v3.png').read_bytes(),'image/png')
        if p in ['/workflow-view.js','/workflow-view.css','/office.js','/office.css','/slack.js','/slack.css','/village-engine.js','/village-model.js','/village.js','/village.css','/ecosystem.js','/ecosystem.css','/ecosystem-model.js','/ecosystem-engine.js']:
            return self.send(200,(ROOT/p[1:]).read_bytes(),('text/javascript' if p.endswith('.js') else 'text/css')+'; charset=utf-8')
        if p in ['/','/workflow','/app.js','/style.css','/capabilities.js']:
            name={'/workflow':'index.html','/':'index.html','/app.js':'app.js','/style.css':'style.css','/capabilities.js':'capabilities.js'}[p];kind={'/workflow':'text/html','/':'text/html','/app.js':'text/javascript','/style.css':'text/css','/capabilities.js':'text/javascript'}[p]
            return self.send(200,(ROOT/name).read_bytes(),kind+'; charset=utf-8')
        if not self.authorized():return self.send(403,{'error':'전용 실행 파일로 화면을 다시 열어주세요.'})
        if re.fullmatch(r'/api/attachments/[0-9]+',p):
            try:
                name,raw=read_attachment(HOME,int(p.rsplit('/',1)[1]))
                self.send_response(200)
                self.send_header('Content-Type','application/octet-stream')
                self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+urllib.parse.quote(name,safe=''))
                self.send_header('Content-Length',str(len(raw)))
                self.send_header('Cache-Control','no-store')
                self.send_header('X-Content-Type-Options','nosniff')
                self.send_header('Content-Security-Policy',"sandbox; default-src 'none'")
                self.end_headers();self.wfile.write(raw)
                return
            except (OSError,ValueError):return self.send(404,{'error':'파일을 내려받을 수 없음. Slack 원래 대화에서 확인.'})
        if p=='/api/workflow' or p.startswith('/api/workflow/'):
            reports=DATA/'workflow-reports'
            if p=='/api/workflow':
                items=[]
                paths=sorted(reports.glob('req_*/report.json'),key=lambda x:x.stat().st_mtime,reverse=True)[:100]
                for path in paths:
                    try:
                        report=json.loads(path.read_text())
                        items.append({'id':report['request']['id'],'title':report['request'].get('request_text'),'at':report.get('generated_at')})
                    except (OSError,ValueError,KeyError):continue
                return self.send(200,{'reports':items})
            rid=p.rsplit('/',1)[1]
            if not re.fullmatch(r'req_[a-f0-9]{16,24}',rid):return self.send(404,{'error':'없는 업무'})
            try:return self.send(200,json.loads((reports/rid/'report.json').read_text()))
            except (OSError,ValueError):return self.send(404,{'error':'아직 생성되지 않은 보고서'})
        if p=='/api/slack':
            try:
                with SLACK_LOCK:
                    if time.time()-SLACK_CACHE['at']>10:
                        ops=read_operations(HOME,LABELS,redact)
                        try:attach_observations(ops,DATA/'observations.db')
                        except Exception:ops['liveAgents']=[]
                        routes=[r for r in config(HOME/'config.yaml').get('gateway',{}).get('profile_routes',[]) if r.get('platform')=='slack']
                        out=read_slack(HOME,ops,routes,redact)
                        out['agents']=inventory()['agents']
                        out['routes']=[{'name':r.get('name'),'profile':r.get('profile'),'chatId':r.get('chat_id')} for r in routes]
                        SLACK_CACHE.update(at=time.time(),value=out)
                    return self.send(200,SLACK_CACHE['value'])
            except Exception as e:return self.send(503,{'error':redact(str(e))[:250]})
        if p=='/api/operations':
            try:
                query=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query);after=int(query['after'][0]) if 'after' in query else None
                out=read_operations(HOME,LABELS,redact,after)
                activation=DATA/'activation.json'
                if activation.exists():
                    note=json.loads(activation.read_text())
                    try:
                        runtime=json.loads((HOME/'gateway_state.json').read_text())
                        note['restartRequired']=runtime.get('pid')==note['previousPid'] or not runtime.get('pid')
                    except (OSError,ValueError):pass
                    out['activation']=note
                try:attach_observations(out,DATA/'observations.db')
                except Exception as exc:out['observer']={'available':False,'error':redact(str(exc))[:150]}
                return self.send(200,out)
            except Exception as e:return self.send(503,{'error':redact(str(e))[:250]})
        if p=='/api/ecosystem':
            with ECO_LOCK:
                if time.time()-ECO_CACHE['at']>12:
                    ECO_CACHE.update(at=time.time(),value=read_ecosystem(HOME,DATA))
                return self.send(200,ECO_CACHE['value'])
        if p=='/api/status':return self.send(200,status())
        if p=='/api/terminal':return self.send(200,TERM.view())
        self.send(404,{'error':'없는 경로'})
    def do_POST(self):
        origin=self.headers.get('Origin')
        if not self.authorized() or origin not in [f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}']:return self.send(403,{'error':'허용되지 않은 요청'})
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<1 or n>130000:raise ValueError('입력이 너무 큽니다.')
            if not self.headers.get('Content-Type','').startswith('application/json'):raise ValueError('입력 형식 오류')
            d=json.loads(self.rfile.read(n))
            if not isinstance(d,dict):raise ValueError('입력 형식 오류')
            path=urllib.parse.urlparse(self.path).path
            if path=='/api/start':TERM.start(d.get('profile'),d.get('prompt'))
            elif path=='/api/reply':TERM.reply(d.get('text'))
            elif path=='/api/interrupt':TERM.interrupt()
            else:return self.send(404,{'error':'없는 경로'})
            self.send(200,TERM.view())
        except (ValueError,OSError,TypeError) as e:self.send(400,{'error':redact(str(e))[:200]})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=0);parser.add_argument('--no-open',action='store_true');a=parser.parse_args()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',a.port),Handler)
    url=f'http://127.0.0.1:{server.server_port}/#{TOKEN}'
    DATA.mkdir(exist_ok=True,mode=0o700)
    path=DATA/'connection.json';fd=os.open(path,os.O_CREAT|os.O_WRONLY|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as f:json.dump({'url':url,'pid':os.getpid(),'port':server.server_port},f)
    print(f'Hermes Desk 실행 중 · 포트 {server.server_port} · 이 창을 닫으면 연결이 끝납니다.',flush=True)
    if not a.no_open:webbrowser.open(url)
    try:server.serve_forever()
    finally:server.server_close()
if __name__=='__main__':main()
