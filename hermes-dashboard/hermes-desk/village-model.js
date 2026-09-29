/* Evidence-to-village mapping, shared with the headless regression checks. */
((root,factory)=>{const api=factory();if(typeof module==='object')module.exports=api;else root.VillageModel=api})(typeof window!=='undefined'?window:this,()=>{
 const active=new Set(['running','in_progress','claimed']);
 const places=[
  {key:'golf',aliases:['ace인도어골프'],name:'ACE 인도어골프',subtitle:'그린 클럽하우스',color:'#698d75',x:-11,z:-8},
  {key:'bbq',aliases:['바베큐국립공원'],name:'바베큐국립공원',subtitle:'숲속 바베큐 캠프',color:'#b97c50',x:0,z:-8},
  {key:'haha',aliases:['하하팩토리'],name:'하하팩토리',subtitle:'아이디어 작업장',color:'#d29964',x:11,z:-8},
  {key:'ditalk',aliases:['디토크'],name:'디토크',subtitle:'이야기가 모이는 스튜디오',color:'#c58b92',x:-11,z:5},
  {key:'dmmate',aliases:['dmmate'],name:'DMmate',subtitle:'메시지를 잇는 우체국',color:'#6c99b6',x:0,z:5},
  {key:'aios',aliases:['aios관리','aios개발관리'],name:'AI-OS 관리',subtitle:'마을을 돌보는 관제소',color:'#8c85b5',x:11,z:5}
 ];
 const projectName=p=>String(p.name||'').toLowerCase().replace(/[\s_·-]+/g,'');
 function place(p){return places.find(a=>a.aliases.includes(projectName(p)))}
 function focusSnapshot(snapshot){const projects=places.flatMap(a=>(snapshot?.projects||[]).filter(p=>place(p)===a)),ids=new Set(projects.map(p=>p.id));return {...snapshot,projects,conversations:(snapshot?.conversations||[]).filter(r=>(r.projectIds||[]).some(id=>ids.has(id))).map(r=>({...r,projectIds:r.projectIds.filter(id=>ids.has(id)),projectNames:projects.filter(p=>r.projectIds.includes(p.id)).map(p=>p.name)}))}}
 function villageLayout(projects){return projects.map(p=>{const a=place(p);return {p,x:a.x,z:a.z,style:a}})}
 function state(t){if(t.status==='archived')return 'archived';if(t.status==='done')return 'done';if(t.heartbeatStale||t.progressStale||['blocked','triage'].includes(t.status))return 'attention';if(active.has(t.status))return 'working';return ['todo','ready'].includes(t.status)?'waiting':'unknown'}
 function aggregate(items){if(!items.length)return 'empty';const s=items.map(state);return s.includes('attention')?'attention':s.includes('working')?'working':s.includes('waiting')?'waiting':s.every(x=>x==='done')?'done':'unknown'}
 function view(snapshot,person='all'){
  const requests=(snapshot?.conversations||[]).filter(c=>c.reportable&&(person==='all'||c.requesterKey===person));
  const taskMap=new Map();for(const r of requests)for(const t of r.tasks)if(!taskMap.has(t.id))taskMap.set(t.id,{...t,requestIds:requests.filter(x=>x.tasks.some(y=>y.id===t.id)).map(x=>x.id),projectIds:[...new Set(requests.filter(x=>x.tasks.some(y=>y.id===t.id)).flatMap(x=>x.projectIds))]});
  const tasks=[...taskMap.values()],projects=(snapshot?.projects||[]).map(p=>{const rows=requests.filter(r=>r.projectIds.includes(p.id)),owned=tasks.filter(t=>t.projectIds.includes(p.id));return {...p,requests:rows,tasks:owned,state:aggregate(owned),files:new Set(rows.flatMap(r=>r.attachments||[]).map(a=>a.id)).size}});
  const agents=new Map();for(const t of tasks){if(!t.assignee)continue;if(!agents.has(t.assignee))agents.set(t.assignee,{id:t.assignee,name:t.roleName||t.role||'담당 확인 필요',tasks:[]});agents.get(t.assignee).tasks.push(t)}
  const priority={working:0,attention:1,waiting:2,done:3,archived:4};for(const a of agents.values()){a.tasks.sort((a,b)=>priority[state(a)]-priority[state(b)]||(b.lastProgressAt||0)-(a.lastProgressAt||0));a.state=aggregate(a.tasks);a.station=a.tasks[0]?.projectIds[0]||'unassigned';a.projectIds=[...new Set(a.tasks.flatMap(t=>t.projectIds))]}
  return {requests,tasks,projects,agents:[...agents.values()],working:tasks.filter(t=>state(t)==='working').length,attention:tasks.filter(t=>state(t)==='attention').length,waiting:tasks.filter(t=>state(t)==='waiting').length,done:tasks.filter(t=>state(t)==='done').length,files:new Set(requests.flatMap(r=>r.attachments||[]).map(a=>a.id)).size};
 }
 function createTracker(){let cursor=null;return {reset(){cursor=null},ingest(events,enabled,now,latest=0){events=events||[];const max=Math.max(latest,...events.map(e=>e.id));if(cursor===null){cursor=max;return []}const before=cursor;cursor=Math.max(cursor,max);if(!enabled)return [];return events.filter(e=>e.id>before&&now-e.created_at>=0&&now-e.created_at<=20&&['assigned','claimed','completed','attached'].includes(e.kind))}}}
 return {state,aggregate,view,createTracker,places,place,focusSnapshot,villageLayout};
});
