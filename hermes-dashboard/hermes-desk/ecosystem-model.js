((root,factory)=>{const api=factory(typeof module==='object'?require('./village-model.js'):root.VillageModel);if(typeof module==='object')module.exports=api;else root.EcosystemModel=api})(typeof window!=='undefined'?window:this,V=>{
 const names={working:'작업 중',connected:'연결 유지',blocked:'막힘',quiet:'최근 확인 필요',waiting:'차례 대기',done:'완료',unknown:'미확인',empty:'맡긴 일 없음',recent:'최근 수집',ok:'정상 기록',error:'오류',paused:'일시 중지'};
 function cumulativeCount(source){return source.displayCount??source.count??null}
 function sourceConnected(source,pipeline,now=Date.now()/1000){return source.connection==='connected'&&pipeline?.brain?.readable===true&&Number.isFinite(pipeline.checked)&&now-pipeline.checked>=0&&now-pipeline.checked<40}
 function state(t){if(t.status==='done')return 'done';if(['blocked','crashed','timed_out','gave_up'].includes(t.status))return 'blocked';if(t.heartbeatStale||t.progressStale||t.status==='triage')return 'quiet';if(['running','in_progress','claimed'].includes(t.status))return 'working';if(['todo','ready'].includes(t.status))return 'waiting';return 'unknown'}
 function reason(t){if(['done','archived'].includes(t.status))return '';if(t.reasonBrief)return t.reasonBrief;if(state(t)==='blocked'){const r=t.reason||'';if(/권한|인증|접근|API_KEY/.test(r))return '접근 권한·연결 설정 확인 필요';if(/자료|입력|실기기|테스트 환경|사용자.*승인/.test(r))return '추가 자료·실행 환경 확인 필요';return '진행 중 문제가 생겨 점검 필요'}if(state(t)==='quiet')return '최근 진행 소식이 없어 확인 필요';if(state(t)==='waiting')return t.assignee?'시작 순서를 기다리는 중':'담당 배정 필요';return ''}
 function aggregate(tasks){if(!tasks.length)return 'empty';const states=tasks.map(state);for(const s of ['blocked','quiet','working','waiting','unknown'])if(states.includes(s))return s;return 'done'}
 function build(slack,pipeline,now=Date.now()/1000,offline=false){const view=V.view(V.focusSnapshot(slack||{})),inventory=new Map((slack?.agents||[]).map(a=>[a.id,a]));
  const projects=view.projects.map(p=>{const departments=new Map(),add=(profile,group,task)=>{if(!departments.has(group))departments.set(group,{id:p.id+'::'+group,name:group,agents:[],tasks:[]});const d=departments.get(group);if(profile&&!d.agents.includes(profile))d.agents.push(profile);if(task)d.tasks.push(task)};
   const route=(slack.routes||[]).find(r=>'channel:'+r.chatId===p.id);if(route?.profile&&inventory.has(route.profile))add(route.profile,'업무 조율');
   if(V.place(p)?.key==='aios')for(const a of inventory.values())if(a.group==='AI-OS 관리')add(a.id,'AI-OS 운영');
   for(const t of p.tasks){const a=inventory.get(t.assignee);add(t.assignee,t.assignee===route?.profile?'업무 조율':a?.group||t.group||'전문 담당',t)}
   return {...p,style:V.place(p),state:offline?'unknown':aggregate(p.tasks),completed:p.tasks.filter(t=>t.status==='done').length,departments:[...departments.values()].map(d=>({...d,state:offline?'unknown':aggregate(d.tasks)}))};
  });
  const alerts=projects.flatMap(p=>p.tasks.filter(t=>['blocked','quiet'].includes(state(t))).map(t=>({id:t.id,project:p.id,name:p.name,level:state(t),message:reason(t)||t.shortTitle||t.title})));
  for(const s of pipeline?.sources||[])if(s.state==='quiet')alerts.push({id:'source:'+s.id,source:s.id,name:s.name,level:'quiet',message:s.note});
  for(const j of pipeline?.jobs||[])if(['error','paused','unknown'].includes(j.state))alerts.push({id:'job:'+j.id,job:j.id,name:j.name,level:j.state==='error'?'blocked':'quiet',message:j.state==='error'?'최근 실행 실패':j.state==='paused'?'자동작업 일시 중지':'최근 실행 결과 확인 필요'});
  if(pipeline&&!pipeline.brain.readable)alerts.push({id:'brain',level:'blocked',name:'미미르',message:'저장 기록을 읽지 못함'});
  const reads=(pipeline?.memoryActivity||[]).map(r=>({...r,task:view.tasks.find(t=>t.id===r.taskId)})).filter(r=>r.task).map(r=>({...r,projectId:r.task.projectIds[0]}));
  return {...view,projects,alerts,reads,working:view.tasks.filter(t=>state(t)==='working').length,blocked:view.tasks.filter(t=>state(t)==='blocked').length,quiet:view.tasks.filter(t=>state(t)==='quiet').length,completed:view.tasks.filter(t=>state(t)==='done').length,offline,checked:now};
 }
 function freshTracker(){let seen=null;return {reset(){seen=null},take(items,enabled,now){const keys=new Set(items.map(x=>x.id+':'+(x.state||x.kind||'')));if(seen===null){seen=keys;return []}const fresh=items.filter(x=>!seen.has(x.id+':'+(x.state||x.kind||''))) ;keys.forEach(k=>seen.add(k));if(seen.size>1500)seen=keys;return enabled?fresh.filter(x=>now-(x.at||x.created_at)>=0&&now-(x.at||x.created_at)<30):[]}}}
 return {names,state,reason,aggregate,build,freshTracker,cumulativeCount,sourceConnected};
});
