(()=>{
 'use strict';
 const q=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={attention:'확인 필요',working:'진행 중',waiting:'기다리는 중',recorded_done:'업무 완료',closed_mixed:'일부 보관',conversation:'진행 기록 없음'};
 const states={done:'완료',blocked:'진행 멈춤',triage:'분담 확인',todo:'대기',ready:'시작 대기',running:'진행 중',in_progress:'진행 중',claimed:'시작 준비',archived:'보관'};
 const date=t=>t?new Date(t*1000).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'기록 없음';
 const safeUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='app.slack.com'||u.hostname.endsWith('.slack.com'))?u.href:null}catch{return null}};
 const slackLink=c=>safeUrl(c.url)?`<a class="slack-link" href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer">Slack 대화 열기 ↗</a>`:'<span class="slack-muted">원래 대화 링크 없음</span>';
 const pill=(state,text)=>`<span class="slack-pill ${esc(state)}">${esc(text||labels[state]||states[state]||state)}</span>`;
 let snapshot=null,selected=null,busy=false,activeTab='team',me='';
 try{me=localStorage.getItem('hermesDeskMe')||''}catch{}
 const conversations=()=>snapshot.conversations.filter(c=>c.reportable);
 const title=c=>c.summary||c.title;
 const projectNames=c=>(c.projectNames||['프로젝트 미분류']).join(' · ');
 const role=t=>t.roleName||t.role||'담당 확인 필요';
 const short=t=>t.shortTitle||t.title;
 const hasResults=c=>(c.attachments||[]).length||c.tasks.some(t=>t.result);
 const resultsCount=c=>c.tasks.filter(t=>t.result).length;
 function outcome(c){
   if(c.state==='attention')return c.attentionReasons?.[0]||'멈춘 업무 확인 필요';
   if(c.state==='working'){const roles=[...new Set(c.tasks.filter(t=>['running','in_progress','claimed'].includes(t.status)).map(role))];return roles.length?roles.join(' · ')+' 작업 중':'담당자가 작업 중'}
   if(c.state==='waiting')return c.tasks.find(t=>t.reasonBrief)?.reasonBrief||'담당자가 시작 순서를 기다리는 중';
   if(c.state==='recorded_done')return c.reportedDone===c.done?'등록된 업무 완료 · Slack 보고 확인':'등록된 업무 완료 · Slack 보고 일부 미확인';
   if(c.state==='closed_mixed')return '완료한 업무와 보관한 업무가 섞여 있음';
   return '작업별 진행 기록이 아직 없음';
 }
 function filtered({state=true,project=true}={}){
   const term=q('#slackSearch').value.toLocaleLowerCase(),person=activeTab==='mine'?me:q('#slackPerson').value,pid=q('#slackProject').value;
   return conversations().filter(c=>!(activeTab==='mine'&&!me)&&(person==='all'||c.requesterKey===person)&&(!project||pid==='all'||c.projectIds.includes(pid))&&(!state||q('#slackFilter').value==='all'||c.state===q('#slackFilter').value)&&[title(c),c.requestText,c.channel,c.user,projectNames(c),...c.tasks.map(t=>short(t)+' '+role(t))].join(' ').toLocaleLowerCase().includes(term));
 }
 function options(selector,items,placeholder){const el=q(selector),value=el.value;el.innerHTML=`<option value="${selector==='#slackMe'?'':'all'}">${placeholder}</option>`+items.map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('');if([...el.options].some(o=>o.value===value))el.value=value}
 function renderFilters(){
   const people=new Map(conversations().filter(c=>c.requesterKey!=='unknown').map(c=>[c.requesterKey,c.user||'이름 없는 요청자']));
   options('#slackPerson',[...people,['unknown','요청자 미확인']],'모든 요청자');
   options('#slackMe',[...people],'이름 선택');q('#slackMe').value=people.has(me)?me:'';
   options('#slackProject',snapshot.projects.map(p=>[p.id,p.name]),'모든 프로젝트');
 }
 function filesMarkup(c){return (c.attachments||[]).map(a=>`<button class="slack-file" data-attachment="${esc(a.id)}" data-filename="${esc(a.filename)}" ${a.available?'':'disabled'}><span class="slack-file-icon" aria-hidden="true">▤</span><span><b>${esc(a.filename)}</b><small>${esc(a.roleName)}${a.taskStatus?' · '+esc(states[a.taskStatus]):''} · ${date(a.created_at)}<br>${a.available?'내려받기 ↓':'로컬 파일 없음 · Slack에서 확인'}</small></span></button>`).join('')}
 function reportsMarkup(c){return c.tasks.filter(t=>t.result).map(t=>`<details class="slack-report" data-keep="report:${esc(c.id)}:${esc(t.id)}"><summary><span>${esc(role(t))}</span> ${esc(short(t))}</summary><pre>${esc(t.result)}</pre></details>`).join('')}
 function fileSection(c){const count=(c.attachments||[]).length;return count>6?`<details class="slack-file-folder" data-keep="files:${esc(c.id)}"><summary>▤ 결과 파일 ${count}개 펼치기 ↓</summary><div class="slack-files">${filesMarkup(c)}</div></details>`:`<div class="slack-files">${filesMarkup(c)}</div>`}
 function resultMarkup(c){return `<div class="slack-result-summary">${pill(c.state)}<span>보고 ${resultsCount(c)}개 · 파일 ${(c.attachments||[]).length}개</span></div>${c.state!=='recorded_done'?'<p class="slack-muted">중간 결과 포함 · 남은 업무는 진행 현황에서 확인</p>':''}${fileSection(c)}${reportsMarkup(c)}${hasResults(c)?'':'<p class="slack-empty">아직 연결된 결과물이 없음. Slack 대화에서 답변 확인.</p>'}`}
 function agentFlow(c){
   const groups=new Map(),taskMap=new Map(c.tasks.map(t=>[t.id,t]));
   c.tasks.forEach(t=>{const key=t.assignee||'unassigned';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)});
   return [...groups.values()].map(tasks=>{
     const parents=[...new Set(tasks.flatMap(t=>(t.parents||[]).filter(p=>!tasks.some(x=>x.id===p.id)).map(p=>taskMap.has(p.id)?role(taskMap.get(p.id)):'다른 앞 업무')))];
     return `<article class="slack-role-card"><div class="slack-role-head"><span class="slack-role-icon" aria-hidden="true">◈</span><div><h4>${esc(role(tasks[0]))}</h4><small>${parents.length?'← '+esc(parents.join(' · '))+' 뒤에 연결':'맡은 업무 '+tasks.length+'개'}</small></div><span class="slack-role-count">${tasks.filter(t=>t.status==='done').length}/${tasks.length}</span></div><div class="slack-role-tasks">${tasks.map(t=>`<div class="slack-work-unit"><div>${pill(t.status==='done'?'recorded_done':t.status==='blocked'?'attention':t.status,states[t.status])}<span>${esc(short(t))}</span></div>${t.reasonBrief?`<p class="${t.status==='blocked'?'slack-hold':''}">${esc(t.reasonBrief)}</p>`:''}${t.status==='done'?`<small>${t.completionDelivered?'Slack 완료 보고 확인':'Slack 완료 보고 미확인'}</small>`:''}</div>`).join('')}</div></article>`;
   }).join('');
 }
 function technicalMarkup(t){return `<article class="slack-task"><h4>${esc(short(t))}</h4><p>${esc(role(t))} · ${esc(states[t.status]||t.status)}</p><dl><dt>작업 번호</dt><dd>${esc(t.id)}</dd><dt>에이전트</dt><dd>${esc(t.assignee||'미지정')}</dd><dt>실제 모델</dt><dd>${esc(t.actualModel||'미확인')}</dd><dt>마지막 기록</dt><dd>${date(t.lastProgressAt)}</dd></dl>${t.reason?`<pre>${esc(t.reason)}</pre>`:''}${t.result?`<details data-keep="legacy:${esc(t.id)}"><summary>보고 원문</summary><pre>${esc(t.result)}</pre></details>`:''}</article>`}
 function renderDetail(){const c=snapshot.conversations.find(x=>x.id===selected);q('#slackDetail').innerHTML=c?`
   <div class="slack-detail-head"><div class="slack-detail-meta"><span>${esc(projectNames(c))}</span>${pill(c.state)}</div><h2>${esc(title(c))}</h2><p>${esc(c.user||'요청자 미확인')}의 요청 <span>· ${date(c.lastAt)} 마지막 소식</span></p><div class="slack-original-row"><details class="slack-original" data-keep="original:${esc(c.id)}"><summary>맡긴 내용 확인</summary><p>${esc(c.requestText||'이전 요청 원문이 남아 있지 않음. 아래 업무 제목을 기준으로 표시.')}</p><small>${esc(c.summaryBasis)} · ${esc(c.projectBasis)} · #${esc(c.channel)}</small></details>${slackLink(c)}</div></div>
   <div class="slack-now ${c.state==='attention'?'attention':''}"><span>지금 상황</span><strong>${esc(outcome(c))}</strong>${c.attentionReasons?.length>1?`<ul>${c.attentionReasons.slice(1).map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:''}${c.overlap?.length?'<p>같은 작업 공간에서 여러 업무가 실행 중 · 중복 여부 확인 필요</p>':''}</div>
   <div class="slack-section-title"><h3>누가 나눠서 하고 있나</h3><span>${c.tasks.length?`${c.tasks.length}개 업무 중 ${c.done}개 완료`:'아직 분담 기록 없음'}</span></div>
   <div class="slack-flow">${c.tasks.length?agentFlow(c):'<p class="slack-empty">대화는 확인했지만 담당별 진행 기록은 없음. Slack에서 답변 확인.</p>'}</div>
   <div class="slack-section-title"><h3>무엇이 나왔나</h3><span>보고와 결과 파일</span></div>${resultMarkup(c)}
   <details class="slack-tech" data-keep="technical:${esc(c.id)}"><summary>관리자 점검 정보</summary><p class="slack-note">전송 확인은 이 대화로 보낸 완료 보고 기준.</p>${c.tasks.map(technicalMarkup).join('')}</details>`:'<div class="slack-empty">목록에서 업무를 선택하면 담당별 진행과 결과가 보임.</div>'}
 function renderList(rows){
   if(!rows.some(c=>c.id===selected))selected=rows[0]?.id||null;
   q('#slackList').innerHTML=rows.length?rows.map(c=>`<button class="slack-request ${c.id===selected?'selected':''}" data-request="${esc(c.id)}" aria-pressed="${c.id===selected}"><div><span>${esc(projectNames(c))}</span>${pill(c.state)}</div><h3>${esc(title(c))}</h3><p class="slack-card-person">${esc(c.user||'요청자 미확인')} <span>· ${c.tasks.length?[...new Set(c.tasks.map(t=>t.assignee).filter(Boolean))].length+'명 담당':'분담 기록 없음'}</span></p><p class="slack-card-outcome">${esc(outcome(c))}</p><div class="slack-card-foot"><small>${date(c.lastAt)}</small><small>${(c.attachments||[]).length?'파일 '+c.attachments.length+'개':c.tasks.length?'업무 '+c.done+'/'+c.tasks.length:'분담 기록 없음'}</small></div></button>`).join(''):`<div class="slack-empty">${activeTab==='mine'&&!me?'위에서 내 이름을 선택하면 내가 맡긴 일만 모아서 볼 수 있음.':'조건에 맞는 업무가 없음.'}</div>`;
   renderDetail();
 }
 function renderStats(){const rows=filtered({state:false});q('#slackStats').innerHTML=['working','waiting','attention','recorded_done'].map(s=>`<button data-state="${s}" class="${s} ${q('#slackFilter').value===s?'chosen':''}"><span>${labels[s]}</span><strong>${rows.filter(c=>c.state===s).length}<small>건</small></strong></button>`).join('')}
 function renderProjects(){const rows=filtered({project:false});q('#slackProjects').innerHTML=snapshot.projects.map(p=>{const items=rows.filter(c=>c.projectIds.includes(p.id)),n=s=>items.filter(c=>c.state===s).length,fileCount=new Set(items.flatMap(c=>c.attachments||[]).map(a=>a.id)).size;return `<button class="slack-project ${q('#slackProject').value===p.id?'selected':''}" data-project="${esc(p.id)}"><span>${esc(p.category)}</span><h3>${esc(p.name)}</h3><div class="slack-project-metrics"><b>${items.length}<small>요청</small></b><span>진행 ${n('working')} · 대기 ${n('waiting')}<br>확인 ${n('attention')} · 완료 ${n('recorded_done')}</span></div><p>${items.length?`결과 파일 ${fileCount}개 · 업무 보기 ↘`:'아직 연결된 요청 기록 없음'}</p></button>`}).join('')}
 function renderResults(rows){const items=rows.filter(hasResults);q('#slackResults').innerHTML=items.length?items.map(c=>`<article class="slack-output-card"><div class="slack-detail-meta"><span>${esc(projectNames(c))} · ${esc(c.user||'요청자 미확인')}</span><small>${date(c.lastAt)}</small></div><h3>${esc(title(c))}</h3>${resultMarkup(c)}<div class="slack-output-links"><button class="quiet" data-open-request="${esc(c.id)}">진행 과정 보기 →</button>${slackLink(c)}</div></article>`).join(''):'<div class="slack-empty">이 범위에 연결된 결과물이 아직 없음.</div>'}
 function renderDiagnostics(){
   const s=snapshot,allTasks=[...new Map([...s.conversations.flatMap(c=>c.tasks),...s.unlinked].map(t=>[t.id,t])).values()];
   q('#slackReadiness').innerHTML=s.agents.map(a=>{const tasks=allTasks.filter(t=>t.assignee===a.id),live=s.liveAgents.find(l=>l.profile===a.id);return `<article class="slack-agent"><h3>${esc(a.role)}</h3><p>${esc(a.group)} · ${esc(a.id)}</p><p>${a.brokenSkills?'기능 연결 점검 필요':a.observerReady?'활동 확인 준비됨':'활동 연결 확인 필요'}</p><dl><dt>지정 모델</dt><dd>${esc(a.model)}</dd><dt>최근 응답 모델</dt><dd>${esc(live?.model||tasks.find(t=>t.actualModel)?.actualModel||'미확인')}</dd><dt>마지막 관찰</dt><dd>${date(live?.at)}</dd></dl></article>`}).join('');
   q('#slackUnlinked').innerHTML=s.unlinked.map(technicalMarkup).join('')||'<p>확인이 필요한 기록 없음.</p>';
   const v=s.coverage||{};q('#slackCoverage').textContent=`현재 화면은 원래 대화에 연결된 요청 기준. 이전 업무 ${v.olderUnlinkedTasks||0}개는 요청 연결이 없어 위 집계에서 제외. 내용이 없는 대화·입장 알림 ${v.hiddenConversations||0}개도 제외. 요청자 미확인 ${v.unknownRequesters||0}건은 ‘내가 맡긴 일’에 임의로 넣지 않음. 아래 보고 기록에는 이미 다른 대화에 연결된 업무도 포함될 수 있음.`;
 }
 function keepOpen(fn){const opened=new Set([...q('#slack').querySelectorAll('[data-keep][open]')].map(el=>el.dataset.keep));fn();q('#slack').querySelectorAll('[data-keep]').forEach(el=>{el.open=opened.has(el.dataset.keep)})}
 function renderViews(){if(!snapshot)return;keepOpen(()=>{const rows=filtered();q('#slackMineSetup').hidden=activeTab!=='mine';q('#slackPerson').hidden=activeTab==='mine';q('#slackProjectsView').hidden=activeTab!=='projects';q('#slackRequestsView').hidden=activeTab==='results';q('#slackResultsView').hidden=activeTab!=='results';document.querySelectorAll('[data-slack-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.slackTab===activeTab);el.setAttribute('aria-pressed',el.dataset.slackTab===activeTab)});renderStats();renderList(rows);renderProjects();renderResults(rows);const noProgress=rows.filter(c=>c.state==='conversation').length,older=snapshot.coverage?.olderUnlinkedTasks||0;q('#slackScope').textContent=`${activeTab==='mine'?'내가 맡긴':activeTab==='results'?'결과가 연결된':'선택한 범위의'} 요청 ${activeTab==='results'?rows.filter(hasResults).length:rows.length}건${noProgress?' · 진행 기록 없는 대화 '+noProgress+'건 포함':''}${older?' · 원래 요청을 찾지 못한 이전 업무 '+older+'개는 관리자 점검에서 확인':''}`})}
 function setTab(tab){activeTab=tab;renderViews()}
 q('#slack').addEventListener('click',async e=>{
   const request=e.target.closest('[data-request]'),open=e.target.closest('[data-open-request]'),project=e.target.closest('[data-project]'),stat=e.target.closest('[data-state]'),file=e.target.closest('[data-attachment]');
   if(request){selected=request.dataset.request;renderViews();if(window.innerWidth<=900)q('#slackDetail').scrollIntoView({block:'start',behavior:'auto'})}
   if(open){selected=open.dataset.openRequest;setTab('team');q('#slackDetail').scrollIntoView({block:'start',behavior:'smooth'})}
   if(project){q('#slackProject').value=q('#slackProject').value===project.dataset.project?'all':project.dataset.project;renderViews()}
   if(stat){q('#slackFilter').value=q('#slackFilter').value===stat.dataset.state?'all':stat.dataset.state;renderViews()}
   if(file&&!file.disabled){file.disabled=true;const status=q('#slackDownloadStatus');status.textContent='파일 준비 중…';try{const r=await fetch('/api/attachments/'+encodeURIComponent(file.dataset.attachment),{headers:{'X-Desk-Token':sessionStorage.getItem('hermesDeskToken')}});if(!r.ok){let message='파일을 내려받지 못함';try{message=(await r.json()).error||message}catch{}throw Error(message)}const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=file.dataset.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent=file.dataset.filename+' 내려받기 시작'}catch(err){status.textContent=err.message}finally{file.disabled=false}}
 });
 document.querySelectorAll('[data-slack-tab]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.slackTab)));
 ['slackProject','slackPerson','slackFilter'].forEach(id=>q('#'+id).addEventListener('change',renderViews));q('#slackSearch').addEventListener('input',renderViews);
 q('#slackMe').addEventListener('change',()=>{me=q('#slackMe').value;try{localStorage.setItem('hermesDeskMe',me)}catch{}renderViews()});
 q('#slackReset').addEventListener('click',()=>{q('#slackSearch').value='';['slackProject','slackPerson','slackFilter'].forEach(id=>q('#'+id).value='all');renderViews()});
 async function update(){if(busy||!sessionStorage.getItem('hermesDeskToken'))return;busy=true;try{const r=await fetch('/api/slack',{headers:{'X-Desk-Token':sessionStorage.getItem('hermesDeskToken')}});const body=await r.json();if(!r.ok)throw Error(body.error||'기록 연결 실패');snapshot=body;window.dispatchEvent(new CustomEvent('hermes:slack',{detail:body}));renderFilters();renderViews();keepOpen(renderDiagnostics);q('#slackUpdated').textContent='새 소식 확인 '+date(snapshot.checked);q('#slackError').hidden=!snapshot.errors.length;q('#slackError').textContent=snapshot.errors.length?'일부 기록을 읽지 못해 부분 결과 표시 중. 관리자 점검 필요.':''}catch(e){window.dispatchEvent(new CustomEvent('hermes:slack-error',{detail:e.message}));q('#slackError').hidden=false;q('#slackError').textContent='최근 소식을 가져오지 못함 · 이전 내용일 수 있음. '+e.message;q('#slackUpdated').textContent='연결 확인 필요'}finally{busy=false}}
 window.HermesReport={snapshot:()=>snapshot,openRequest(id){if(!snapshot)return;selected=id;['slackProject','slackPerson','slackFilter'].forEach(key=>q('#'+key).value='all');q('#slackSearch').value='';document.querySelector('nav [data-page="slack"]').click();setTab('team');q('#slackDetail').scrollIntoView({block:'start'});},openProject(id,results=false){if(!snapshot)return;q('#slackProject').value=id||'all';q('#slackPerson').value='all';q('#slackFilter').value='all';q('#slackSearch').value='';document.querySelector('nav [data-page="slack"]').click();setTab(results?'results':'team')}};
 q('#refresh').addEventListener('click',update);setInterval(update,10000);setTimeout(update,700);
})();
