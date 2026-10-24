(() => {
  'use strict';
  const { data: plan, diagnostics } = JSON.parse(document.getElementById('plan-data').textContent);
  const labels = {not_started:'Not started', on_track:'On track', at_risk:'At risk', blocked:'Blocked', done:'Done', unknown:'Unknown'};
  const kinds = {requires:'Requires', enables:'Enables', relates_to:'Related'};
  const colours = ['#4f7d7b','#5c926d','#8b6d8e','#b58535','#648191','#8b9163'];
  const byId = Object.fromEntries(plan.milestones.map(m => [m.id,m]));
  const teams = Object.fromEntries(plan.teams.map(t => [t.id,t.name]));
  const streams = Object.fromEntries(plan.streams.map(s => [s.id,s.title]));
  const periods = Object.fromEntries(plan.periods.map(p => [p.id,p]));
  const epicKeys = [...new Set(plan.milestones.flatMap(m => m.epic_ids))];
  const filters = {search:'',stream:'',team:'',status:'',tag:'',period:'',epic:''};
  const display = {counts:false, filters:false, health:false, summary:false};
  const state = {view:plan.view.default_audience, showDeps:plan.view.show_dependencies, selected:null, filters};
  let lastFocus = null, observer = null, drawScheduled = false, graphSignature = null, graphGeometry = null, graphRoutes = new Map();
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateLabel = (date, year = true) => {
    if (!date) return 'Not provided';
    const [y,m,d] = date.split('-');
    return `${Number(d)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]}${year ? ` ${y}` : ''}`;
  };
  const badge = status => `<span class="badge status-${escape(status)}"><span class="dot" aria-hidden="true"></span>${escape(labels[status] || status)}</span>`;
  const count = (items, status) => items.filter(m => m.status === status).length;
  const milestoneButton = id => `<button class="text-button" type="button" data-open="${escape(id)}">${escape(byId[id].title)}</button>`;
  const teamNames = m => [m.owner_team, ...(m.contributing_teams || [])].filter(Boolean).map(id => teams[id]);
  const activeFilters = () => Object.values(state.filters).some(Boolean);

  function matches(m) {
    const f = state.filters;
    const searchable = [m.id,m.title,m.outcome || '',m.notes || '',...m.epic_ids,...teamNames(m)].join(' ').toLowerCase();
    return (!f.search || searchable.includes(f.search.toLowerCase())) &&
      (!f.stream || m.stream === f.stream) &&
      (!f.team || [m.owner_team,...(m.contributing_teams || [])].includes(f.team)) &&
      (!f.status || m.status === f.status) && (!f.tag || m.tag === f.tag) &&
      (!f.period || m.target_period === f.period) && (!f.epic || m.epic_ids.includes(f.epic));
  }
  function visibleMilestones() {
    return plan.milestones.filter(m => matches(m) && (state.view !== 'executive' || m.executive_visible));
  }
  function card(m, compact = false) {
    const selected = state.selected === m.id ? ' selected' : '';
    const linked = state.selected && plan.dependencies.some(e => (e.from === state.selected && e.to === m.id) || (e.to === state.selected && e.from === m.id));
    const epic = m.epic_ids.length ? `${m.epic_ids[0]}${m.epic_ids.length > 1 ? ` +${m.epic_ids.length-1}` : ''}` : 'No epic';
    return `<button type="button" class="milestone${compact ? ' graph-node' : ''}${selected}${linked ? ' connected' : ''}" data-id="${escape(m.id)}" aria-label="${escape(`${m.title}, ${labels[m.status]}, ${periods[m.target_period].label}. Open details`)}">
      <span class="milestone-top">${badge(m.status)}<span class="scope-tag ${m.tag}">${escape(m.tag)}</span></span>
      <span class="milestone-title">${escape(m.title)}</span>
      ${compact ? '' : `<span class="milestone-outcome">${escape(m.outcome || 'Outcome not provided.')}</span>`}
      <span class="milestone-bottom"><span class="team-name">${escape(compact ? (m.target_date ? dateLabel(m.target_date,false) : periods[m.target_period].label) : (teams[m.owner_team] || 'Owner unassigned'))}</span><span class="epic-count">${escape(epic)}</span></span>
    </button>`;
  }
  function statusLegend() {
    return `<div class="legend"><span class="legend-label">STATUS</span>${Object.keys(labels).filter(s => s !== 'unknown').map(s => `<span class="legend-item">${badge(s)}</span>`).join('')}<span class="legend-label">CONNECTIONS</span>${Object.keys(kinds).map(k => `<span class="legend-item"><span class="legend-line ${k}"></span>${escape(kinds[k])}</span>`).join('')}</div>`;
  }
  function board(items, executive = false) {
    if (!plan.periods.length || !plan.streams.length) return `<div class="board-section empty-state"><h2>Your roadmap starts here</h2><p>Add periods with start/end dates, streams, and milestones to plan.yaml, then run Update.</p></div>`;
    const heads = plan.periods.map(p => `<div class="board-head-cell">${escape(p.label)}${plan.plan.as_of && p.start <= plan.plan.as_of && p.end >= plan.plan.as_of ? '<span class="period-now">CURRENT</span>' : ''}<span class="period-dates">${dateLabel(p.start,false)} — ${dateLabel(p.end)}</span></div>`).join('');
    const rows = plan.streams.map((stream,i) => {
      const streamItems=items.filter(m=>m.stream===stream.id);
      return `<section class="graph-lane" data-stream="${escape(stream.id)}" aria-label="${escape(stream.title)}" style="--stream-color:${colours[i%colours.length]}"><h3 class="stream-label"><span class="stream-dot"></span>${escape(stream.title)}<span class="stream-count">${streamItems.length}</span></h3>${streamItems.length ? '' : '<span class="lane-empty">No milestones in this view</span>'}</section>`;
    }).join('');
    const visible = new Set(items.map(m => m.id));
    const printLinks = plan.dependencies.filter(e => visible.has(e.from) || visible.has(e.to));
    return `<section class="board-section" aria-label="${executive ? 'Strategic milestones' : 'Delivery roadmap'}">
      <div class="board-scroll" id="board-scroll" role="region" aria-label="Roadmap timeline" tabindex="0"><div class="roadmap" id="roadmap" style="--cols:${plan.periods.length}"><div class="board-head">${heads}</div>${rows}${items.map(m=>card(m,true)).join('')}<svg class="dependency-layer" id="dependency-layer" aria-hidden="true"></svg></div></div>
      <div class="print-roadmap" aria-hidden="true">${items.map(m=>`<article><p>${escape(streams[m.stream])} · ${escape(periods[m.target_period].label)}</p>${card(m)}</article>`).join('')}</div>
      ${statusLegend()}<div class="print-dependencies"><strong>Dependencies (including linked milestones outside this view)</strong>${printLinks.map(e => `<div>${escape(byId[e.from].title)} ${e.kind === 'relates_to' ? '↔' : '→'} ${escape(byId[e.to].title)} · ${escape(kinds[e.kind])}</div>`).join('')}</div></section>`;
  }
  function reportingLinks(ids) {
    return ids.length ? `<div class="report-links">${ids.map(milestoneButton).join(' · ')}</div>` : '';
  }
  function executive(items) {
    const r = plan.reporting;
    const risks = r.risks || [], decisions = r.decisions_needed || [];
    const highlights = r.highlights || [], changes = r.changes_since_last_report || [];
    const decisionItem = item => `<li><strong>${escape(item.title)}</strong><span class="report-meta">${escape(item.owner)} · ${dateLabel(item.due_date)} · ${escape(item.status)}</span><p class="report-note">${escape(item.ask)}</p>${reportingLinks(item.milestone_ids)}</li>`;
    const exceptions = plan.milestones.filter(m => ['at_risk','blocked'].includes(m.status));
    const outside = exceptions.filter(m => !m.executive_visible).length;
    return `<div class="exec-grid">
      <section class="report-card"><div class="eyebrow">01 / PROGRAMME BRIEF</div><h2>Progress worth knowing</h2><ul class="report-list">${highlights.length ? highlights.map(x => `<li>${escape(x)}</li>`).join('') : '<li>Highlights not provided.</li>'}</ul><h2 style="margin-top:22px">Since the last report</h2><ul class="report-list">${changes.length ? changes.map(x => `<li>${escape(x)}</li>`).join('') : '<li>Changes not provided.</li>'}</ul><p>Reporting owner: ${escape(plan.plan.reporting_owner || 'Not provided')}</p></section>
      <section class="report-card risks"><div class="eyebrow">02 / RISKS TO MANAGE</div><h2>${risks.length} programme risk${risks.length === 1 ? '' : 's'}</h2><ul class="report-list">${risks.length ? risks.map(item => `<li><strong>${escape(item.title)}</strong><span class="report-meta">${escape(item.severity.toUpperCase())} · ${escape(item.owner)}</span><p class="report-note">${escape(item.mitigation)}</p>${reportingLinks(item.milestone_ids)}</li>`).join('') : '<li>No risks recorded.</li>'}</ul></section>
      <section class="report-card decisions"><div class="eyebrow">03 / DECISIONS NEEDED</div><h2>${decisions.filter(x => x.status === 'open').length} open decision${decisions.filter(x => x.status === 'open').length === 1 ? '' : 's'}</h2><ul class="report-list">${decisions.filter(x => x.status === 'open').map(decisionItem).join('') || '<li>No open decisions recorded.</li>'}</ul>${decisions.some(x => x.status === 'resolved') ? `<details style="margin-top:18px"><summary class="report-meta">Resolved decisions</summary><ul class="report-list">${decisions.filter(x => x.status === 'resolved').map(decisionItem).join('')}</ul></details>` : ''}</section>
      </div><details class="exception-panel" ${exceptions.length ? 'open' : ''}><summary>${exceptions.length} delivery exception${exceptions.length === 1 ? '' : 's'} across the full plan${outside ? ` · ${outside} outside the executive roadmap` : ''}</summary><div class="exception-items">${exceptions.map(m => `<span>${badge(m.status)} ${milestoneButton(m.id)}</span>`).join('') || 'No milestones are marked At risk or Blocked.'}</div><p class="report-note">This exception list covers the full plan, regardless of filters.</p></details>${board(items,true)}`;
  }
  function epicView(items) {
    const group = (key, entries) => {
      const owners = [...new Set(entries.flatMap(teamNames))];
      const breakdown = Object.keys(labels).filter(status => count(entries,status)).map(status => `<span class="badge status-${status}">${count(entries,status)} ${escape(labels[status])}</span>`).join('');
      return `<details class="epic-group"><summary><span class="epic-name"><span class="epic-chevron" aria-hidden="true">›</span>${escape(key || 'Milestones without an epic')}</span><span class="epic-teams">Milestone teams: ${escape(owners.join(', ') || 'Unassigned')}<br>${entries.filter(m => m.tag === 'planned').length} planned · ${entries.filter(m => m.tag === 'unplanned').length} unplanned</span><span class="epic-summary">${breakdown}<span class="epic-mini-count">${entries.length} milestone${entries.length === 1 ? '' : 's'}</span></span></summary><div class="epic-milestones">${entries.map(m => `<div class="epic-milestone-wrap"><span class="period-dates">${escape(periods[m.target_period].label)} · ${escape(streams[m.stream])}</span>${card(m)}</div>`).join('')}</div></details>`;
    };
    const groups = epicKeys.map(key => [key,items.filter(m => m.epic_ids.includes(key))]).filter(([,items]) => items.length).filter(([key]) => !state.filters.epic || key === state.filters.epic);
    const unlinked = items.filter(m => !m.epic_ids.length);
    return `<section class="board-section"><div class="epic-intro"><div><h2 class="section-title">The backlog behind the plan</h2><p>${groups.length} epic group${groups.length === 1 ? '' : 's'} · ${items.length} unique milestone${items.length === 1 ? '' : 's'} · Derived directly from milestone keys</p></div><button type="button" class="button" id="expand-epics">Expand all</button></div>${groups.map(([key,entries]) => group(key,entries)).join('')}${unlinked.length ? group('',unlinked) : ''}${!groups.length ? `<div class="empty-state">${unlinked.length ? 'No epic associations in this selection. Milestones without an epic are listed above.' : 'No milestones match these filters.'}</div>` : ''}<div class="legend">Milestones may appear under multiple epics. Totals count unique milestones. Statuses describe delivery milestones, not live tracker state.</div></section>`;
  }
  function resetFilters() {
    Object.keys(filters).forEach(key => {filters[key]='';$(`filter-${key}`).value='';});
  }
  function applyDisplay() {
    for (const [key,id] of Object.entries({counts:'metrics',filters:'filters',health:'health-card',summary:'plan-summary'})) {
      $(id).hidden=!display[key];
      $(`display-${key}`).checked=display[key];
    }
    // Never conceal an active filter or selection when optional panels are hidden.
    $('filter-summary').hidden=!display.filters && !activeFilters() && !state.selected;
    $('result-context').hidden=$('filter-summary').hidden && !state.selected;
    requestDraw();
  }
  function render() {
    if (observer) observer.disconnect();
    graphSignature=null;graphRoutes.clear();
    const items = visibleMilestones();
    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === state.view;
      button.setAttribute('aria-selected',String(active));button.tabIndex = active ? 0 : -1;
    });
    $('view-content').setAttribute('aria-labelledby',`tab-${state.view}`);
    const f = Object.entries(filters).filter(([,v]) => v).map(([k,v]) => `${k}: ${k === 'team' ? teams[v] : k === 'stream' ? streams[v] : k === 'status' ? labels[v] : k === 'period' ? periods[v].label : v}`);
    $('filter-summary').innerHTML = `<span><strong>${items.length}</strong> ${state.view === 'executive' ? 'executive ' : ''}milestone${items.length === 1 ? '' : 's'} shown <span aria-hidden="true">·</span> ${plan.milestones.length} in the full plan${f.length ? ` <span aria-hidden="true">/</span> ${escape(f.join(' · '))} <button class="text-button" id="clear-active-filters" type="button">Clear filters</button>` : ''}</span><span id="selection-summary">${state.selected ? `Selected: ${escape(byId[state.selected].title)}` : 'All dates and statuses are as reported'}</span>`;
    if ($('clear-active-filters')) $('clear-active-filters').addEventListener('click',()=>{resetFilters();render();$('view-content').focus({preventScroll:true});});
    const draft = !plan.plan.as_of || !plan.periods.length || !plan.streams.length || !plan.milestones.length;
    $('view-content').innerHTML = (draft ? '<div class="draft-banner"><strong>Draft plan</strong> · Complete the reporting date, periods, streams, and milestones before publishing.</div>' : '') + (state.view === 'executive' ? executive(items) : state.view === 'backlog_epic' ? epicView(items) : board(items));
    $('show-dependencies').checked=state.showDeps;
    $('clear-selection').hidden=!state.selected;
    if ($('expand-epics')) $('expand-epics').addEventListener('click',event=>{
      const details=[...document.querySelectorAll('.epic-group')];const expand=details.some(d=>!d.open);details.forEach(d=>d.open=expand);event.target.textContent=expand?'Collapse all':'Expand all';
    });
    if ($('roadmap')) {
      observer = new ResizeObserver(requestDraw);observer.observe($('board-scroll'));
      document.querySelectorAll('.graph-node').forEach(el=>observer.observe(el));
      $('board-scroll').addEventListener('scroll',requestDraw,{passive:true});
    }
    applyDisplay();
  }
  function requestDraw() {
    if (drawScheduled) return;
    drawScheduled=true;requestAnimationFrame(()=>{drawScheduled=false;drawDependencies();});
  }
  function drawDependencies() {
    const svg=$('dependency-layer'), root=$('roadmap');if (!svg || !root) return;
    root.classList.toggle('has-selection',Boolean(state.selected));
    const elements=[...root.querySelectorAll('.graph-node')];
    const heights=Object.fromEntries(elements.map(el=>[el.dataset.id,el.offsetHeight]));
    const width=$('board-scroll').clientWidth;
    const signature=JSON.stringify([width,heights]);
    if(signature!==graphSignature){
      graphSignature=signature;graphRoutes.clear();
      graphGeometry=PlannerGraph.layout(plan.periods,plan.streams,visibleMilestones(),heights,width,plan.dependencies);
      root.style.width=`${graphGeometry.width}px`;root.style.height=`${graphGeometry.height}px`;
      for(const node of graphGeometry.nodes){const el=elements.find(el=>el.dataset.id===node.id);el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;}
      root.querySelectorAll('.graph-lane').forEach((el,i)=>{el.style.top=`${graphGeometry.lanes[i].y}px`;el.style.height=`${graphGeometry.lanes[i].height}px`;});
    }
    svg.setAttribute('width',String(graphGeometry.width));svg.setAttribute('height',String(graphGeometry.height));
    svg.innerHTML='<defs><marker id="dep-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4f7d7b"/></marker></defs>';
    if (!state.showDeps && !state.selected) return;
    const nodes=new Map(graphGeometry.nodes.map(n=>[n.id,n]));
    for (const edge of plan.dependencies) {
      const focused=edge.from===state.selected || edge.to===state.selected;
      if (!state.showDeps && !focused) continue;
      const from=nodes.get(edge.from),to=nodes.get(edge.to);if(!from||!to) continue;
      const key=JSON.stringify([edge.from,edge.to]);
      if(!graphRoutes.has(key))graphRoutes.set(key,PlannerGraph.path(PlannerGraph.route(from,to,graphGeometry.nodes,graphGeometry.width,graphGeometry.height)));
      const d=graphRoutes.get(key);if(!d)continue;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',d);path.setAttribute('class',`dependency-path ${edge.kind}${focused?' selected-edge':''}`);
      path.dataset.from=edge.from;path.dataset.to=edge.to;
      if(edge.kind!=='relates_to')path.setAttribute('marker-end','url(#dep-arrow)');
      svg.append(path);
    }
  }
  function detail(id) {
    const m=byId[id];if(!m)return;
    if (!$('milestone-dialog').open) lastFocus=document.activeElement;
    state.selected=id;
    if ($('clear-selection')) $('clear-selection').hidden=false;
    $('selection-summary').textContent=`Selected: ${m.title}`;
    applyDisplay();
    const visible=new Set(visibleMilestones().map(m=>m.id));
    const relations=plan.dependencies.filter(e=>e.from===id||e.to===id);
    const relationships=relations.map(e=>{
      const outgoing=e.from===id,other=outgoing?e.to:e.from;
      const label=e.kind==='relates_to'?'Related milestone':e.kind==='requires'?(outgoing?'Required by':'Requires completion of'):(outgoing?'Enables':'Enabled by');
      return `<div class="relationship"><div class="relationship-label">${escape(label)}</div>${milestoneButton(other)} ${badge(byId[other].status)}${!visible.has(other)?'<div class="hidden-hint">Outside the current view or filters</div>':''}${e.note?`<p>${escape(e.note)}</p>`:''}</div>`;
    }).join('');
    $('detail-content').innerHTML=`<div class="detail-head"><button type="button" class="close-detail" id="close-detail" aria-label="Close milestone details">×</button>${badge(m.status)} <span class="scope-tag ${m.tag}">${escape(m.tag)}</span><h2 id="detail-title">${escape(m.title)}</h2><span class="detail-id">${escape(m.id)}</span></div><div class="detail-body"><div class="detail-grid"><div><span class="detail-label">Stream</span><span class="detail-value">${escape(streams[m.stream])}</span></div><div><span class="detail-label">Target</span><span class="detail-value">${escape(periods[m.target_period].label)}${m.target_date?` · ${dateLabel(m.target_date)}`:''}</span></div><div><span class="detail-label">Accountable team</span><span class="detail-value">${escape(teams[m.owner_team]||'Unassigned')}${m.owner?`<br>${escape(m.owner)}`:''}</span></div><div><span class="detail-label">Contributing teams</span><span class="detail-value">${escape((m.contributing_teams||[]).map(id=>teams[id]).join(', ')||'None recorded')}</span></div></div><h3>Delivery outcome</h3><p>${escape(m.outcome||'Not provided')}</p>${m.notes?`<h3>Latest update</h3><p class="detail-note">${escape(m.notes)}</p>`:''}<h3>Related epics</h3><div>${m.epic_ids.map(key=>`<span class="epic-chip">${escape(key)}</span>`).join('')||'<p>No epic associated.</p>'}</div><h3>Dependencies & connections <span style="color:var(--muted)">(${relations.length})</span></h3>${relationships||'<p>No relationships recorded.</p>'}</div><div class="detail-footer"><button type="button" class="button primary" id="show-on-roadmap">Show on roadmap</button><button type="button" class="button" id="close-detail-bottom">Close</button></div>`;
    $('close-detail').addEventListener('click',()=> $('milestone-dialog').close());
    $('close-detail-bottom').addEventListener('click',()=> $('milestone-dialog').close());
    $('show-on-roadmap').addEventListener('click',()=>{
      state.view='delivery';resetFilters();render();$('milestone-dialog').close();
      requestAnimationFrame(()=>{const node=document.querySelector(`#roadmap [data-id="${id}"]`);if(node){node.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});node.focus({preventScroll:true});}});
    });
    // Update selection styling without replacing the focused card or open epic group.
    document.querySelectorAll('.milestone').forEach(card=>{
      card.classList.toggle('selected',card.dataset.id===id);
      card.classList.toggle('connected',plan.dependencies.some(e=>(e.from===id&&e.to===card.dataset.id)||(e.to===id&&e.from===card.dataset.id)));
    });
    if (!$('milestone-dialog').open) $('milestone-dialog').showModal();
    $('close-detail').focus();requestDraw();
  }
  function addOptions(id, entries) {
    for (const [value,label] of entries) {const option=document.createElement('option');option.value=value;option.textContent=label;$(id).append(option);}
  }
  function initialize() {
    $('report-date').textContent=plan.plan.as_of?dateLabel(plan.plan.as_of):'Draft';
    const health=plan.reporting.overall_health || 'unknown';
    const healthStatus=plan.reporting.overall_health ? badge(health) : '<span class="badge status-unknown">Not provided</span>';
    $('health-status').innerHTML=healthStatus;
    $('health-detail-status').innerHTML=healthStatus;
    $('health-note').textContent=plan.reporting.health_note||'Health commentary not provided.';
    $('health-button').addEventListener('click',()=>{$('health-dialog').showModal();$('health-button').setAttribute('aria-expanded','true');});
    $('close-health').addEventListener('click',()=>$('health-dialog').close());
    $('health-dialog').addEventListener('close',()=>{$('health-button').setAttribute('aria-expanded','false');$('health-button').focus({preventScroll:true});});
    const uniqueEpics=epicKeys.length,done=count(plan.milestones,'done'),attention=count(plan.milestones,'at_risk')+count(plan.milestones,'blocked');
    const metric=(value,label,note,colour='')=>`<div class="metric"><div class="metric-number ${colour}">${String(value).padStart(2,'0')}</div><div><div class="metric-label">${label}</div><div class="metric-note">${note}</div></div></div>`;
    $('metrics').innerHTML=metric(plan.milestones.length,'Delivery milestones',`${plan.streams.length} streams · ${plan.milestones.filter(m=>m.tag==='unplanned').length} unplanned`) + metric(done,'Outcomes delivered','Milestones marked Done','teal') + metric(attention,'Need attention',`${count(plan.milestones,'at_risk')} at risk · ${count(plan.milestones,'blocked')} blocked`,'amber') + metric(uniqueEpics,'Connected epics',`${plan.teams.length} teams · Full plan totals`);
    addOptions('filter-stream',plan.streams.map(s=>[s.id,s.title]));addOptions('filter-team',plan.teams.map(t=>[t.id,t.name]));
    addOptions('filter-status',Object.entries(labels).filter(([id])=>id!=='unknown'));addOptions('filter-tag',[['planned','Planned'],['unplanned','Unplanned']]);
    addOptions('filter-period',plan.periods.map(p=>[p.id,p.label]));addOptions('filter-epic',epicKeys.map(key=>[key,key]));
    Object.keys(filters).forEach(key=>$(`filter-${key}`).addEventListener(key==='search'?'input':'change',event=>{filters[key]=event.target.value;render();}));
    $('reset-filters').addEventListener('click',()=>{resetFilters();render();});
    $('show-dependencies').addEventListener('change',event=>{state.showDeps=event.target.checked;requestDraw();});
    $('clear-selection').addEventListener('click',()=>{state.selected=null;render();$('view-content').focus({preventScroll:true});});
    $('settings-button').addEventListener('click',()=>{$('settings-dialog').showModal();$('settings-button').setAttribute('aria-expanded','true');});
    for (const key of Object.keys(display)) $(`display-${key}`).addEventListener('change',event=>{display[key]=event.target.checked;applyDisplay();});
    for (const [id,visible] of [['show-all-panels',true],['hide-all-panels',false]]) $(id).addEventListener('click',()=>{Object.keys(display).forEach(key=>display[key]=visible);state.showDeps=visible;$('show-dependencies').checked=visible;applyDisplay();});
    for (const id of ['close-settings','done-settings']) $(id).addEventListener('click',()=>$('settings-dialog').close());
    $('settings-dialog').addEventListener('click',event=>{if(event.target===$('settings-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
    $('settings-dialog').addEventListener('close',()=>{$('settings-button').setAttribute('aria-expanded','false');$('settings-button').focus({preventScroll:true});});
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;state.selected=null;render();}));
    document.querySelector('.view-tabs').addEventListener('keydown',event=>{
      const tabs=[...document.querySelectorAll('[data-view]')];let i=tabs.indexOf(document.activeElement);if(i<0)return;
      if(event.key==='ArrowRight')i=(i+1)%tabs.length;else if(event.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(event.key==='Home')i=0;else if(event.key==='End')i=tabs.length-1;else return;
      event.preventDefault();tabs[i].click();tabs[i].focus();
    });
    document.addEventListener('click',event=>{const button=event.target.closest('[data-open],.milestone');if(button)detail(button.dataset.open||button.dataset.id);});
    $('milestone-dialog').addEventListener('click',event=>{if(event.target===$('milestone-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
    $('milestone-dialog').addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
    $('diagnostics').hidden=!diagnostics.length;
    $('diagnostics').innerHTML=`<summary>${diagnostics.length} validation note${diagnostics.length===1?'':'s'}</summary><ul>${diagnostics.map(d=>`<li><strong>${escape(d.object_id||d.path)}</strong>: ${escape(d.message)}</li>`).join('')}</ul>`;
    let printDetails=[];
    window.addEventListener('beforeprint',()=>{printDetails=[...document.querySelectorAll('#view-content details')].map(el=>[el,el.open]);printDetails.forEach(([el])=>el.open=true);});
    window.addEventListener('afterprint',()=>{printDetails.forEach(([el,open])=>el.open=open);requestDraw();});
    $('print-button').addEventListener('click',()=>window.print());
    window.addEventListener('resize',requestDraw);
    if(document.fonts)document.fonts.ready.then(requestDraw);
    render();
  }
  initialize();
})();
