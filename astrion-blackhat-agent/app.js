(() => {
  "use strict";
  const KEY="astrion_blackhat_public_v1";
  const uid=()=>crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const seed={
    pursuits:[
      {id:"p1",name:"Joint Multi-Domain T&E Support",customer:"U.S. defense test organization",stage:"Capture",status:"Active",owner:"Shane Turner",review:"2026-08-06",playbook:"Opportunity competitive assessment",summary:"Integrate credible test planning, digital engineering, and mission-thread analysis across domains.",archived:false},
      {id:"p2",name:"Space Systems Engineering Services",customer:"U.S. space mission organization",stage:"Shape",status:"Active",owner:"Capture Team",review:"2026-09-18",playbook:"Customer evaluator simulation",summary:"Position mission engineering depth and execution confidence for a complex services opportunity.",archived:false},
      {id:"p3",name:"Range Modernization Recompete",customer:"U.S. range operations organization",stage:"Draft RFP",status:"On hold",owner:"Growth Team",review:"2026-10-03",playbook:"Recompete and incumbent defense",summary:"Assess transition risk, incumbent advantages, and modernization discriminators.",archived:false}
    ],
    evidence:[
      {id:"e1",pursuitId:"p1",title:"Draft acquisition objectives",source:"Synthetic customer brief",type:"Customer",confidence:"Medium",note:"Customer prioritizes integration speed, traceability, and credible transition planning."},
      {id:"e2",pursuitId:"p1",title:"Public capability statement",source:"Synthetic market material",type:"Competitor",confidence:"Low",note:"Likely competitor emphasizes scale and incumbent-adjacent experience."},
      {id:"e3",pursuitId:"p2",title:"Mission engineering priorities",source:"Synthetic industry day",type:"Customer",confidence:"Medium",note:"Evaluation likely rewards demonstrated mission outcomes over generic staffing depth."}
    ],
    competitors:[
      {id:"c1",pursuitId:"p1",name:"Northstar Mission Systems",position:"Likely challenger",strengths:"Scale; broad contract access; polished transition model",weaknesses:"Generic technical narrative; integration depth unproven"},
      {id:"c2",pursuitId:"p1",name:"Vector Range Solutions",position:"Specialist",strengths:"Range familiarity; focused technical bench",weaknesses:"Limited multi-domain breadth; smaller surge capacity"}
    ],
    actions:[
      {id:"a1",pursuitId:"p1",title:"Validate evaluator priorities",owner:"Capture Lead",due:"2026-08-01",status:"Open"},
      {id:"a2",pursuitId:"p1",title:"Build transition proof points",owner:"Solution Lead",due:"2026-08-04",status:"In progress"},
      {id:"a3",pursuitId:"p2",title:"Map mission outcomes to evidence",owner:"Growth Team",due:"2026-09-10",status:"Open"}
    ],
    playbooks:[
      {id:"pb1",name:"Opportunity competitive assessment",description:"Evidence-grounded analysis of customer priorities, competitor posture, gaps, and win themes."},
      {id:"pb2",name:"Customer evaluator simulation",description:"Scores the offer through plausible evaluator lenses and identifies credibility gaps."},
      {id:"pb3",name:"Recompete and incumbent defense",description:"Tests incumbent advantages, transition threats, and challenger counter-positioning."}
    ],
    runs:[],active:"p1"
  };
  let data=load(),view="portfolio",query="";
  function load(){try{return {...structuredClone(seed),...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return structuredClone(seed)}}
  function save(){localStorage.setItem(KEY,JSON.stringify(data))}
  const pursuit=()=>data.pursuits.find(p=>p.id===data.active)||data.pursuits[0];
  const scoped=(name)=>data[name].filter(x=>x.pursuitId===data.active);
  const countOpen=p=>data.actions.filter(a=>a.pursuitId===p.id&&a.status!=="Complete").length;
  function toast(msg){document.body.insertAdjacentHTML("beforeend",`<div class="toast">${esc(msg)}</div>`);setTimeout(()=>document.querySelector(".toast")?.remove(),2200)}
  function nav(){
    const entries=[["portfolio","PF","Pursuit Portfolio"],["command","CC","Command Center"],["opportunity","OP","Opportunity"],["evidence","ER","Evidence Room"],["competitors","CO","Competitors"],["playbooks","PB","Playbook Library"],["session","BH","Black Hat Session"],["history","RH","Run History"],["outputs","OC","Output Center"],["actions","AR","Action Register"]];
    return `<aside class="sidebar"><div class="brand"><div class="mark">A</div><div><strong>ASTRION</strong><span>BLACK HAT AGENT</span></div></div><nav class="nav"><div class="nav-label">WORKSPACE</div>${entries.map(x=>`<button data-view="${x[0]}" class="${view===x[0]?"active":""}"><b>${x[1]}</b>${x[2]}</button>`).join("")}</nav><div class="guardrail"><strong>Anonymous local workspace</strong>No sign-in. Data stays in this browser unless exported.</div></aside>`;
  }
  function header(){
    const p=pursuit();
    return `<header class="topbar"><div><p class="eyebrow">ACTIVE PURSUIT</p><h2>${esc(p?.name||"No pursuit selected")}</h2></div><div class="actions"><span class="pill">LOCAL · NO SIGN-IN</span><button class="btn small" data-action="export">Export workspace</button><button class="btn small" data-action="import">Import</button><input id="importFile" type="file" accept=".json" hidden></div></header>`;
  }
  function portfolio(){
    const visible=data.pursuits.filter(p=>!p.archived&&[p.name,p.customer,p.owner,p.stage].join(" ").toLowerCase().includes(query.toLowerCase()));
    return `<div class="hero"><div><p class="eyebrow">PURSUIT PORTFOLIO</p><h1>Run every competitive pursuit from one command surface.</h1><p>Create pursuits, collect evidence, assess competitors, facilitate Black Hat sessions, and export outputs—entirely in your browser.</p></div><button class="btn primary" data-action="new-pursuit">Create pursuit</button></div>
    <div class="metrics"><div class="metric"><span>ACTIVE PURSUITS</span><strong>${data.pursuits.filter(p=>!p.archived&&p.status==="Active").length}</strong></div><div class="metric"><span>EVIDENCE RECORDS</span><strong>${data.evidence.length}</strong></div><div class="metric"><span>OPEN ACTIONS</span><strong>${data.actions.filter(a=>a.status!=="Complete").length}</strong></div><div class="metric"><span>COMPLETED RUNS</span><strong>${data.runs.length}</strong></div></div>
    <div class="toolbar"><input id="search" placeholder="Search pursuit, customer, owner, or stage" value="${esc(query)}"><button class="btn" data-action="reset-demo">Reset demo</button></div>
    <div class="grid">${visible.map(p=>`<article class="card"><span class="stage">${esc(p.stage)}</span><span class="status">${esc(p.status)}</span><h3>${esc(p.name)}</h3><p>${esc(p.customer)}</p><div class="meta"><span><small>OWNER</small>${esc(p.owner)}</span><span><small>NEXT REVIEW</small>${esc(p.review||"Not set")}</span><span><small>EVIDENCE</small>${data.evidence.filter(e=>e.pursuitId===p.id).length} records</span><span><small>OPEN ACTIONS</small>${countOpen(p)}</span></div><div class="row"><button class="btn primary small" data-open="${p.id}">Open workspace</button><button class="btn small" data-duplicate="${p.id}">Duplicate</button><button class="btn small danger" data-archive="${p.id}">Archive</button></div></article>`).join("")||`<div class="empty">No pursuits match this search.</div>`}</div>`;
  }
  function command(){
    const p=pursuit(),ev=scoped("evidence"),cs=scoped("competitors"),acts=scoped("actions");
    return `<div class="hero"><div><p class="eyebrow">COMMAND CENTER</p><h1>${esc(p.name)}</h1><p>${esc(p.summary)}</p></div><button class="btn primary" data-view="session">Run Black Hat</button></div><div class="metrics"><div class="metric"><span>EVIDENCE</span><strong>${ev.length}</strong></div><div class="metric"><span>COMPETITORS</span><strong>${cs.length}</strong></div><div class="metric"><span>OPEN ACTIONS</span><strong>${acts.filter(a=>a.status!=="Complete").length}</strong></div><div class="metric"><span>RUNS</span><strong>${scoped("runs").length}</strong></div></div><div class="panel"><h2>Readiness snapshot</h2><p>${ev.length<3?"Add more evidence before a formal session.":"Evidence volume is sufficient for an initial facilitated assessment."} ${cs.length?"Competitor hypotheses are recorded and should be challenged against sourced evidence.":"Add at least one competitor hypothesis."}</p><div class="row"><button class="btn" data-view="evidence">Review evidence</button><button class="btn" data-view="competitors">Review competitors</button><button class="btn" data-view="actions">Review actions</button></div></div>`;
  }
  function opportunity(){
    const p=pursuit();return `<div class="hero"><div><p class="eyebrow">OPPORTUNITY</p><h1>Opportunity profile</h1><p>Maintain the working assumptions that frame the competitive assessment.</p></div></div><form class="panel form-grid" data-form="opportunity"><div class="field"><label>Opportunity name</label><input name="name" required value="${esc(p.name)}"></div><div class="field"><label>Customer</label><input name="customer" required value="${esc(p.customer)}"></div><div class="field"><label>Stage</label><input name="stage" value="${esc(p.stage)}"></div><div class="field"><label>Status</label><select name="status">${["Active","On hold","Complete"].map(x=>`<option ${p.status===x?"selected":""}>${x}</option>`).join("")}</select></div><div class="field"><label>Owner</label><input name="owner" value="${esc(p.owner)}"></div><div class="field"><label>Next review</label><input type="date" name="review" value="${esc(p.review)}"></div><div class="field full"><label>Opportunity summary</label><textarea name="summary">${esc(p.summary)}</textarea></div><div class="field full"><button class="btn primary">Save opportunity</button></div></form>`;
  }
  function tableView(kind,title,intro,cols){
    const rows=scoped(kind);return `<div class="hero"><div><p class="eyebrow">${title.toUpperCase()}</p><h1>${title}</h1><p>${intro}</p></div><button class="btn primary" data-add="${kind}">Add ${title.replace(/ room| register/i,"").replace(/s$/,"")}</button></div><div class="panel table-wrap">${rows.length?`<table><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join("")}<th></th></tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c[1]])}</td>`).join("")}<td><button class="btn small danger" data-delete="${kind}:${r.id}">Delete</button></td></tr>`).join("")}</tbody></table>`:`<div class="empty">Nothing recorded yet.</div>`}</div>`;
  }
  function playbooks(){return `<div class="hero"><div><p class="eyebrow">PLAYBOOK LIBRARY</p><h1>Facilitation playbooks</h1><p>Reusable lenses for structured competitive challenge.</p></div></div><div class="grid">${data.playbooks.map(p=>`<article class="card"><span class="stage">PLAYBOOK</span><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><button class="btn small" data-use-playbook="${p.id}">Use for active pursuit</button></article>`).join("")}</div>`}
  function session(){
    const p=pursuit();return `<div class="hero"><div><p class="eyebrow">BLACK HAT SESSION</p><h1>Run an evidence-grounded assessment.</h1><p>The local facilitator synthesizes only the information entered in this workspace. It does not call an external AI service.</p></div></div><form class="panel form-grid" data-form="run"><div class="field"><label>Playbook</label><select name="playbook">${data.playbooks.map(x=>`<option ${p.playbook===x.name?"selected":""}>${esc(x.name)}</option>`).join("")}</select></div><div class="field"><label>Facilitator</label><input name="facilitator" value="Public workspace facilitator"></div><div class="field full"><label>Session question</label><textarea name="question">Where is our position vulnerable, what will credible competitors emphasize, and which actions most improve win probability?</textarea></div><div class="field full"><button class="btn primary">Generate assessment</button></div></form>`;
  }
  function history(){
    return `<div class="hero"><div><p class="eyebrow">RUN HISTORY</p><h1>Assessment runs</h1><p>Each generated assessment is retained locally and can be opened or deleted.</p></div></div><div class="grid">${scoped("runs").slice().reverse().map(r=>`<article class="card"><span class="stage">${esc(r.date)}</span><h3>${esc(r.playbook)}</h3><p>${esc(r.question)}</p><div class="row"><button class="btn small" data-run="${r.id}">Open output</button><button class="btn small danger" data-delete="runs:${r.id}">Delete</button></div></article>`).join("")||`<div class="empty">No sessions have been run for this pursuit.</div>`}</div>`;
  }
  function outputs(){
    const runs=scoped("runs");return `<div class="hero"><div><p class="eyebrow">OUTPUT CENTER</p><h1>Generated outputs</h1><p>Copy or download completed assessments as Markdown.</p></div></div>${runs.length?runs.slice().reverse().map(r=>`<div class="panel"><h3>${esc(r.playbook)} · ${esc(r.date)}</h3><div class="run-output">${esc(r.output)}</div><div class="row" style="margin-top:12px"><button class="btn small" data-copy="${r.id}">Copy</button><button class="btn small" data-download="${r.id}">Download .md</button></div></div>`).join(""):`<div class="empty">Run a Black Hat session to generate an output.</div>`}`;
  }
  function render(){
    const views={portfolio,command,opportunity,evidence:()=>tableView("evidence","Evidence Room","Record source, confidence, and the claim supported by each artifact.",[["TITLE","title"],["SOURCE","source"],["TYPE","type"],["CONFIDENCE","confidence"],["NOTE","note"]]),competitors:()=>tableView("competitors","Competitors","Maintain explicit competitor hypotheses and test them against evidence.",[["COMPETITOR","name"],["POSITION","position"],["STRENGTHS","strengths"],["WEAKNESSES","weaknesses"]]),playbooks,session,history,outputs,actions:()=>tableView("actions","Action Register","Convert assessment findings into owned, dated work.",[["ACTION","title"],["OWNER","owner"],["DUE","due"],["STATUS","status"]])};
    document.querySelector("#app").innerHTML=`<div class="app">${nav()}<main class="main">${header()}<div class="content">${views[view]()}</div><div class="footer-note">Public browser-only application · Synthetic sample data · Export your workspace to move it between devices.</div></main></div><dialog id="modal"></dialog>`;
  }
  function modal(title,body){const d=document.querySelector("#modal");d.innerHTML=`<div class="modal"><header><h2>${esc(title)}</h2><button class="close" data-close>×</button></header>${body}</div>`;d.showModal()}
  function formFields(kind){
    const configs={pursuits:[["name","Opportunity name"],["customer","Customer"],["owner","Owner"],["stage","Stage"],["review","Next review","date"],["summary","Summary","textarea"]],evidence:[["title","Evidence title"],["source","Source"],["type","Type"],["confidence","Confidence"],["note","Evidence note","textarea"]],competitors:[["name","Competitor name"],["position","Position"],["strengths","Strengths","textarea"],["weaknesses","Weaknesses","textarea"]],actions:[["title","Action"],["owner","Owner"],["due","Due date","date"],["status","Status"]]};
    return `<form data-form="add" data-kind="${kind}" class="form-grid">${configs[kind].map(([n,l,t])=>`<div class="field ${t==="textarea"?"full":""}"><label>${l}</label>${t==="textarea"?`<textarea name="${n}" required></textarea>`:`<input name="${n}" type="${t||"text"}" required>`}</div>`).join("")}<div class="field full"><button class="btn primary">Save</button></div></form>`;
  }
  function assess(fd){
    const p=pursuit(),ev=scoped("evidence"),cs=scoped("competitors"),acts=scoped("actions"),date=new Date().toISOString().slice(0,10);
    const evidenceLines=ev.length?ev.map(e=>`- ${e.title} (${e.confidence} confidence; ${e.source}): ${e.note}`).join("\n"):"- No evidence has been entered. Findings are hypotheses only.";
    const compLines=cs.length?cs.map(c=>`### ${c.name}\n- Position: ${c.position}\n- Likely strengths: ${c.strengths}\n- Potential weaknesses: ${c.weaknesses}`).join("\n\n"):"No competitors have been recorded.";
    const gaps=[];if(ev.length<3)gaps.push("Evidence base is thin; add customer and competitor artifacts.");if(!cs.length)gaps.push("Competitor set is undefined.");if(!p.review)gaps.push("No review date is assigned.");if(!gaps.length)gaps.push("Validate each high-impact claim with a named source and accountable owner.");
    const output=`# Black Hat Assessment: ${p.name}\n\n**Date:** ${date}\n**Playbook:** ${fd.get("playbook")}\n**Facilitator:** ${fd.get("facilitator")}\n**Customer:** ${p.customer}\n\n## Session question\n${fd.get("question")}\n\n## Opportunity framing\n${p.summary}\n\n## Evidence considered\n${evidenceLines}\n\n## Competitor hypotheses\n${compLines}\n\n## Vulnerabilities and challenge themes\n${gaps.map(x=>`- ${x}`).join("\n")}\n- Test whether stated discriminators are measurable, customer-relevant, and difficult to imitate.\n- Separate confirmed customer priorities from internal assumptions.\n- Stress transition, staffing, integration, and proof-of-performance claims.\n\n## Recommended actions\n${acts.length?acts.map(a=>`- [${a.status==="Complete"?"x":" "}] ${a.title} — ${a.owner}; due ${a.due||"TBD"}`).join("\n"):"- Assign owners to validate evaluator priorities and competitor posture."}\n\n## Guardrail\nThis output is a structured synthesis of locally entered data, not an external intelligence product. Verify consequential claims before use.`;
    const run={id:uid(),pursuitId:p.id,date,playbook:fd.get("playbook"),question:fd.get("question"),output};data.runs.push(run);save();view="outputs";render();toast("Assessment generated locally");
  }
  document.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.dataset.view){view=b.dataset.view;render();return}
    if(b.dataset.open){data.active=b.dataset.open;view="command";save();render();return}
    if(b.dataset.duplicate){const p=data.pursuits.find(x=>x.id===b.dataset.duplicate);data.pursuits.push({...p,id:uid(),name:p.name+" — Copy"});save();render();toast("Pursuit duplicated")}
    if(b.dataset.archive){data.pursuits.find(x=>x.id===b.dataset.archive).archived=true;save();render();toast("Pursuit archived")}
    if(b.dataset.add){modal(`Add ${b.dataset.add}`,formFields(b.dataset.add))}
    if(b.dataset.action==="new-pursuit")modal("Create pursuit",formFields("pursuits"))
    if(b.dataset.action==="reset-demo"&&confirm("Replace local workspace data with the synthetic demo?")){data=structuredClone(seed);save();render()}
    if(b.dataset.action==="export"){download("astrion-blackhat-workspace.json",JSON.stringify(data,null,2),"application/json")}
    if(b.dataset.action==="import")document.querySelector("#importFile").click()
    if(b.dataset.close)document.querySelector("#modal").close()
    if(b.dataset.delete){const [k,id]=b.dataset.delete.split(":");data[k]=data[k].filter(x=>x.id!==id);save();render()}
    if(b.dataset.usePlaybook){pursuit().playbook=data.playbooks.find(x=>x.id===b.dataset.usePlaybook).name;save();toast("Playbook assigned")}
    if(b.dataset.run){view="outputs";render()}
    if(b.dataset.copy){navigator.clipboard.writeText(data.runs.find(x=>x.id===b.dataset.copy).output).then(()=>toast("Copied"))}
    if(b.dataset.download){const r=data.runs.find(x=>x.id===b.dataset.download);download(`${pursuit().name.replace(/\W+/g,"-").toLowerCase()}-${r.date}.md`,r.output,"text/markdown")}
  });
  document.addEventListener("input",e=>{if(e.target.id==="search"){query=e.target.value;render();document.querySelector("#search")?.focus()}});
  document.addEventListener("change",e=>{if(e.target.id==="importFile"&&e.target.files[0]){const reader=new FileReader();reader.onload=()=>{try{const incoming=JSON.parse(reader.result);if(!Array.isArray(incoming.pursuits))throw Error();data=incoming;save();render();toast("Workspace imported")}catch{alert("That file is not a valid Astrion workspace export.")}};reader.readAsText(e.target.files[0])}});
  document.addEventListener("submit",e=>{
    e.preventDefault();const fd=new FormData(e.target),type=e.target.dataset.form;
    if(type==="opportunity"){Object.assign(pursuit(),Object.fromEntries(fd));save();render();toast("Opportunity saved")}
    if(type==="run")assess(fd);
    if(type==="add"){const kind=e.target.dataset.kind,obj=Object.fromEntries(fd);obj.id=uid();if(kind==="pursuits"){Object.assign(obj,{status:"Active",playbook:data.playbooks[0].name,archived:false});data.pursuits.push(obj);data.active=obj.id;view="command"}else{obj.pursuitId=data.active;data[kind].push(obj)}save();document.querySelector("#modal").close();render();toast("Saved")}
  });
  function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  render();
})();
