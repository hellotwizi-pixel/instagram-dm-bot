(() => {
 const root=document.querySelector('#workflow'); if(!root)return;
 let selected=null, busy=false;
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e};
 function block(title){const box=el('section');box.className='wf-card';box.append(el('h2',title));return box}
 function render(r){
  const detail=document.querySelector('#workflowDetail');detail.replaceChildren();
  detail.append(el('h1',r.request.request_text||'요청 문구 미수집'));
  const u=r.usage;const summary=block('사용량과 확인 상태');
  summary.append(el('p',`실측 ${u.total_tokens.toLocaleString()} 토큰 · 입력 ${u.input_tokens.toLocaleString()} / 출력 ${u.output_tokens.toLocaleString()}`),el('p',`미수집 ${u.missing_calls}건 · ${u.subscription}`));
  for(const gap of r.gaps)summary.append(el('p','확인 필요: '+gap));detail.append(summary);
  const result=block('결과물과 검증');
  for(const e of r.completions)result.append(el('pre',JSON.stringify(e.body,null,2)));
  if(!r.completions.length)result.append(el('p','완료·검증 기록이 아직 없습니다.'));detail.append(result);
  const decisions=block('방향을 바꾼 결정');
  for(const e of r.decisions){const b=e.body;decisions.append(el('h3',`${b.before} → ${b.after}`),el('p',b.reason),el('small',`결정 담당: ${b.owner||e.actor} · 근거 기록: ${b.evidence.map(x=>'#'+x).join(', ')}`))}
  if(!r.decisions.length)decisions.append(el('p','기록된 방향 변경 없음. 없었던 협업을 만들어 표시하지 않습니다.'));detail.append(decisions);
  const used=block('사용한 스킬·도구·선택 이유');used.append(el('p','실제 읽은 스킬: '+(r.skills.join(', ')||'기록 없음')),el('p','호출한 도구: '+(r.tools.join(', ')||'기록 없음')));
  for(const e of r.events.filter(e=>e.kind==='selection'))used.append(el('pre',JSON.stringify(e.body,null,2)));detail.append(used);
  const timeline=block('실제 대화와 작업 기록');
  for(const e of r.events.filter(e=>['handoff','reply','comment','assignment','decision','document','result'].includes(e.kind))){const d=el('details');d.id='wf-event-'+e.id;d.append(el('summary',`#${e.id} · ${e.actor} · ${new Date(e.created_at*1000).toLocaleString()} · ${e.kind}`),el('pre',JSON.stringify(e.body,null,2)));timeline.append(d)}detail.append(timeline);
  const receipts=block('토큰 집계 근거');receipts.append(el('p','캐시와 추론은 입력·출력에 포함됩니다. 두 번 더하지 않습니다.'));
  for(const v of r.receipts)receipts.append(el('p',`${v.profile} / ${v.source} / ${v.model||'모델 미확인'}: ${v.status==='measured'?`${v.input_tokens} + ${v.output_tokens} 토큰`:'미수집'}`));detail.append(receipts);
 }
 async function refresh(){if(busy||root.hidden)return;busy=true;try{const data=await api('workflow');const list=document.querySelector('#workflowList');list.replaceChildren();if(!data.reports.length)list.append(el('p','새 업무의 실제 기록이 쌓이면 여기에 표시됩니다.'));for(const item of data.reports){const button=el('button',item.title||item.id);button.className='wf-request';button.onclick=()=>{selected=item.id;load()};list.append(button)}if(!selected&&data.reports.length)selected=data.reports[0].id;if(selected)await load();document.querySelector('#workflowState').textContent='최근 확인 '+new Date().toLocaleTimeString()}catch(e){document.querySelector('#workflowState').textContent='기록을 읽지 못했습니다: '+e.message}finally{busy=false}}
 async function load(){render(await api('workflow/'+encodeURIComponent(selected)))}
 function open(){document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='workflow');document.body.classList.remove('ecosystem-mode','village-mode');document.querySelectorAll('nav [data-page]').forEach(b=>b.classList.toggle('selected',b.dataset.page==='workflow'));refresh()}
 document.querySelector('[data-page="workflow"]').addEventListener('click',open);
 document.querySelectorAll('[data-workflow-open]').forEach(b=>b.addEventListener('click',open));
 document.querySelector('#workflowRefresh').addEventListener('click',refresh);
 setInterval(refresh,15000);
 if(location.pathname==='/workflow')open();
})();
