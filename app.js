/* ======================= estado ======================= */
const VIEW_KEYS = ["painel","demandas","importar","roteiro","financeiro","equipe","config","plataforma"];
const S = {
  fase: "carregando", telaAuth: "entrar", authMsg: null,
  user: null, empresas: [], org: null, papel: null, meuNome: "", tecPode: false, adminPlataforma: false,
  view: (()=>{ const h=(location.hash||"").slice(1); return VIEW_KEYS.includes(h)?h:"painel"; })(),
  demandas: [], loaded: false,
  semana: startOfWeek(TODAY),
  f: {q:"",status:"abertas",regiao:"",tipo:""}, ff: "pendentes"
};
const CFG_ = () => S.org ? S.org.config : configPadrao("sp");
const orgAtiva = () => !!S.org && (S.org.plano === "ativo" || (S.org.plano === "teste" && S.org.testeAte >= TODAY));
// administrativo (admin/operador): cadastra, importa, agenda, cobra e define o Nº da OS
const podeEditar = () => ["admin","operador"].includes(S.papel) && orgAtiva();
// alterar uma demanda já existente: administrativo, ou técnico liberado pelo administrador
const podeAlterarDemanda = () => orgAtiva() && (podeEditar() || (S.papel === "tecnico" && S.tecPode));
const ehAdmin = () => S.papel === "admin";
function viewsPermitidas(){
  if(S.papel === "tecnico") return ["roteiro","demandas"];
  const v = ["painel","demandas","importar","roteiro","financeiro"];
  if(ehAdmin()) v.push("equipe","config");
  if(S.adminPlataforma) v.push("plataforma");
  return v;
}
const NOMES_VIEW = {painel:"Painel",demandas:"Demandas",importar:"Importar em lote",roteiro:"Roteiro",financeiro:"Financeiro",equipe:"Equipe",config:"Configurações",plataforma:"Plataforma"};

/* ======================= domínio ligado à empresa ======================= */
const regiao = id => CFG_().regioes.find(r=>r.id===id);
const rc = id => { const r = regiao(id); return r ? `var(--r${r.cor%9})` : "var(--faint)"; };
const chip = (id, extra="") => { const r = regiao(id); return `<span class="chip" style="--rc:${rc(id)}">${esc(r?r.nome:"Sem região")}${extra}</span>`; };
const pill = st => `<span class="pill p-${STATUS[st]?.c||"muted"}">${esc(STATUS[st]?.t||st)}</span>`;
function regiaoPorCidade(cidade){ const c = norm(cidade); if(!c) return ""; const r = CFG_().regioes.find(r=>(r.cidades||[]).some(x=>norm(x)===c)); return r ? r.id : ""; }
const diasSemana = ws => Array.from({length:CFG_().diasAtendimento||6},(_,i)=>addDays(ws,i));
const proximaOrdem = (dia, exceto) => 1 + Math.max(0,...S.demandas.filter(d=>d.dataAgendada===dia && d.id!==exceto).map(d=>d.ordemRota||0));

/* Conflito de região: mesma região programada em outro dia próximo (±7 dias) */
function analisar(dem, dia, lista){
  const base = lista || S.demandas;
  const ativos = base.filter(d=>d.id!==dem.id && d.dataAgendada && d.status!=="cancelada");
  const ini = addDays(dia,-7), fim = addDays(dia,7);
  const mesmos = ativos.filter(d=>d.regiao===dem.regiao && d.dataAgendada!==dia && d.dataAgendada>=ini && d.dataAgendada<=fim && d.dataAgendada>=TODAY);
  const porDia = {}; mesmos.forEach(d=>{(porDia[d.dataAgendada] ||= []).push(d)});
  const outrosDias = Object.keys(porDia).sort().map(k=>({dia:k, n:porDia[k].length}));
  const noDia = ativos.filter(d=>d.dataAgendada===dia);
  const outrasRegioes = [...new Set(noDia.map(d=>d.regiao).filter(r=>r!==dem.regiao))];
  const cap = CFG_().capacidadeDia||9;
  return {outrosDias, outrasRegioes, total:noDia.length+1, lotado:noDia.length+1>cap, cap, jaTemRegiao: noDia.some(d=>d.regiao===dem.regiao)};
}

/* ======================= gravação ======================= */
function aplicarLocal(d){ const i = S.demandas.findIndex(x=>x.id===d.id); if(i>=0) S.demandas[i]=d; else S.demandas.unshift(d); }
async function salvar(d){
  try{ const s = await API.salvar(S.org.id, clone(d)); aplicarLocal(s); render(); refreshOpenRoute(); return s; }
  catch(e){ toast(traduzErro(e)); return null; }
}
async function excluir(id){
  try{ await API.excluir(S.org.id, id); S.demandas = S.demandas.filter(d=>d.id!==id); render(); return true; }
  catch(e){ toast(traduzErro(e)); return false; }
}
function aoMudarRemoto(ev){
  if(ev.tipo === "salva"){ aplicarLocal(ev.demanda); }
  else if(ev.tipo === "removida"){ S.demandas = S.demandas.filter(d=>d.id!==ev.id); }
  else if(ev.tipo === "membro"){
    if(ev.removido){ toast("Seu acesso a esta empresa foi removido."); location.reload(); return; }
    const mudou = ev.papel !== S.papel || ev.tecPode !== S.tecPode;
    S.papel = ev.papel; S.tecPode = ev.tecPode; const e=S.empresas.find(x=>x.org.id===S.org.id); if(e){ e.papel=ev.papel; e.tecPode=ev.tecPode; }
    if(mudou){ if(!viewsPermitidas().includes(S.view)) S.view = viewsPermitidas()[0]; renderShell(); toast(S.papel==="tecnico" ? (S.tecPode ? "O administrador liberou a edição de demandas para você" : "A edição de demandas foi desativada para você") : "Seu papel na empresa foi atualizado"); }
  }
  else if(ev.tipo === "empresa"){ Object.assign(S.org, {nome:ev.org.nome, cnpj:ev.org.cnpj, plano:ev.org.plano, testeAte:ev.org.testeAte, config:ev.org.config}); const e=S.empresas.find(x=>x.org.id===S.org.id); if(e) e.org=S.org; renderShell(); }
  if(S.fase==="app"){ render(); refreshOpenRoute(); }
}

/* ======================= inicialização e acesso ======================= */
function lerConvite(){
  const p = new URLSearchParams(location.search); const c = p.get("convite");
  if(c){ try{ sessionStorage.setItem("ondemand-convite", c.toUpperCase()); }catch(e){} history.replaceState(null, "", location.pathname + location.hash); }
  try{ return sessionStorage.getItem("ondemand-convite") || ""; }catch(e){ return ""; }
}
let CONVITE = "";
async function boot(){
  CONVITE = lerConvite();
  API.aoMudarSessao((ev, user) => {
    if(ev === "PASSWORD_RECOVERY"){ S.fase="auth"; S.telaAuth="novaSenha"; S.authMsg=null; renderRoot(); return; }
    if(ev === "SIGNED_IN" && user && S.fase === "auth" && S.telaAuth !== "novaSenha") posLogin(user);
    if(ev === "SIGNED_OUT"){ S.fase="auth"; S.telaAuth="entrar"; S.org=null; renderRoot(); }
  });
  let u = null; try{ u = await API.sessao(); }catch(e){}
  if(u) posLogin(u); else { S.fase="auth"; if(CONVITE) S.telaAuth="cadastrar"; renderRoot(); }
}
let posLoginRodando = false;
async function posLogin(user){
  if(posLoginRodando) return; posLoginRodando = true;
  try{
    S.user = user; S.fase = "carregando"; renderRoot();
    let entrouEm = null;
    if(CONVITE){
      try{ entrouEm = await API.entrarConvite(CONVITE, user.email.split("@")[0]); toast("Você entrou na empresa pelo convite"); }
      catch(e){ toast(traduzErro(e)); }
      try{ sessionStorage.removeItem("ondemand-convite"); }catch(e){} CONVITE = "";
    }
    S.empresas = await API.minhasEmpresas(user.id);
    try{ S.adminPlataforma = await API.souAdminPlataforma(user.id); }catch(e){ S.adminPlataforma=false; }
    if(!S.empresas.length){ S.fase="onboarding"; renderRoot(); return; }
    let alvo = entrouEm; if(!alvo){ try{ alvo = localStorage.getItem("ondemand-org"); }catch(e){} }
    if(!S.empresas.some(e=>e.org.id===alvo)) alvo = S.empresas[0].org.id;
    await abrirEmpresa(alvo);
  }catch(e){ S.fase="auth"; S.authMsg={t:"err", m:traduzErro(e)}; renderRoot(); }
  finally{ posLoginRodando = false; }
}
async function abrirEmpresa(id){
  const e = S.empresas.find(x=>x.org.id===id);
  S.org = e.org; S.papel = e.papel; S.meuNome = e.meuNome; S.tecPode = !!e.tecPode; S.demandas = []; S.loaded = false; S.fase = "app";
  CFG = null; IMP = null; EQUIPE = {membros:null, convites:null, novo:null}; PLAT = null; fecharEditor(); rotaAberta = null; $("#modal").innerHTML = "";
  try{ localStorage.setItem("ondemand-org", id); }catch(err){}
  if(!viewsPermitidas().includes(S.view)) S.view = viewsPermitidas()[0];
  renderRoot();
  try{ S.demandas = await API.demandas(id); }catch(err){ toast(traduzErro(err)); }
  S.loaded = true; render();
  API.ouvir(id, aoMudarRemoto, S.user.id);
}

/* ======================= telas de acesso ======================= */
function renderRoot(){
  const root = $("#root");
  if(S.fase === "carregando"){ root.innerHTML = `<div style="display:grid;place-items:center;height:100%;color:var(--muted)">Carregando…</div>`; return; }
  if(S.fase === "auth"){ root.innerHTML = telaAuth(); return; }
  if(S.fase === "onboarding"){ root.innerHTML = telaOnboarding(); return; }
  root.innerHTML = `<div class="app"><aside class="side" id="side"></aside><main id="main"></main></div>`;
  renderShell(); render();
}
const PITCH = () => `<div class="pitch"><b class="logo">${esc((window.ONDEMAND_CONFIG||{}).nomeProduto||"OnDemand")}</b>
  <h1>Roteiros por região para assistência técnica a domicílio</h1>
  <ul><li>Cadastro completo das demandas, uma a uma ou em lote por planilha</li><li>Roteiro semanal que avisa quando uma região é dividida em dias diferentes</li><li>Orçamento, peças e pagamentos dos atendimentos fora de garantia</li><li>Painel com regiões atendidas na semana e no mês</li><li>Equipe com acessos separados para administrativo e técnicos</li></ul>
  <small>Cada empresa vê somente os próprios dados.</small></div>`;
function telaAuth(){
  const t = S.telaAuth; const m = S.authMsg ? `<div class="msg ${S.authMsg.t}">${esc(S.authMsg.m)}</div>` : "";
  const conv = CONVITE ? `<div class="msg ok">Você recebeu um convite (${esc(CONVITE)}). Crie sua conta ou entre para participar da empresa.</div>` : "";
  let form;
  if(t === "recuperar") form = `<h2>Recuperar senha</h2>${m}<form data-form="recuperar">
      <div class="f"><label for="a-email">E-mail</label><input id="a-email" name="email" type="email" required autocomplete="email"></div>
      <button class="btn pri" type="submit">Enviar link de recuperação</button></form>
      <button class="linkbtn" data-act="authTela" data-t="entrar">Voltar para o login</button>`;
  else if(t === "novaSenha") form = `<h2>Definir nova senha</h2>${m}<form data-form="novaSenha">
      <div class="f"><label for="a-senha">Nova senha</label><input id="a-senha" name="senha" type="password" minlength="6" required autocomplete="new-password"></div>
      <button class="btn pri" type="submit">Salvar senha e entrar</button></form>`;
  else form = `<div class="tabs" role="tablist"><button role="tab" aria-selected="${t==="entrar"}" data-act="authTela" data-t="entrar">Entrar</button><button role="tab" aria-selected="${t==="cadastrar"}" data-act="authTela" data-t="cadastrar">Criar conta</button></div>
      ${conv}${m}
      <form data-form="${t}">
        ${t==="cadastrar"?`<div class="f"><label for="a-nome">Seu nome</label><input id="a-nome" name="nome" required autocomplete="name"></div>`:""}
        <div class="f"><label for="a-email">E-mail</label><input id="a-email" name="email" type="email" required autocomplete="email"></div>
        <div class="f"><label for="a-senha">Senha</label><input id="a-senha" name="senha" type="password" minlength="6" required autocomplete="${t==="entrar"?"current-password":"new-password"}"></div>
        <button class="btn pri" type="submit">${t==="entrar"?"Entrar":"Criar conta"}</button>
      </form>
      ${t==="entrar"?`<button class="linkbtn" data-act="authTela" data-t="recuperar">Esqueci minha senha</button>`:`<p style="font-size:13px;color:var(--muted);margin:0">Depois de criar a conta você cadastra sua empresa ou entra com um código de convite.</p>`}`;
  return `<div class="auth">${PITCH()}<div class="formcol">${API.demo?`<div class="demo"><b>Modo demonstração.</b> Qualquer e-mail e senha funcionam; os dados ficam só neste navegador.</div>`:""}${form}</div></div>`;
}
function telaOnboarding(){
  const m = S.authMsg ? `<div class="msg ${S.authMsg.t}">${esc(S.authMsg.m)}</div>` : "";
  return `<div class="auth">${PITCH()}<div class="formcol">
    <h2>Bem-vindo${S.user?.email?", "+esc(S.user.email):""}</h2>${m}
    <div class="panel"><h2 style="font-size:18px">Cadastrar minha empresa</h2>
      <form data-form="criarEmpresa" class="stack">
        <div class="f"><label for="o-nome">Nome da empresa</label><input id="o-nome" name="nome" required minlength="2"></div>
        <div class="f"><label for="o-cnpj">CNPJ (opcional)</label><input id="o-cnpj" name="cnpj" inputmode="numeric"></div>
        <div class="f"><label for="o-meu">Seu nome</label><input id="o-meu" name="meu" required></div>
        <div class="f"><label for="o-mod">Regiões iniciais</label><select id="o-mod" name="modelo"><option value="sp">Estado de São Paulo (9 regiões prontas)</option><option value="branco">Começar em branco e definir depois</option></select></div>
        <button class="btn pri" type="submit">Criar empresa e começar o teste de ${(window.ONDEMAND_CONFIG||{}).diasTeste||14} dias</button>
      </form></div>
    <div class="panel"><h2 style="font-size:18px">Tenho um código de convite</h2>
      <form data-form="entrarConvite" class="row" style="flex-wrap:nowrap">
        <input id="o-cod" name="codigo" placeholder="Ex.: 7F3K9Q2A" required style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;text-transform:uppercase">
        <button class="btn" type="submit">Entrar</button></form></div>
    <button class="linkbtn" data-act="sair">Sair desta conta</button>
  </div></div>`;
}

/* ======================= casca do app ======================= */
function renderShell(){
  const side = $("#side"); if(!side) return;
  const vs = viewsPermitidas();
  side.innerHTML = `<div class="brand"><b>${esc((window.ONDEMAND_CONFIG||{}).nomeProduto||"OnDemand")}</b><span>Assistência a domicílio</span></div>
    <div class="orgbox"><b>${esc(S.org.nome)}</b>
      ${S.empresas.length>1?`<select id="orgsel" aria-label="Trocar de empresa">${S.empresas.map(e=>`<option value="${e.org.id}" ${e.org.id===S.org.id?"selected":""}>${esc(e.org.nome)}</option>`).join("")}</select>`:""}
      <span class="who">${esc(S.user?.email||"")} · ${esc(PAPEIS[S.papel]||"")}</span></div>
    <nav class="nav" id="nav">${vs.map(k=>`<button data-act="nav" data-v="${k}" aria-current="${S.view===k}">${I[k]}<span>${NOMES_VIEW[k]}</span></button>`).join("")}</nav>
    <div class="foot"><button class="btn ghost sm" data-act="sair">${I.sair}Sair</button>${API.demo?`<br><button class="linkbtn" data-act="zerarDemo" style="font-size:12px;margin-top:6px">Restaurar demonstração</button>`:""}</div>`;
}
function barraPlano(){
  const o = S.org; const sup = (window.ONDEMAND_CONFIG||{}).contatoSuporte;
  let h = API.demo ? `<div class="demo"><b>Modo demonstração.</b> Os dados ficam só neste navegador. Para usar com várias empresas, conecte o Supabase (veja o guia de instalação).</div>` : "";
  if(o.plano === "suspenso") h += `<div class="planbar bad"><span><b>Conta suspensa.</b> Os dados continuam disponíveis para consulta, mas não é possível alterar.${sup?" Fale com o suporte: "+esc(sup):""}</span></div>`;
  else if(o.plano === "teste"){
    const dias = Math.round((parse(o.testeAte)-parse(TODAY))/864e5);
    h += dias < 0 ? `<div class="planbar bad"><span><b>O período de teste terminou em ${fmtD(o.testeAte)}.</b> Os dados continuam disponíveis para consulta.${sup?" Para ativar, fale com "+esc(sup)+".":""}</span></div>`
      : (API.demo ? "" : `<div class="planbar"><span>Período de teste: ${dias===0?"termina hoje":`faltam ${dias} dia${dias>1?"s":""}`} (até ${fmtD(o.testeAte)}).</span>${sup?`<span>Para ativar: ${esc(sup)}</span>`:""}</div>`);
  }
  return h;
}
function render(){
  if(S.fase !== "app") return;
  const nav = $("#nav"); if(nav) nav.querySelectorAll("button").forEach(b=>b.setAttribute("aria-current", String(b.dataset.v===S.view)));
  const v = {painel:vPainel, demandas:vDemandas, importar:vImportar, roteiro:vRoteiro, financeiro:vFinanceiro, equipe:vEquipe, config:vConfig, plataforma:vPlataforma}[S.view] || vPainel;
  const act = document.activeElement; const aid = act && act.id; const pos = act && act.selectionStart;
  $("#main").innerHTML = barraPlano() + v();
  if(aid && $("#main").querySelector("#"+CSS.escape(aid))){ const el=$("#"+CSS.escape(aid)); el.focus(); try{ el.setSelectionRange(pos,pos);}catch(e){} }
  if(S.view==="equipe") carregarEquipe();
  if(S.view==="plataforma") carregarPlataforma();
  if(S.view==="importar") aposRenderImportar();
}

/* ---------- Painel ---------- */
function vPainel(){
  const ws = startOfWeek(TODAY), we = addDays(ws,6);
  const mIni = TODAY.slice(0,8)+"01"; const dm = parse(mIni); dm.setMonth(dm.getMonth()+1); dm.setDate(0); const mFim = ymd(dm);
  const D = S.demandas; const cfg = CFG_();
  const inR = (s,a,b) => s && s>=a && s<=b;
  const atSem = D.filter(d=>d.status==="concluida" && inR(dataAtend(d),ws,we));
  const atMes = D.filter(d=>d.status==="concluida" && inR(dataAtend(d),mIni,mFim));
  const progSem = D.filter(d=>d.status!=="cancelada" && inR(d.dataAgendada,ws,we));
  const semData = D.filter(d=>ABERTAS.includes(d.status) && !d.dataAgendada);
  const cobrar = D.filter(d=>cobra(d) && d.status!=="cancelada" && !d.fin.pago);
  const aReceber = cobrar.reduce((s,d)=>s+totais(d).restante,0);
  const recebMes = D.filter(d=>cobra(d) && d.fin.pago && inR(d.fin.dataPagamento||dataAtend(d),mIni,mFim)).reduce((s,d)=>s+totais(d).total,0);
  const mesNome = MESES[parse(TODAY).getMonth()];
  if(!S.loaded) return `<div class="head"><div><h1>Painel</h1><p>Carregando demandas…</p></div></div>`;

  const alerts = [];
  const semanaDias = diasSemana(ws);
  const regDias = {}; progSem.forEach(d=>{ (regDias[d.regiao] ||= new Set()).add(d.dataAgendada); });
  Object.entries(regDias).forEach(([r,set])=>{ if(set.size>1) alerts.push(`<div class="alert"><b>Região dividida</b> ${esc(regiao(r)?.nome||"Sem região")} está em ${set.size} dias nesta semana (${[...set].sort().map(fmtDia).join(", ")}). Juntar reduz o deslocamento.</div>`); });
  semanaDias.forEach(dia=>{ const n = progSem.filter(d=>d.dataAgendada===dia).length; if(n>(cfg.capacidadeDia||9)) alerts.push(`<div class="alert bad"><b>Dia lotado</b> ${fmtDia(dia)} tem ${n} atendimentos (limite ${cfg.capacidadeDia}).</div>`); });
  const antigas = semData.filter(d=>d.criadaEm && d.criadaEm<=addDays(TODAY,-7));
  if(antigas.length) alerts.push(`<div class="alert"><b>Sem data há mais de 7 dias</b> ${antigas.length} demanda${antigas.length>1?"s":""} aguardando agendamento.</div>`);
  const atrasadas = D.filter(d=>d.status==="agendada" && d.dataAgendada && d.dataAgendada<TODAY);
  if(atrasadas.length) alerts.push(`<div class="alert bad"><b>Sem baixa</b> ${atrasadas.length} atendimento${atrasadas.length>1?"s":""} com data passada ainda marcado${atrasadas.length>1?"s":""} como agendado.</div>`);
  const semReg = D.filter(d=>ABERTAS.includes(d.status) && !regiao(d.regiao));
  if(semReg.length) alerts.push(`<div class="alert"><b>Sem região</b> ${semReg.length} demanda${semReg.length>1?"s":""} em aberto sem região definida.</div>`);

  const weekRows = semanaDias.map(dia=>{
    const ds = progSem.filter(d=>d.dataAgendada===dia);
    const byR = {}; ds.forEach(d=>{ const o = byR[d.regiao] ||= {n:0,ok:0}; o.n++; if(d.status==="concluida") o.ok++; });
    const chips = Object.entries(byR).map(([r,o])=>chip(r,` <i>${o.ok}/${o.n}</i>`)).join(" ") || `<span style="color:var(--faint);font-size:13px">livre</span>`;
    return `<div class="d ${dia===TODAY?"today":""}">${DOWL[parse(dia).getDay()]}<small>${fmtD(dia)}</small></div><div class="row">${chips}</div>`;
  }).join("");

  const mesDem = D.filter(d=>d.status!=="cancelada" && inR(d.dataAgendada||d.concluidaEm,mIni,mFim));
  const porReg = cfg.regioes.map(r=>{
    const ds = mesDem.filter(d=>d.regiao===r.id);
    return {r, ok:ds.filter(d=>d.status==="concluida").length, prog:ds.filter(d=>d.status!=="concluida").length, dias:new Set(ds.map(d=>d.dataAgendada).filter(Boolean)).size};
  }).filter(x=>x.ok+x.prog>0).sort((a,b)=>(b.ok+b.prog)-(a.ok+a.prog));
  const maxN = Math.max(1,...porReg.map(x=>x.ok+x.prog));
  const bars = porReg.length ? porReg.map(x=>`<div class="bar"><span class="name" title="${esc(x.r.nome)}">${esc(x.r.nome)}</span>
    <span class="track"><span style="width:${x.ok/maxN*100}%;background:var(--r${x.r.cor%9})"></span><span style="width:${x.prog/maxN*100}%;background:color-mix(in srgb,var(--r${x.r.cor%9}) 30%,transparent)"></span></span>
    <span class="v">${x.ok+x.prog} · ${x.dias}d</span></div>`).join("") + `<div class="legend"><span><i style="background:var(--fg)"></i>Concluídas</span><span><i style="background:color-mix(in srgb,var(--fg) 25%,transparent)"></i>Programadas</span><span>“d” = dias na região</span></div>`
    : `<div class="empty">Nenhum atendimento programado em ${mesNome}.</div>`;

  const first = parse(mIni); const calIni = addDays(mIni, -((first.getDay()+6)%7));
  let cal = ["seg","ter","qua","qui","sex","sáb","dom"].map(x=>`<div class="h">${x}</div>`).join("");
  for(let i=0;i<42;i++){
    const dia = addDays(calIni,i); if(i>=35 && dia>mFim) break;
    const regs = [...new Set(D.filter(d=>d.dataAgendada===dia && d.status!=="cancelada").map(d=>d.regiao))];
    cal += `<div class="c ${dia.slice(0,7)!==mIni.slice(0,7)?"out":""} ${dia===TODAY?"td":""}"><b>${parse(dia).getDate()}</b>${regs.map(r=>`<span class="rg" style="--rc:${rc(r)}" title="${esc(regiao(r)?.nome||"")}">${esc(regiao(r)?.nome||"—")}</span>`).join("")}</div>`;
  }
  const stCount = Object.keys(STATUS).map(k=>[k,D.filter(d=>d.status===k).length]);
  const gar = D.filter(d=>d.tipo==="garantia" && d.status!=="cancelada");
  const empresas = {}; gar.forEach(d=>{ const e = d.empresa||"Sem empresa"; empresas[e]=(empresas[e]||0)+1; });
  const eq = {}; D.forEach(d=>{ eq[d.equipamento.tipo]=(eq[d.equipamento.tipo]||0)+1; });
  const topEq = Object.entries(eq).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const pend = cobrar.sort((a,b)=>(dataAtend(a)||"9").localeCompare(dataAtend(b)||"9")).slice(0,6);

  return `
  <div class="head"><div><h1>Painel</h1><p>Semana de ${fmtD(ws)} a ${fmtD(we)} · ${mesNome} de ${parse(TODAY).getFullYear()}</p></div>
    <div class="row"><button class="btn" data-act="nav" data-v="roteiro">Abrir roteiro</button>${podeEditar()?`<button class="btn pri" data-act="nova">${I.plus}Nova demanda</button>`:""}</div></div>
  <div class="kpis">
    <div class="kpi"><label>Atendidas na semana</label><b class="num">${atSem.length}</b><span>de ${progSem.length} programadas</span></div>
    <div class="kpi"><label>Atendidas no mês</label><b class="num">${atMes.length}</b><span>${new Set(atMes.map(d=>d.regiao)).size} regiões visitadas</span></div>
    <div class="kpi"><label>Sem data</label><b class="num" style="color:${semData.length?"var(--warn)":"inherit"}">${semData.length}</b><span>aguardando roteiro</span></div>
    <div class="kpi"><label>A receber</label><b class="money num">${brl(aReceber)}</b><span>${cobrar.length} fora de garantia</span></div>
    <div class="kpi"><label>Recebido no mês</label><b class="money num">${brl(recebMes)}</b><span>pagamentos confirmados</span></div>
  </div>
  ${alerts.length?`<div class="panel" style="margin-bottom:16px"><h2>Atenção <small>${alerts.length} ponto${alerts.length>1?"s":""}</small></h2><div class="alerts">${alerts.join("")}</div></div>`:""}
  <div class="grid g3" style="margin-bottom:16px">
    <div class="panel"><h2>Regiões da semana <small>concluídas / programadas</small></h2><div class="weekmini">${weekRows}</div></div>
    <div class="panel"><h2>Regiões no mês <small>${mesNome}</small></h2><div class="bars">${bars}</div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="panel"><h2>Calendário de regiões <small>${mesNome}</small></h2><div class="cal">${cal}</div></div>
    <div class="panel"><h2>Visão geral</h2>
      <div class="stack">
        <div class="row">${stCount.map(([k,n])=>`<span class="pill p-${STATUS[k].c}">${STATUS[k].t} · ${n}</span>`).join("")}</div>
        <table><tbody>
          <tr><td>Garantia (empresas parceiras)</td><td class="right num">${gar.length}</td></tr>
          <tr><td>Fora de garantia / avulso</td><td class="right num">${D.filter(d=>cobra(d)&&d.status!=="cancelada").length}</td></tr>
          ${Object.entries(empresas).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([e,n])=>`<tr><td style="padding-left:22px;color:var(--muted)">${esc(e)}</td><td class="right num">${n}</td></tr>`).join("")}
        </tbody></table>
        <div><div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:6px 0">Equipamentos mais atendidos</div>
          ${topEq.length?topEq.map(([e,n])=>`<div class="row" style="justify-content:space-between;font-size:14px;padding:3px 0"><span>${esc(e)}</span><span class="num">${n}</span></div>`).join(""):`<div class="empty">Sem dados ainda.</div>`}</div>
      </div>
    </div>
  </div>
  <div class="panel"><h2>Pagamentos pendentes <small>${brl(aReceber)} no total</small></h2>
    ${pend.length?`<div class="tablewrap"><table><thead><tr><th>Cliente</th><th>Data</th><th>Forma</th><th class="right">Em aberto</th></tr></thead><tbody>
    ${pend.map(d=>`<tr class="click" data-act="abrir" data-id="${d.id}"><td>${esc(d.cliente.nome)}<span class="sub">${esc(d.equipamento.tipo)} · ${esc(d.cliente.cidade)}</span></td><td class="mono">${fmtDia(dataAtend(d))}</td><td>${esc(d.fin.formaPagamento)}</td><td class="right num">${brl(totais(d).restante)}</td></tr>`).join("")}
    </tbody></table></div>`:`<div class="empty">Nenhum pagamento pendente.</div>`}
  </div>`;
}

/* ---------- Demandas ---------- */
function filtrarDemandas(){
  const f = S.f; const q = norm(f.q);
  return S.demandas.filter(d=>{
    if(f.status==="abertas" && !ABERTAS.includes(d.status)) return false;
    if(f.status && f.status!=="abertas" && d.status!==f.status) return false;
    if(f.regiao && d.regiao!==f.regiao) return false;
    if(f.tipo && d.tipo!==f.tipo) return false;
    if(q){ const hay = norm([d.cliente.nome,d.cliente.telefone,d.cliente.cidade,d.cliente.bairro,d.cliente.endereco,d.equipamento.tipo,d.equipamento.marca,d.problema,d.empresa,d.osEmpresa,osCode(d)].join(" ")); if(!hay.includes(q)) return false; }
    return true;
  }).sort((a,b)=>(a.dataAgendada||"0000").localeCompare(b.dataAgendada||"0000") || (b.criadaEm||"").localeCompare(a.criadaEm||"") || String(b.numero).localeCompare(String(a.numero), "pt-BR", {numeric:true}));
}
function vDemandas(){
  const f = S.f; const list = filtrarDemandas();
  const rows = list.map(d=>{
    const t = totais(d);
    const fin = cobra(d) ? (d.fin.pago?`<span class="pill p-ok">Pago</span>`:`<span class="pill p-warn">${brl(t.restante)}</span>`) : `<span class="pill p-muted">Garantia</span>`;
    return `<tr class="click" data-act="abrir" data-id="${d.id}">
      <td class="mono" style="color:${d.numero?"var(--muted)":"var(--faint)"};white-space:nowrap">${osCode(d)}</td>
      <td><b style="font-weight:600">${esc(d.cliente.nome)}</b><span class="sub">${esc(d.cliente.telefone)}</span></td>
      <td>${esc(d.cliente.cidade)}<span class="sub">${esc(d.cliente.bairro)}</span></td>
      <td>${chip(d.regiao)}</td>
      <td>${esc(d.equipamento.tipo)} <span class="sub">${esc([d.equipamento.marca,d.equipamento.modelo].filter(Boolean).join(" "))}</span></td>
      <td class="mono">${fmtDia(d.dataAgendada)}${d.visita.janela?`<span class="sub">${esc(d.visita.janela)}</span>`:""}</td>
      <td>${pill(d.status)}</td><td>${fin}</td></tr>`;
  }).join("");
  const opt = (v,t,cur) => `<option value="${v}" ${v===cur?"selected":""}>${esc(t)}</option>`;
  return `
  <div class="head"><div><h1>Demandas</h1><p>${list.length} de ${S.demandas.length} demandas</p></div>
    <div class="row"><button class="btn" data-act="exportar">Exportar planilha</button>${podeEditar()?`<button class="btn" data-act="nav" data-v="importar">${I.importar}Importar em lote</button><button class="btn pri" data-act="nova">${I.plus}Nova demanda</button>`:""}</div></div>
  <div class="filters">
    <input type="search" id="fq" placeholder="Buscar cliente, telefone, cidade, equipamento, OS…" value="${esc(f.q)}" data-filter="q" aria-label="Buscar">
    <select id="fst" data-filter="status" aria-label="Status">${opt("abertas","Em aberto",f.status)}${opt("","Todos os status",f.status)}${Object.entries(STATUS).map(([k,v])=>opt(k,v.t,f.status)).join("")}</select>
    <select id="frg" data-filter="regiao" aria-label="Região">${opt("","Todas as regiões",f.regiao)}${CFG_().regioes.map(r=>opt(r.id,r.nome,f.regiao)).join("")}</select>
    <select id="ftp" data-filter="tipo" aria-label="Tipo">${opt("","Garantia e fora",f.tipo)}${opt("garantia","Garantia",f.tipo)}${opt("fora_garantia","Fora de garantia",f.tipo)}</select>
  </div>
  <div class="panel">${!S.loaded?`<div class="empty">Carregando…</div>`: list.length?`<div class="tablewrap"><table>
    <thead><tr><th>OS</th><th>Cliente</th><th>Cidade</th><th>Região</th><th>Equipamento</th><th>Visita</th><th>Status</th><th>Cobrança</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="empty">${S.demandas.length?"Nenhuma demanda com esses filtros.":"Nenhuma demanda cadastrada. Use “Nova demanda” ou “Importar em lote” para começar."}</div>`}</div>`;
}
function exportarCSV(){
  const list = filtrarDemandas();
  const head = ["OS","Status","Tipo","Empresa parceira","OS empresa","Cliente","Telefone","Telefone 2","Endereço","Bairro","Cidade","CEP","Referência","Região","Equipamento","Marca","Modelo","Problema","Data","Horário","Técnico","Quem recebe","Aviso","Enviar localização","Observações","Peças","Mão de obra","Deslocamento","Total","Forma de pagamento","Pago"];
  const rows = list.map(d=>{ const t=totais(d); return [d.numero||"", STATUS[d.status]?.t, cobra(d)?"Fora de garantia":"Garantia", d.empresa, d.osEmpresa, d.cliente.nome, d.cliente.telefone, d.cliente.telefone2, d.cliente.endereco, d.cliente.bairro, d.cliente.cidade, d.cliente.cep, d.cliente.referencia, regiao(d.regiao)?.nome||"", d.equipamento.tipo, d.equipamento.marca, d.equipamento.modelo, d.problema, d.dataAgendada?fmtD(d.dataAgendada)+"/"+d.dataAgendada.slice(0,4):"", d.visita.janela, d.visita.tecnico, d.visita.quemRecebe, AVISO[d.visita.aviso], d.visita.enviarLocalizacao?"Sim":"Não", d.visita.observacoes, d.fin.pecas.map(p=>`${p.qtd}x ${p.descricao}`).join(", "), cobra(d)?String(d.fin.maoDeObra).replace(".",","):"", cobra(d)?String(d.fin.deslocamento).replace(".",","):"", cobra(d)?t.total.toFixed(2).replace(".",","):"", cobra(d)?d.fin.formaPagamento:"", cobra(d)?(d.fin.pago?"Sim":"Não"):""]; });
  baixarArquivo(`demandas-${TODAY}.csv`, toCSV([head, ...rows]), "text/csv;charset=utf-8");
  toast(`${rows.length} demandas exportadas`);
}

/* ---------- Roteiro ---------- */
function flags(d){
  const f = [];
  if(d.visita.aviso==="ligar") f.push(`<span class="flag hot">Ligar antes</span>`);
  if(d.visita.aviso==="mensagem") f.push(`<span class="flag hot">Mensagem antes</span>`);
  if(d.visita.enviarLocalizacao) f.push(`<span class="flag hot">Enviar localização</span>`);
  if(cobra(d)) f.push(`<span class="flag">${d.fin.pago?"Pago":"Cobrar "+brl(totais(d).restante)}</span>`);
  else if(d.empresa) f.push(`<span class="flag">${esc(d.empresa)}</span>`);
  return f.join("");
}
function vRoteiro(){
  const ed = podeEditar();
  const ws = S.semana; const dias = diasSemana(ws); const cap = CFG_().capacidadeDia||9;
  const fimSem = addDays(ws,6);
  const back = S.demandas.filter(d=>ABERTAS.includes(d.status) && !d.dataAgendada);
  const grupos = {}; back.forEach(d=>{ (grupos[regiao(d.regiao)?d.regiao:""] ||= []).push(d); });
  const ordemR = CFG_().regioes.map(r=>r.id).concat([""]);
  const semanaDem = S.demandas.filter(d=>d.dataAgendada>=ws && d.dataAgendada<=fimSem && d.status!=="cancelada");
  const dayOpts = dias.map(x=>`<option value="${x}">${fmtDia(x)}</option>`).join("");
  const drag = ed ? `draggable="true"` : "";

  const backHtml = ordemR.filter(r=>grupos[r]).map(r=>{
    const diasReg = [...new Set(semanaDem.filter(d=>d.regiao===r).map(d=>d.dataAgendada))].sort();
    const hint = ed && r && diasReg.length ? `<div class="hint"><span>Região já programada: ${diasReg.map(fmtDia).join(", ")}</span><button class="btn sm" data-act="agendarGrupo" data-r="${r}" data-dia="${diasReg[0]}">Pôr todas em ${fmtDia(diasReg[0])}</button></div>` : "";
    return `<div class="bgroup"><div class="gh">${chip(r,` <i>${grupos[r].length}</i>`)}</div>${hint}
      ${grupos[r].map(d=>`<div class="card" ${drag} data-drag="${d.id}" style="--rc:${rc(d.regiao)}">
        <div class="t"><b>${esc(d.cliente.nome)}</b><span class="ord">${pill(d.status)}</span></div>
        <div class="m">${esc(d.cliente.cidade)}${d.cliente.bairro?" · "+esc(d.cliente.bairro):""} · ${esc(d.equipamento.tipo)}</div>
        ${d.visita.janela?`<div class="m">Horário: ${esc(d.visita.janela)}</div>`:""}
        <div class="row" style="gap:4px;flex-wrap:nowrap">${ed?`<select id="ag-${d.id}" aria-label="Dia">${dayOpts}</select><button class="btn sm" data-act="agendarSel" data-id="${d.id}">Agendar</button>`:""}<button class="btn sm ghost" data-act="abrir" data-id="${d.id}">Abrir</button></div>
      </div>`).join("")}</div>`;
  }).join("") || `<div class="empty">Tudo agendado. Novas demandas sem data aparecem aqui.</div>`;

  const cols = dias.map(dia=>{
    const ds = semanaDem.filter(d=>d.dataAgendada===dia).sort((a,b)=>(a.ordemRota||0)-(b.ordemRota||0));
    const regs = {}; ds.forEach(d=>regs[d.regiao]=(regs[d.regiao]||0)+1);
    const split = Object.keys(regs).filter(r=>semanaDem.some(d=>d.regiao===r && d.dataAgendada!==dia));
    return `<div class="col ${dia===TODAY?"today":""}" ${ed?`data-drop="${dia}"`:""}>
      <div class="ch"><h3>${DOWL[parse(dia).getDay()]}<small>${fmtD(dia)}${dia===TODAY?" · hoje":""}</small></h3><span class="cap ${ds.length>cap?"over":""}">${ds.length}/${cap}</span></div>
      <div class="regs">${Object.entries(regs).map(([r,n])=>chip(r,` <i>${n}</i>`)).join("")}</div>
      ${Object.keys(regs).length>1?`<div class="warnline">${Object.keys(regs).length} regiões no mesmo dia</div>`:""}
      ${split.length?`<div class="warnline">${split.map(r=>esc(regiao(r)?.nome||"Sem região")).join(", ")} também em outro dia da semana</div>`:""}
      ${ds.map((d,i)=>`<div class="card ${d.status==="concluida"?"done":""}" ${drag} data-drag="${d.id}" style="--rc:${rc(d.regiao)}">
        <div class="t"><b>${esc(d.cliente.nome)}</b><span class="ord">#${i+1}</span></div>
        <div class="m">${esc(d.cliente.cidade)}${d.cliente.bairro?" · "+esc(d.cliente.bairro):""}</div>
        <div class="m">${esc(d.equipamento.tipo)}${d.visita.janela?" · "+esc(d.visita.janela):""}</div>
        <div class="flags">${d.status!=="agendada"?pill(d.status):""}${flags(d)}</div>
        <div class="acts">${ed?`<button data-act="mover" data-id="${d.id}" data-dir="-1" aria-label="Subir na rota" ${i===0?"disabled":""}>▲</button><button data-act="mover" data-id="${d.id}" data-dir="1" aria-label="Descer na rota" ${i===ds.length-1?"disabled":""}>▼</button><button data-act="desagendar" data-id="${d.id}">Tirar do dia</button>`:""}<button data-act="abrir" data-id="${d.id}">Abrir</button></div>
      </div>`).join("")}
      ${ds.length?`<button class="btn sm" data-act="rotaDia" data-dia="${dia}" style="margin-top:auto;justify-content:center">Roteiro do técnico</button>`:`<div class="empty" style="margin-top:0">${ed?"Arraste demandas para cá":"Sem atendimentos"}</div>`}
    </div>`;
  }).join("");

  return `
  <div class="head"><div><h1>Roteiro semanal</h1><p>Agrupe cada região em um único dia para reduzir o deslocamento.</p></div>
    <div class="weekbar"><button class="btn" data-act="sem" data-n="-7" aria-label="Semana anterior">◀</button><strong>${fmtD(ws)} – ${fmtD(fimSem)}</strong><button class="btn" data-act="sem" data-n="7" aria-label="Próxima semana">▶</button><button class="btn" data-act="sem" data-n="0">Esta semana</button></div></div>
  <div class="board">
    <aside class="backlog" ${ed?`data-drop=""`:""}>
      <div class="row" style="justify-content:space-between"><h3>A agendar</h3><span class="cap">${back.length}</span></div>
      ${backHtml}
    </aside>
    <div class="cols"><div class="colsin">${cols}</div></div>
  </div>`;
}

/* ---------- Financeiro ---------- */
function vFinanceiro(){
  const all = S.demandas.filter(d=>cobra(d) && d.status!=="cancelada");
  const list = all.filter(d=> S.ff==="todos" || (S.ff==="pendentes"? !d.fin.pago : d.fin.pago)).sort((a,b)=>(dataAtend(b)||"").localeCompare(dataAtend(a)||""));
  const sum = (arr,fn)=>arr.reduce((s,d)=>s+fn(d),0);
  const totalGeral = sum(all,d=>totais(d).total), pagos = sum(all.filter(d=>d.fin.pago),d=>totais(d).total);
  const sinais = sum(all.filter(d=>!d.fin.pago),d=>totais(d).sinal);
  const pecasComprar = all.filter(d=>d.status!=="concluida").flatMap(d=>d.fin.pecas.map((p,i)=>({d,p,i})).filter(x=>!x.p.comprada && x.p.descricao));
  const opt = (v,t)=>`<option value="${v}" ${S.ff===v?"selected":""}>${t}</option>`;
  const ed = podeEditar();
  return `
  <div class="head"><div><h1>Financeiro</h1><p>Atendimentos fora de garantia e avulsos</p></div>
    <select id="ffin" data-ff="1" class="btn" aria-label="Filtro">${opt("pendentes","Pagamento pendente")}${opt("pagos","Pagos")}${opt("todos","Todos")}</select></div>
  <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="kpi"><label>Total orçado</label><b class="money num">${brl(totalGeral)}</b><span>${all.length} atendimentos</span></div>
    <div class="kpi"><label>Recebido</label><b class="money num" style="color:var(--ok)">${brl(pagos)}</b><span>${all.filter(d=>d.fin.pago).length} pagos</span></div>
    <div class="kpi"><label>Sinais depositados</label><b class="money num">${brl(sinais)}</b><span>para compra de peças</span></div>
    <div class="kpi"><label>A receber</label><b class="money num" style="color:var(--warn)">${brl(sum(all,d=>totais(d).restante))}</b><span>${all.filter(d=>!d.fin.pago).length} em aberto</span></div>
  </div>
  <div class="grid g3">
    <div class="panel"><h2>Cobranças</h2>
      ${list.length?`<div class="tablewrap"><table><thead><tr><th>Cliente</th><th class="right">Peças</th><th class="right">M. obra</th><th class="right">Desloc.</th><th class="right">Total</th><th>Forma</th><th></th></tr></thead><tbody>
      ${list.map(d=>{const t=totais(d);return `<tr><td class="click" data-act="abrir" data-id="${d.id}" style="cursor:pointer">${esc(d.cliente.nome)}<span class="sub">${esc(d.equipamento.tipo)} · ${fmtDia(dataAtend(d))}</span>${t.sinal&&!d.fin.pago?`<span class="sub">Sinal ${brl(t.sinal)} · falta ${brl(t.restante)}</span>`:""}</td>
        <td class="right num">${brl(t.pecas)}</td><td class="right num">${brl(d.fin.maoDeObra)}</td><td class="right num">${brl(d.fin.deslocamento)}</td><td class="right num"><b>${brl(t.total)}</b></td><td>${esc(d.fin.formaPagamento)}</td>
        <td>${!ed?(d.fin.pago?`<span class="pill p-ok">Pago</span>`:""):d.fin.pago?`<button class="btn sm" data-act="pago" data-id="${d.id}" data-v="0" title="Desfazer">✓ Pago ${d.fin.dataPagamento?fmtD(d.fin.dataPagamento):""}</button>`:`<button class="btn sm pri" data-act="pago" data-id="${d.id}" data-v="1">Marcar pago</button>`}</td></tr>`}).join("")}
      </tbody></table></div>`:`<div class="empty">${all.length?"Nada neste filtro.":"Nenhum atendimento fora de garantia registrado."}</div>`}
    </div>
    <div class="panel"><h2>Peças a comprar <small>${pecasComprar.length}</small></h2>
      ${pecasComprar.length?pecasComprar.map(({d,p,i})=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line-2);padding:8px 0;flex-wrap:nowrap">
        <div style="min-width:0"><b style="font-weight:600">${esc(p.descricao)}</b> <span class="mono" style="color:var(--muted)">×${Number(p.qtd)||1}</span><div style="font-size:13px;color:var(--muted)">${esc(d.cliente.nome)} · ${esc(d.equipamento.tipo)} ${esc(d.equipamento.marca)} · ${brl((Number(p.qtd)||0)*(Number(p.valor)||0))}</div></div>
        ${ed?`<button class="btn sm" data-act="comprada" data-id="${d.id}" data-i="${i}">Comprada</button>`:""}</div>`).join(""):`<div class="empty">Nenhuma peça pendente de compra.</div>`}
    </div>
  </div>`;
}

/* ---------- Equipe ---------- */
let EQUIPE = {membros:null, convites:null, novo:null};
function vEquipe(){
  const link = c => `${location.origin}${location.pathname}?convite=${c}`;
  const m = EQUIPE.membros, cv = EQUIPE.convites;
  const admins = (m||[]).filter(x=>x.papel==="admin").length;
  return `
  <div class="head"><div><h1>Equipe</h1><p>Quem acessa os dados de ${esc(S.org.nome)}</p></div></div>
  ${API.demo?`<div class="demo">Na demonstração o técnico listado é fictício. Depois de conectar o Supabase, os convites passam a funcionar de verdade.</div>`:""}
  <div class="grid g3">
    <div class="panel"><h2>Membros</h2>
      ${m===null?`<div class="empty">Carregando…</div>`:`<div class="tablewrap"><table><thead><tr><th>Pessoa</th><th>Papel</th><th>Permissão</th><th></th></tr></thead><tbody>
      ${m.map(x=>{ const eu = x.user_id===S.user.id; const unicoAdmin = x.papel==="admin" && admins<=1;
        return `<tr><td>${esc(x.nome||"—")}${eu?" (você)":""}<span class="sub">${esc(x.email||"")}</span></td>
        <td><select id="pp-${x.user_id}" data-papel="${x.user_id}" ${unicoAdmin?"disabled title=\"A empresa precisa de pelo menos um administrador\"":""} style="border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:var(--surface)">${Object.entries(PAPEIS).map(([k,v])=>`<option value="${k}" ${x.papel===k?"selected":""}>${v}</option>`).join("")}</select></td>
        <td>${x.papel==="tecnico"?`<label style="display:flex;gap:6px;align-items:flex-start;font-size:13px;min-width:130px"><input type="checkbox" style="margin-top:3px" id="perm-${x.user_id}" data-perm="${x.user_id}" ${x.pode_editar_demandas?"checked":""}> Pode alterar demandas</label>`:`<span style="font-size:13px;color:var(--muted)">${x.papel==="admin"?"Acesso total":"Cadastra e altera"}</span>`}</td>
        <td class="right">${eu||unicoAdmin?"":`<button class="btn sm danger" data-act="removerMembro" data-uid="${x.user_id}" data-nome="${esc(x.nome||x.email||"")}">Remover</button>`}</td></tr>`; }).join("")}
      </tbody></table></div>`}
      <p style="font-size:13px;color:var(--muted);margin:12px 0 0"><b>Administrador</b>: tudo, inclusive equipe e configurações. <b>Operador</b>: cadastra, importa, agenda e cobra. <b>Técnico</b>: vê o roteiro e marca o andamento. Com “Pode alterar demandas”, também edita os dados das demandas (cliente, equipamento, visita, orçamento), mas não cria, não exclui e não muda o Nº da OS.</p>
    </div>
    <div class="panel stack"><h2>Convidar</h2>
      <div class="row" style="flex-wrap:nowrap"><select id="novoPapel" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:7px 9px;background:var(--surface);min-width:0">${Object.entries(PAPEIS).map(([k,v])=>`<option value="${k}" ${k==="operador"?"selected":""}>${v}</option>`).join("")}</select><button class="btn pri" data-act="criarConvite">Gerar convite</button></div>
      ${EQUIPE.novo?`<div class="conf"><span>Envie este link para a pessoa. Vale por 7 dias e pode ser usado uma vez.</span><span class="code">${esc(EQUIPE.novo.codigo)}</span>
        <input readonly id="convLink" value="${esc(link(EQUIPE.novo.codigo))}" style="border:1px solid var(--line);border-radius:8px;padding:7px;background:var(--surface);width:100%;font:12.5px var(--f-mono)">
        <div class="row"><button class="btn sm" data-act="copiarConvite">Copiar link</button><a class="btn sm wa" target="_blank" rel="noopener" href="${esc(waLink("", `Você foi convidado para acessar ${S.org.nome} no ${(window.ONDEMAND_CONFIG||{}).nomeProduto||"OnDemand"}. Crie sua conta por este link: ${link(EQUIPE.novo.codigo)}`))}">Enviar pelo WhatsApp</a></div></div>`:""}
      <h3 style="margin:8px 0 0;font:600 15px var(--f-display);text-transform:uppercase;letter-spacing:.04em">Convites em aberto</h3>
      ${cv===null?`<div class="empty">Carregando…</div>`: cv.length? cv.map(c=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line-2);padding:6px 0"><span><span class="mono">${esc(c.codigo)}</span> · ${esc(PAPEIS[c.papel])}<span class="sub" style="display:block;font-size:12px;color:var(--muted)">vence ${fmtD(String(c.expira_em).slice(0,10))}</span></span><button class="btn sm ghost danger" data-act="apagarConvite" data-c="${esc(c.codigo)}">Cancelar</button></div>`).join("") : `<div class="empty">Nenhum convite em aberto.</div>`}
    </div>
  </div>`;
}
let equipeCarregando = false;
async function carregarEquipe(){
  if(equipeCarregando || (EQUIPE.membros!==null && EQUIPE.convites!==null)) return;
  equipeCarregando = true;
  try{ const [m, c] = await Promise.all([API.membros(S.org.id), API.convites(S.org.id)]); EQUIPE.membros = m; EQUIPE.convites = c; }
  catch(e){ EQUIPE.membros = EQUIPE.membros||[]; EQUIPE.convites = EQUIPE.convites||[]; toast(traduzErro(e)); }
  equipeCarregando = false; if(S.view==="equipe") render();
}

/* ---------- Configurações ---------- */
let CFG = null;
function vConfig(){
  if(!CFG) CFG = {nome:S.org.nome, cnpj:S.org.cnpj||"", config: clone(S.org.config)};
  const c = CFG.config;
  const inp = "border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:7px 9px;width:100%;min-width:0";
  return `
  <div class="head"><div><h1>Configurações</h1><p>Dados da empresa, regiões, técnicos e limite de atendimentos por dia.</p></div>
    <div class="row"><button class="btn" data-act="cfgReset">Descartar alterações</button><button class="btn pri" data-act="cfgSave">Salvar configurações</button></div></div>
  <div class="grid g3">
    <div class="panel cfg"><h2>Regiões <small>as cidades servem para sugerir a região no cadastro e na importação</small></h2>
      ${c.regioes.map((r,i)=>`<div class="cfgreg" style="--rc:var(--r${r.cor%9})"><span class="sw"></span>
        <input id="rn-${i}" data-cfg="nome" data-i="${i}" value="${esc(r.nome)}" aria-label="Nome da região">
        <textarea id="rc-${i}" data-cfg="cidades" data-i="${i}" aria-label="Cidades separadas por vírgula">${esc((r.cidades||[]).join(", "))}</textarea>
        <button class="btn sm danger" data-act="cfgDelReg" data-i="${i}">Remover</button></div>`).join("")}
      <div style="margin-top:12px" class="row"><button class="btn" data-act="cfgAddReg">${I.plus}Adicionar região</button>${c.regioes.length<3?`<button class="btn" data-act="cfgModeloSP">Usar regiões do estado de SP</button>`:""}</div>
    </div>
    <div class="stack">
      <div class="panel cfg stack"><h2>Empresa</h2>
        <div class="f"><label for="cfgnome">Nome</label><input id="cfgnome" data-cfg="empNome" value="${esc(CFG.nome)}" style="${inp}"></div>
        <div class="f"><label for="cfgcnpj">CNPJ</label><input id="cfgcnpj" data-cfg="empCnpj" value="${esc(CFG.cnpj)}" style="${inp}"></div>
        <div class="f"><label>Plano</label><span>${S.org.plano==="ativo"?`<span class="pill p-ok">Ativo</span>`:S.org.plano==="suspenso"?`<span class="pill p-bad">Suspenso</span>`:`<span class="pill p-accent">Teste até ${fmtD(S.org.testeAte)}</span>`}</span></div>
      </div>
      <div class="panel cfg stack"><h2>Operação</h2>
        <div class="f"><label for="cfgcap">Máximo de atendimentos por dia</label><input id="cfgcap" type="number" min="1" max="30" data-cfg="capacidadeDia" value="${c.capacidadeDia}" style="${inp}"></div>
        <div class="f"><label for="cfgprefixo">Prefixo do Nº da OS gerado (opcional)</label><input id="cfgprefixo" data-cfg="prefixoOS" value="${esc(c.prefixoOS||"")}" placeholder="Ex.: RT-  →  RT-0001" maxlength="10" style="${inp}"></div>
        <div class="f"><label for="cfgdias">Dias de atendimento</label><select id="cfgdias" data-cfg="diasAtendimento" style="${inp}"><option value="5" ${c.diasAtendimento==5?"selected":""}>Segunda a sexta</option><option value="6" ${c.diasAtendimento==6?"selected":""}>Segunda a sábado</option><option value="7" ${c.diasAtendimento==7?"selected":""}>Todos os dias</option></select></div>
      </div>
      <div class="panel cfg stack"><h2>Técnicos <small>o WhatsApp é usado para enviar o roteiro</small></h2>
        ${c.tecnicos.map((t,i)=>`<div class="row" style="flex-wrap:nowrap"><input id="tn-${i}" data-cfg="tecNome" data-i="${i}" value="${esc(t.nome)}" placeholder="Nome" aria-label="Nome do técnico" style="${inp}"><input id="tt-${i}" data-cfg="tecTel" data-i="${i}" value="${esc(t.telefone)}" placeholder="WhatsApp" aria-label="WhatsApp do técnico" inputmode="tel" style="${inp}"><button class="btn sm ghost danger" data-act="cfgDelTec" data-i="${i}" aria-label="Remover técnico">✕</button></div>`).join("")}
        <div><button class="btn sm" data-act="cfgAddTec">${I.plus}Adicionar técnico</button></div>
      </div>
    </div>
  </div>`;
}

/* ---------- Plataforma (dono do SaaS) ---------- */
let PLAT = null, platCarregando = false;
function vPlataforma(){
  const L = PLAT;
  const tot = L ? {emp:L.length, ativas:L.filter(o=>o.plano==="ativo").length, teste:L.filter(o=>o.plano==="teste" && o.teste_ate>=TODAY).length, dem30:L.reduce((s,o)=>s+Number(o.demandas_30d||0),0)} : null;
  return `
  <div class="head"><div><h1>Plataforma</h1><p>Empresas que usam o sistema. Só você, como dono da plataforma, vê esta tela.</p></div><button class="btn" data-act="platRecarregar">Atualizar</button></div>
  ${tot?`<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="kpi"><label>Empresas</label><b class="num">${tot.emp}</b><span>cadastradas</span></div>
    <div class="kpi"><label>Plano ativo</label><b class="num" style="color:var(--ok)">${tot.ativas}</b><span>pagantes</span></div>
    <div class="kpi"><label>Em teste</label><b class="num">${tot.teste}</b><span>dentro do prazo</span></div>
    <div class="kpi"><label>Demandas em 30 dias</label><b class="num">${tot.dem30}</b><span>todas as empresas</span></div></div>`:""}
  <div class="panel">${L===null?`<div class="empty">Carregando…</div>`:L.length?`<div class="tablewrap"><table><thead><tr><th>Empresa</th><th>Administrador</th><th class="right">Usuários</th><th class="right">Demandas</th><th>Plano</th><th>Teste até</th><th></th></tr></thead><tbody>
    ${L.map(o=>`<tr><td>${esc(o.nome)}<span class="sub">${o.cnpj?esc(o.cnpj)+" · ":""}desde ${fmtD(String(o.criado_em).slice(0,10))}</span></td><td>${esc(o.admin_email||"—")}</td><td class="right num">${o.membros}</td><td class="right num">${o.demandas}<span class="sub">${o.demandas_30d} em 30 dias</span></td>
      <td><select id="pl-${o.id}" style="border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:var(--surface)">${["teste","ativo","suspenso"].map(p=>`<option value="${p}" ${o.plano===p?"selected":""}>${p==="teste"?"Teste":p==="ativo"?"Ativo":"Suspenso"}</option>`).join("")}</select></td>
      <td><input id="pt-${o.id}" type="date" value="${esc(o.teste_ate||"")}" style="border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:var(--surface)"></td>
      <td><button class="btn sm" data-act="platSalvar" data-id="${o.id}">Salvar</button></td></tr>`).join("")}
    </tbody></table></div>`:`<div class="empty">Nenhuma empresa cadastrada ainda.</div>`}</div>`;
}
async function carregarPlataforma(force){
  if(platCarregando || (PLAT!==null && !force)) return;
  platCarregando = true;
  try{ PLAT = await API.resumoPlataforma(); }catch(e){ PLAT = []; toast(traduzErro(e)); }
  platCarregando = false; if(S.view==="plataforma") render();
}

/* ======================= editor de demanda ======================= */
let E = null, E0 = null, E_RO = false;
function getP(o,p){ return p.split(".").reduce((a,k)=>a?.[k],o) ?? ""; }
function setP(o,p,v){ const ks=p.split("."); let a=o; ks.slice(0,-1).forEach(k=>a=a[k]); a[ks.at(-1)]=v; }
function field(label, path, opts={}){
  const v = getP(E,path); const id = "e-"+path.replace(/\./g,"-");
  const cls = "f "+(opts.span||""); const req = opts.req?" <em>*</em>":"";
  if(opts.type==="select") return `<div class="${cls}"><label for="${id}">${label}${req}</label><select id="${id}" data-f="${path}">${opts.options.map(o=>{const [val,t]=Array.isArray(o)?o:[o,o];return `<option value="${esc(val)}" ${String(v)===String(val)?"selected":""}>${esc(t)}</option>`}).join("")}</select>${opts.note||""}</div>`;
  if(opts.type==="textarea") return `<div class="${cls}"><label for="${id}">${label}${req}</label><textarea id="${id}" data-f="${path}" placeholder="${esc(opts.ph||"")}">${esc(v)}</textarea></div>`;
  return `<div class="${cls}"><label for="${id}">${label}${req}</label><input id="${id}" data-f="${path}" type="${opts.type||"text"}" value="${esc(v)}" placeholder="${esc(opts.ph||"")}" ${opts.list?`list="${opts.list}"`:""} ${opts.type==="number"?'step="0.01" min="0" inputmode="decimal"':""} ${opts.extra||""}>${opts.note||""}</div>`;
}
function abrirEditor(id){
  const d = id ? S.demandas.find(x=>x.id===id) : null;
  if(!d && !podeEditar()){ toast("Sem permissão para cadastrar demandas."); return; }
  E = d ? clone(d) : novaDemanda(); E0 = d ? clone(d) : null;
  E_RO = !podeAlterarDemanda();
  if(!E.visita.tecnico && CFG_().tecnicos[0]) E.visita.tecnico = CFG_().tecnicos[0].nome;
  desenharEditor();
}
function desenharEditor(){
  const cfg = CFG_(); const ro = E_RO ? "disabled" : "";
  const podeStatus = orgAtiva() && S.papel;  // técnico também altera o andamento
  const cidades = cfg.regioes.flatMap(r=>r.cidades||[]);
  const regOpts = [["","Selecione…"]].concat(cfg.regioes.map(r=>[r.id,r.nome]));
  const tecOpts = [["","—"]].concat(cfg.tecnicos.map(t=>[t.nome,t.nome]));
  if(E.visita.tecnico && !cfg.tecnicos.some(t=>t.nome===E.visita.tecnico)) tecOpts.push([E.visita.tecnico,E.visita.tecnico]);
  const seg = (name,path,opts) => `<div class="seg" role="radiogroup">${opts.map(([v,t])=>`<label><input type="radio" name="${name}" data-f="${path}" value="${v}" ${getP(E,path)===v?"checked":""} ${ro}>${t}</label>`).join("")}</div>`;
  const msgCli = `Olá ${E.cliente.nome.split(" ")[0]||""}, aqui é da ${S.org.nome}. Sobre o atendimento do seu ${E.equipamento.tipo.toLowerCase()}${E.dataAgendada?` agendado para ${fmtDia(E.dataAgendada)}${E.visita.janela?" ("+E.visita.janela+")":""}`:""}:`;
  $("#modal").innerHTML = `<div class="scrim" data-act="fecharFundo"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="edt">
    <div class="dhead"><div><h3 id="edt">${E0?esc(E0.cliente.nome||"Demanda"):"Nova demanda"}</h3><span class="mono" style="color:var(--muted);font-size:12px">${osCode(E)} · aberta em ${fmtD(E.criadaEm)}${E_RO?" · somente leitura":""}</span></div>
      <div class="row">${E0&&E.cliente.telefone?`<a class="btn sm wa" target="_blank" rel="noopener" href="${esc(waLink(E.cliente.telefone,msgCli))}">WhatsApp do cliente</a>`:""}<button class="btn ghost" data-act="fechar" aria-label="Fechar">✕</button></div></div>
    <div class="dbody">
      <fieldset ${podeEditar()?"":"disabled"}><legend>Ordem de serviço</legend>
        <div class="f s4"><label for="e-numero">Nº da OS</label>
          <div class="row" style="flex-wrap:nowrap"><input id="e-numero" data-f="numero" value="${esc(E.numero)}" placeholder="${podeEditar()?"Digite o número ou clique em Gerar":"Não informado"}" style="flex:1;min-width:0" autocomplete="off">
          ${podeEditar()?`<button class="btn" data-act="gerarOS" type="button" title="Usa o próximo número livre da sequência da empresa">Gerar número</button>`:""}</div>
          <span class="note" id="osnote">${podeEditar()?"":"Definido pelo administrativo"}</span></div>
      </fieldset>
      <fieldset ${ro}><legend>Cliente</legend>
        ${field("Nome","cliente.nome",{req:1,span:"s4"})}
        ${field("Telefone / WhatsApp","cliente.telefone",{req:1,span:"s2",type:"tel",ph:"(11) 90000-0000"})}
        ${field("CEP","cliente.cep",{span:"s2",ph:"Preenche o endereço",extra:'inputmode="numeric"',note:`<span class="note" id="cepnote"></span>`})}
        ${field("Endereço e número","cliente.endereco",{span:"s4",ph:"Rua, nº, complemento"})}
        ${field("Bairro","cliente.bairro",{span:"s2"})}
        ${field("Cidade","cliente.cidade",{req:1,span:"s2",list:"dl-cid"})}
        ${field("Região","regiao",{req:1,span:"s2",type:"select",options:regOpts,note:`<span class="note" id="regnote"></span>`})}
        ${field("Ponto de referência","cliente.referencia",{span:"s4"})}
        ${field("Outro telefone","cliente.telefone2",{span:"s2",type:"tel"})}
      </fieldset>
      <fieldset ${ro}><legend>Equipamento e problema</legend>
        ${field("Equipamento","equipamento.tipo",{req:1,span:"s2",type:"select",options:EQUIP.includes(E.equipamento.tipo)?EQUIP:EQUIP.concat([E.equipamento.tipo])})}
        ${field("Marca","equipamento.marca",{span:"s2"})}
        ${field("Modelo","equipamento.modelo",{span:"s2"})}
        ${field("Problema relatado","problema",{span:"s6",type:"textarea",ph:"O que o cliente descreveu"})}
        <div class="f s6"><label>Atendimento</label>${seg("tipo","tipo",[["garantia","Garantia (empresa parceira)"],["fora_garantia","Fora de garantia / avulso"]])}</div>
        <div class="f s6" id="garbox" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px" ${E.tipo==="garantia"?"":"hidden"}>
          ${field("Empresa parceira","empresa",{span:"",list:"dl-emp"})}${field("Nº da OS na empresa","osEmpresa",{span:""})}
        </div>
      </fieldset>
      <fieldset ${ro}><legend>Visita</legend>
        ${field("Data do atendimento","dataAgendada",{span:"s2",type:"date"})}
        ${field("Horário em que o cliente pode receber","visita.janela",{span:"s4",ph:"Ex.: 8h às 12h, após as 14h"})}
        ${field("Técnico","visita.tecnico",{span:"s2",type:"select",options:tecOpts})}
        ${field("Quem vai receber o técnico","visita.quemRecebe",{span:"s4",ph:"Nome de quem estará na residência"})}
        <div class="f s6"><label>Antes de chegar</label>${seg("aviso","visita.aviso",[["ligar","Ligar"],["mensagem","Mandar mensagem"],["nenhum","Não precisa"]])}</div>
        <div class="checks"><label><input type="checkbox" id="e-loc" data-f="visita.enviarLocalizacao" ${E.visita.enviarLocalizacao?"checked":""}> Enviar a localização ao técnico</label></div>
        ${field("Observações para a visita","visita.observacoes",{span:"s6",type:"textarea",ph:"Portaria, cachorro, estacionamento, acesso ao equipamento…"})}
      </fieldset>
      <fieldset ${podeStatus?"":"disabled"}><legend>Andamento</legend>
        ${field("Status","status",{span:"s2",type:"select",options:Object.entries(STATUS).map(([k,v])=>[k,v.t])})}
      </fieldset>
      <fieldset id="finbox" ${cobra(E)?"":"hidden"} ${ro}><legend>Orçamento e pagamento</legend>
        <div class="pecas"><label style="font-size:12.5px;color:var(--muted);font-weight:500">Peças necessárias</label><div id="pecas"></div>
          ${E_RO?"":`<div><button class="btn sm" data-act="addPeca">${I.plus}Adicionar peça</button></div>`}</div>
        ${field("Mão de obra (R$)","fin.maoDeObra",{span:"s2",type:"number"})}
        ${field("Deslocamento (R$)","fin.deslocamento",{span:"s2",type:"number"})}
        ${field("Forma de pagamento","fin.formaPagamento",{span:"s2",type:"select",options:PAGTO})}
        <div class="checks"><label><input type="checkbox" data-f="fin.sinalRecebido" ${E.fin.sinalRecebido?"checked":""}> Cliente depositou valor para compra das peças</label></div>
        <div class="f s2" id="sinalbox" ${E.fin.sinalRecebido?"":"hidden"}><label for="e-fin-sinalValor">Valor depositado (R$)</label><input id="e-fin-sinalValor" type="number" step="0.01" min="0" data-f="fin.sinalValor" value="${esc(E.fin.sinalValor)}"></div>
        <div class="checks"><label><input type="checkbox" data-f="fin.pago" ${E.fin.pago?"checked":""}> Pagamento total recebido</label></div>
        <div class="f s2" id="pagobox" ${E.fin.pago?"":"hidden"}><label for="e-fin-dataPagamento">Data do pagamento</label><input id="e-fin-dataPagamento" type="date" data-f="fin.dataPagamento" value="${esc(E.fin.dataPagamento)}"></div>
        <div class="totals" id="tot"></div>
      </fieldset>
    </div>
    <div class="dfoot"><div>${E0&&podeEditar()?`<button class="btn danger" data-act="excluir">Excluir</button>`:""}</div><div class="row"><button class="btn" data-act="fechar">${E_RO&&!podeStatus?"Fechar":"Cancelar"}</button>${podeStatus?`<button class="btn pri" data-act="salvarEditor">${E_RO?"Salvar andamento":"Salvar demanda"}</button>`:""}</div></div>
  </div></div>
  <datalist id="dl-cid">${cidades.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
  <datalist id="dl-emp">${[...new Set(S.demandas.map(d=>d.empresa).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join("")}</datalist>`;
  desenharPecas(); desenharTotais();
  if(!E_RO) setTimeout(()=>$("#e-cliente-nome")?.focus(),30);
}
function desenharPecas(){
  const box = $("#pecas"); if(!box) return; const ro = E_RO ? "disabled" : "";
  box.innerHTML = E.fin.pecas.length ? E.fin.pecas.map((p,i)=>`<div class="peca" style="margin-bottom:6px">
    <input id="pd-${i}" data-p="${i}.descricao" value="${esc(p.descricao)}" placeholder="Peça" aria-label="Descrição da peça" ${ro}>
    <input id="pq-${i}" data-p="${i}.qtd" type="number" min="1" value="${esc(p.qtd)}" aria-label="Quantidade" ${ro}>
    <input id="pv-${i}" data-p="${i}.valor" type="number" step="0.01" min="0" value="${esc(p.valor)}" placeholder="R$ unit." aria-label="Valor unitário" ${ro}>
    <label><input type="checkbox" data-p="${i}.comprada" ${p.comprada?"checked":""} ${ro}> Comprada</label>
    ${E_RO?"":`<button class="btn sm ghost danger" data-act="delPeca" data-i="${i}" aria-label="Remover peça">✕</button>`}</div>`).join("")
    : `<div style="font-size:13px;color:var(--faint)">Nenhuma peça informada.</div>`;
}
function desenharTotais(){
  const t = totais(E); const el = $("#tot"); if(!el) return;
  el.innerHTML = `<div><span>Peças</span><b>${brl(t.pecas)}</b></div><div><span>Total</span><b>${brl(t.total)}</b></div><div><span>Depositado</span><b>${brl(t.sinal)}</b></div><div><span>A receber</span><b style="color:${t.restante?"var(--warn)":"var(--ok)"}">${brl(t.restante)}</b></div>`;
}
function fecharEditor(){ E=null; E0=null; const m=$("#modal"); if(m) m.innerHTML=""; }
async function buscarCEP(cep){
  const c = digits(cep); if(c.length !== 8 || !E) return;
  const note = $("#cepnote"); if(note) note.textContent = "Buscando endereço…";
  try{
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`); const j = await r.json();
    if(!E) return;
    if(j.erro){ if(note) note.textContent = "CEP não encontrado"; return; }
    if(!E.cliente.endereco && j.logradouro){ E.cliente.endereco = j.logradouro + ", "; $("#e-cliente-endereco").value = E.cliente.endereco; }
    if(j.bairro){ E.cliente.bairro = j.bairro; $("#e-cliente-bairro").value = j.bairro; }
    if(j.localidade){ E.cliente.cidade = j.localidade; $("#e-cliente-cidade").value = j.localidade; sugerirRegiao(); }
    if(note) note.textContent = "Endereço preenchido pelo CEP";
    if(!E.cliente.endereco.match(/\d/)) $("#e-cliente-endereco")?.focus();
  }catch(e){ if(note) note.textContent = "Não foi possível consultar o CEP agora"; }
}
function sugerirRegiao(){
  const r = regiaoPorCidade(E.cliente.cidade);
  if(r && r!==E.regiao){ E.regiao=r; $("#e-regiao").value=r; $("#regnote").textContent="Sugerida pela cidade"; }
}
async function salvarEditor(){
  if(E_RO){ // técnico: só andamento
    const n = clone(E0); n.status = E.status;
    if(n.status==="concluida" && !n.concluidaEm) n.concluidaEm = n.dataAgendada && n.dataAgendada<=TODAY ? n.dataAgendada : TODAY;
    if(n.status!=="concluida") n.concluidaEm = "";
    if(await salvar(n)){ toast("Andamento atualizado"); fecharEditor(); } return;
  }
  if(!podeEditar()) E.numero = E0 ? E0.numero : "";            // técnico liberado não altera o Nº da OS
  E.numero = String(E.numero||"").trim();
  if(E.numero && S.demandas.some(d=>d.id!==E.id && String(d.numero)===E.numero)){ toast(`Já existe uma demanda com a OS ${E.numero}`); $("#e-numero")?.focus(); return; }
  const c = E.cliente; const faltam = [];
  if(!c.nome.trim()) faltam.push("nome"); if(!c.telefone.trim()) faltam.push("telefone"); if(!c.cidade.trim()) faltam.push("cidade"); if(!E.regiao) faltam.push("região");
  if(faltam.length){ toast("Preencha: "+faltam.join(", ")); return; }
  if(E.status==="reagendar" && (!E0 || E0.status!=="reagendar")) E.dataAgendada = "";
  const mudouData = E.dataAgendada && (!E0 || E0.dataAgendada!==E.dataAgendada || E0.regiao!==E.regiao);
  if(mudouData && E.status!=="concluida"){ const r = await confirmarDia(E, E.dataAgendada); if(r===null) return; E.dataAgendada = r; }
  if(E.dataAgendada && E.status==="pendente") E.status="agendada";
  if(!E.dataAgendada && E.status==="agendada") E.status="pendente";
  if(E.dataAgendada && (!E0 || E0.dataAgendada!==E.dataAgendada)) E.ordemRota = proximaOrdem(E.dataAgendada, E.id);
  if(E.status==="concluida" && !E.concluidaEm) E.concluidaEm = E.dataAgendada && E.dataAgendada<=TODAY ? E.dataAgendada : TODAY;
  if(E.status!=="concluida") E.concluidaEm = "";
  if(E.fin.pago && !E.fin.dataPagamento) E.fin.dataPagamento = TODAY;
  E.fin.pecas = E.fin.pecas.filter(p=>p.descricao||Number(p.valor));
  const novo = !E0;
  const s = await salvar(E); if(s){ toast(novo?(s.numero?`Demanda registrada (${osCode(s)})`:"Demanda registrada sem Nº de OS"):"Demanda atualizada"); fecharEditor(); }
}

/* ======================= aviso de região ======================= */
function confirmarDia(dem, dia){
  const a = analisar(dem, dia); const nomeR = esc(regiao(dem.regiao)?.nome||"esta região");
  const blocos = [];
  if(a.outrosDias.length && !a.jaTemRegiao){
    blocos.push(`<div class="conf bad"><b>${nomeR} já tem atendimento em outro dia</b>
      ${a.outrosDias.map(o=>`<div class="row" style="justify-content:space-between"><span>${fmtDia(o.dia)} · ${o.n} atendimento${o.n>1?"s":""}</span><button class="btn sm pri" data-res="${o.dia}">Mover para ${fmtDia(o.dia)}</button></div>`).join("")}
      <span style="font-size:13px">Você está colocando esta demanda em <b>${fmtDia(dia)}</b>. Juntar no mesmo dia evita uma viagem extra até a região.</span></div>`);
  }
  if(a.outrasRegioes.length) blocos.push(`<div class="conf warn"><b>${fmtDia(dia)} já tem outra região</b><span>${a.outrasRegioes.map(r=>chip(r)).join(" ")}</span></div>`);
  if(a.lotado) blocos.push(`<div class="conf warn"><b>Dia acima do limite</b><span>${fmtDia(dia)} ficará com ${a.total} atendimentos (limite ${a.cap}).</span></div>`);
  if(!blocos.length) return Promise.resolve(dia);
  return new Promise(res=>{
    const m = $("#modal2");
    m.innerHTML = `<div class="scrim center"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cfh"><h3 id="cfh">Confira antes de agendar</h3>
      <p style="color:var(--muted)">${esc(dem.cliente.nome)} · ${esc(dem.cliente.cidade)}</p>${blocos.join("")}
      <div class="row" style="justify-content:flex-end;margin-top:4px"><button class="btn" data-res="__cancel">Voltar</button><button class="btn" data-res="${dia}">Manter em ${fmtDia(dia)}</button></div></div></div>`;
    m.onclick = ev => { const b = ev.target.closest("[data-res]"); if(!b) return; m.onclick=null; m.innerHTML=""; res(b.dataset.res==="__cancel"?null:b.dataset.res); };
    m.querySelector("[data-res]")?.focus();
  });
}
async function agendar(id, dia){
  if(!podeEditar()) return;
  const d = S.demandas.find(x=>x.id===id); if(!d || d.dataAgendada===dia) return;
  if(dia){
    const r = await confirmarDia(d, dia); if(r===null) return;
    const n = clone(d); n.dataAgendada = r; n.ordemRota = proximaOrdem(r, id); if(n.status!=="concluida") n.status="agendada";
    if(await salvar(n)) toast(`${d.cliente.nome} → ${fmtDia(r)}`);
  } else { const n = clone(d); n.dataAgendada=""; if(n.status==="agendada") n.status="pendente"; await salvar(n); }
}
function perguntar(titulo, texto, acao){
  return new Promise(res=>{
    const m = $("#modal2");
    m.innerHTML = `<div class="scrim center"><div class="dialog" role="alertdialog" aria-modal="true"><h3>${titulo}</h3><p>${texto}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-r="0">Voltar</button><button class="btn pri" data-r="1">${acao}</button></div></div></div>`;
    m.onclick = ev => { const b = ev.target.closest("[data-r]"); if(!b) return; m.onclick=null; m.innerHTML=""; res(b.dataset.r==="1"); };
  });
}

/* ======================= roteiro do técnico ======================= */
let rotaAberta = null;
function textoRota(dia, ds){
  const regs = [...new Set(ds.map(d=>regiao(d.regiao)?.nome||"Sem região"))].join(" / ");
  const L = [`ROTEIRO ${fmtDia(dia).toUpperCase()} – ${regs}`, ""];
  ds.forEach((d,i)=>{
    L.push(`${i+1}) ${d.cliente.nome}${d.visita.janela?" – "+d.visita.janela:""}`);
    L.push(`   Tel: ${d.cliente.telefone}${d.cliente.telefone2?" / "+d.cliente.telefone2:""}`);
    L.push(`   ${[d.cliente.endereco,d.cliente.bairro,d.cliente.cidade].filter(Boolean).join(", ")}${d.cliente.referencia?" (ref.: "+d.cliente.referencia+")":""}`);
    L.push(`   ${[d.equipamento.tipo,d.equipamento.marca,d.equipamento.modelo].filter(Boolean).join(" ")}: ${d.problema||"—"}`);
    const av = [d.visita.quemRecebe?"Recebe: "+d.visita.quemRecebe:"", d.visita.aviso!=="nenhum"?AVISO[d.visita.aviso]:"", d.visita.enviarLocalizacao?"Enviar localização":""].filter(Boolean).join(" · ");
    if(av) L.push(`   ${av}`);
    L.push(cobra(d) ? `   Fora de garantia – cobrar ${brl(totais(d).restante)} (${d.fin.formaPagamento})${d.fin.pecas.length?" · Peças: "+d.fin.pecas.map(p=>p.descricao).join(", "):""}` : `   Garantia${d.empresa?" – "+d.empresa:""}${d.osEmpresa?" OS "+d.osEmpresa:""}`);
    if(d.visita.observacoes) L.push(`   Obs.: ${d.visita.observacoes}`);
    L.push("");
  });
  return L.join("\n");
}
function abrirRota(dia){ rotaAberta = dia; desenharRota(); }
function refreshOpenRoute(){ if(rotaAberta && !E) desenharRota(); }
function desenharRota(){
  const dia = rotaAberta; const ds = S.demandas.filter(d=>d.dataAgendada===dia && d.status!=="cancelada").sort((a,b)=>(a.ordemRota||0)-(b.ordemRota||0));
  const addrs = ds.map(d=>[d.cliente.endereco,d.cliente.bairro,d.cliente.cidade].filter(Boolean).join(", "));
  const maps = "https://www.google.com/maps/dir/" + addrs.map(encodeURIComponent).join("/");
  const texto = textoRota(dia, ds);
  const tecs = [...new Set(ds.map(d=>d.visita.tecnico).filter(Boolean))].map(n=>CFG_().tecnicos.find(t=>t.nome===n)||{nome:n,telefone:""});
  const ed = orgAtiva() && S.papel;
  $("#modal").innerHTML = `<div class="scrim center" data-act="fecharRotaFundo"><div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="rth">
    <div class="row" style="justify-content:space-between"><h3 id="rth">Roteiro · ${DOWL[parse(dia).getDay()]} ${fmtD(dia)}</h3><button class="btn ghost" data-act="fecharRota" aria-label="Fechar">✕</button></div>
    <div class="row">${[...new Set(ds.map(d=>d.regiao))].map(r=>chip(r)).join(" ")}<span style="color:var(--muted);font-size:13px">${ds.length} atendimento${ds.length!==1?"s":""}</span></div>
    <div>${ds.map((d,i)=>{ const aviso = `Olá ${d.cliente.nome.split(" ")[0]}, aqui é da ${S.org.nome}. O técnico está a caminho para o atendimento do seu ${d.equipamento.tipo.toLowerCase()}.`;
      return `<div class="rstop"><span class="n">${i+1}</span><div>
      <div class="row" style="justify-content:space-between"><b style="font-weight:600">${esc(d.cliente.nome)}</b><span class="row" style="gap:4px">${d.cliente.telefone?`<a class="btn sm wa" target="_blank" rel="noopener" href="${esc(waLink(d.cliente.telefone, aviso))}">Avisar cliente</a>`:""}${d.status==="concluida"?pill("concluida"):ed?`<button class="btn sm" data-act="concluir" data-id="${d.id}">Marcar concluída</button>`:""}</span></div>
      <p class="sub">${esc(d.visita.janela||"Horário livre")} · <span class="mono">${esc(d.cliente.telefone)}</span></p>
      <p>${esc(addrs[i])} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrs[i])}" target="_blank" rel="noopener" style="color:var(--accent)">mapa</a></p>
      <p class="sub">${esc(d.equipamento.tipo)} ${esc(d.equipamento.marca)} — ${esc(d.problema||"sem descrição")}</p>
      <div class="flags" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${d.visita.quemRecebe?`<span class="flag">Recebe: ${esc(d.visita.quemRecebe)}</span>`:""}${flags(d)}</div>
    </div></div>`; }).join("")}</div>
    <label for="rtxt" style="font-size:12.5px;color:var(--muted)">Mensagem para o técnico</label>
    <pre class="copy" id="rtxt">${esc(texto)}</pre>
    <div class="row" style="justify-content:flex-end">
      <a class="btn" href="${esc(maps)}" target="_blank" rel="noopener">Rota no Google Maps</a>
      ${(tecs.length?tecs:[{nome:"",telefone:""}]).map(t=>`<a class="btn wa" href="${esc(waLink(t.telefone, texto))}" target="_blank" rel="noopener">WhatsApp${t.nome?" p/ "+esc(t.nome):""}</a>`).join("")}
      <button class="btn pri" data-act="copiarRota">Copiar mensagem</button></div>
  </div></div>`;
}

/* ======================= eventos ======================= */
let dragId = null;
document.addEventListener("submit", async ev=>{
  const f = ev.target.closest("form[data-form]"); if(!f) return; ev.preventDefault();
  const d = Object.fromEntries(new FormData(f).entries()); const k = f.dataset.form;
  const btn = f.querySelector("button[type=submit]"); if(btn){ btn.disabled = true; }
  S.authMsg = null;
  try{
    if(k==="entrar"){ await API.entrar(d.email.trim(), d.senha); const u = await API.sessao(); if(u) await posLogin(u); }
    else if(k==="cadastrar"){ const r = await API.cadastrar(d.email.trim(), d.senha, d.nome); if(r.precisaConfirmar){ S.authMsg={t:"ok",m:`Enviamos um link de confirmação para ${d.email}. Abra o e-mail e clique no link para entrar.`}; S.telaAuth="entrar"; renderRoot(); } else { const u = await API.sessao(); if(u) await posLogin(u); } }
    else if(k==="recuperar"){ await API.recuperar(d.email.trim()); S.authMsg={t:"ok",m:"Se o e-mail estiver cadastrado, você vai receber um link para criar nova senha."}; renderRoot(); }
    else if(k==="novaSenha"){ await API.novaSenha(d.senha); toast("Senha alterada"); const u = await API.sessao(); if(u) await posLogin(u); }
    else if(k==="criarEmpresa"){ const id = await API.criarEmpresa(d.nome.trim(), d.cnpj, d.meu, configPadrao(d.modelo)); S.empresas = await API.minhasEmpresas(S.user.id); await abrirEmpresa(id); toast("Empresa criada. Bom trabalho!"); }
    else if(k==="entrarConvite"){ const id = await API.entrarConvite(d.codigo.trim(), ""); S.empresas = await API.minhasEmpresas(S.user.id); await abrirEmpresa(id); toast("Você entrou na empresa"); }
  }catch(e){ S.authMsg = {t:"err", m:traduzErro(e)}; if(S.fase!=="app") renderRoot(); else toast(S.authMsg.m); }
  finally{ if(btn && document.body.contains(btn)) btn.disabled = false; }
});

document.addEventListener("click", async ev=>{
  const b = ev.target.closest("[data-act]"); if(!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  if((a==="fecharFundo" || a==="fecharRotaFundo") && ev.target!==b) return;
  if(await acaoImportar(a, b, ev)) return;
  switch(a){
    case "authTela": S.telaAuth=b.dataset.t; S.authMsg=null; renderRoot(); break;
    case "sair": await API.sair(); S.fase="auth"; S.telaAuth="entrar"; S.org=null; S.user=null; S.authMsg=null; renderRoot(); break;
    case "zerarDemo": if(await perguntar("Restaurar demonstração?","Todos os dados da demonstração neste navegador serão apagados e os exemplos voltam.","Restaurar")) API.zerar(); break;
    case "nav": S.view=b.dataset.v; CFG=null; if(S.view==="equipe"){ EQUIPE={membros:null,convites:null,novo:EQUIPE.novo}; } if(S.view==="plataforma") PLAT=null; try{history.replaceState(null,"","#"+S.view);}catch(e){} render(); window.scrollTo(0,0); break;
    case "nova": abrirEditor(null); break;
    case "abrir": if(rotaAberta){ rotaAberta=null; } abrirEditor(id); break;
    case "fechar": case "fecharFundo": fecharEditor(); break;
    case "salvarEditor": salvarEditor(); break;
    case "excluir": if(await perguntar("Excluir demanda?",`A demanda de ${esc(E.cliente.nome)} será apagada definitivamente.`,"Excluir")){ if(await excluir(E.id)){ fecharEditor(); toast("Demanda excluída"); } } break;
    case "addPeca": E.fin.pecas.push({descricao:"",qtd:1,valor:0,comprada:false}); desenharPecas(); desenharTotais(); $(`#pd-${E.fin.pecas.length-1}`)?.focus(); break;
    case "delPeca": E.fin.pecas.splice(+b.dataset.i,1); desenharPecas(); desenharTotais(); break;
    case "exportar": exportarCSV(); break;
    case "gerarOS": {
      if(!E || !podeEditar()) break;
      if(E.numero && !(await perguntar("Substituir o número?", `Esta demanda já tem a OS ${esc(E.numero)}. Gerar outro número no lugar?`, "Gerar novo"))) break;
      b.disabled = true;
      try{ const [n] = await API.gerarNumeros(S.org.id, 1, CFG_().prefixoOS||""); E.numero = n; $("#e-numero").value = n; $("#osnote").textContent = "Número gerado. Ele fica reservado para esta demanda ao salvar."; }
      catch(e){ toast(traduzErro(e)); }
      b.disabled = false; break; }
    case "sem": S.semana = b.dataset.n==="0" ? startOfWeek(TODAY) : addDays(S.semana,+b.dataset.n); render(); break;
    case "agendarSel": agendar(id, $("#ag-"+id).value); break;
    case "agendarGrupo": {
      const lst = S.demandas.filter(d=>ABERTAS.includes(d.status) && !d.dataAgendada && d.regiao===b.dataset.r);
      let ord = proximaOrdem(b.dataset.dia);
      for(const d of lst){ const n=clone(d); n.dataAgendada=b.dataset.dia; n.status="agendada"; n.ordemRota=ord++; await salvar(n); }
      toast(`${lst.length} demanda${lst.length>1?"s":""} em ${fmtDia(b.dataset.dia)}`); break; }
    case "desagendar": agendar(id, ""); break;
    case "mover": {
      const d = S.demandas.find(x=>x.id===id);
      const ds = S.demandas.filter(x=>x.dataAgendada===d.dataAgendada && x.status!=="cancelada").sort((p,q)=>(p.ordemRota||0)-(q.ordemRota||0));
      const i = ds.findIndex(x=>x.id===id), j = i + (+b.dataset.dir); if(j<0||j>=ds.length) break;
      [ds[i],ds[j]] = [ds[j],ds[i]];
      for(let k=0;k<ds.length;k++){ if((ds[k].ordemRota||0)!==k+1){ const n=clone(ds[k]); n.ordemRota=k+1; await salvar(n); } }
      break; }
    case "rotaDia": abrirRota(b.dataset.dia); break;
    case "fecharRota": case "fecharRotaFundo": rotaAberta=null; $("#modal").innerHTML=""; break;
    case "concluir": { const d=S.demandas.find(x=>x.id===id); const n=clone(d); n.status="concluida"; n.concluidaEm=n.dataAgendada<=TODAY?n.dataAgendada:TODAY; if(await salvar(n)) toast("Atendimento concluído"); break; }
    case "copiarRota": copiarTexto($("#rtxt").textContent, $("#rtxt")); break;
    case "pago": { const d=S.demandas.find(x=>x.id===id); const n=clone(d); n.fin.pago = b.dataset.v==="1"; n.fin.dataPagamento = n.fin.pago?TODAY:""; if(await salvar(n)) toast(n.fin.pago?"Pagamento registrado":"Pagamento desfeito"); break; }
    case "comprada": { const d=S.demandas.find(x=>x.id===id); const n=clone(d); n.fin.pecas[+b.dataset.i].comprada=true; if(await salvar(n)) toast("Peça marcada como comprada"); break; }
    // equipe
    case "criarConvite": try{ EQUIPE.novo = await API.criarConvite(S.org.id, $("#novoPapel").value); EQUIPE.convites = await API.convites(S.org.id); render(); }catch(e){ toast(traduzErro(e)); } break;
    case "copiarConvite": copiarTexto($("#convLink").value, $("#convLink")); break;
    case "apagarConvite": try{ await API.apagarConvite(S.org.id, b.dataset.c); EQUIPE.convites = EQUIPE.convites.filter(c=>c.codigo!==b.dataset.c); if(EQUIPE.novo?.codigo===b.dataset.c) EQUIPE.novo=null; render(); }catch(e){ toast(traduzErro(e)); } break;
    case "removerMembro": if(await perguntar("Remover da equipe?",`${esc(b.dataset.nome)} perde o acesso aos dados de ${esc(S.org.nome)}.`,"Remover")){ try{ await API.removerMembro(S.org.id, b.dataset.uid); EQUIPE.membros = EQUIPE.membros.filter(m=>m.user_id!==b.dataset.uid); render(); toast("Acesso removido"); }catch(e){ toast(traduzErro(e)); } } break;
    // configurações
    case "cfgAddReg": { const usadas = new Set(CFG.config.regioes.map(r=>r.cor%9)); let cor=0; while(usadas.has(cor)&&cor<8) cor++; CFG.config.regioes.push({id:"r"+uuid().slice(0,8),nome:"Nova região",cor,cidades:[]}); render(); break; }
    case "cfgModeloSP": { const ids = new Set(CFG.config.regioes.map(r=>r.id)); REGIOES_SP.forEach(r=>{ if(!ids.has(r.id)) CFG.config.regioes.push(clone(r)); }); render(); break; }
    case "cfgDelReg": { const r = CFG.config.regioes[+b.dataset.i]; const n = S.demandas.filter(d=>d.regiao===r.id && d.status!=="cancelada").length;
      if(n){ toast(`${n} demanda${n>1?"s usam":" usa"} esta região. Mude a região delas antes de remover.`); break; }
      CFG.config.regioes.splice(+b.dataset.i,1); render(); break; }
    case "cfgAddTec": CFG.config.tecnicos.push({nome:"",telefone:""}); render(); $(`#tn-${CFG.config.tecnicos.length-1}`)?.focus(); break;
    case "cfgDelTec": CFG.config.tecnicos.splice(+b.dataset.i,1); render(); break;
    case "cfgReset": CFG=null; render(); break;
    case "cfgSave": {
      const c = clone(CFG.config); c.tecnicos = c.tecnicos.map(t=>({nome:t.nome.trim(), telefone:t.telefone.trim()})).filter(t=>t.nome);
      if(!c.tecnicos.length) c.tecnicos=[{nome:"Técnico principal",telefone:""}];
      c.capacidadeDia = Math.max(1, +c.capacidadeDia||9); c.diasAtendimento = +c.diasAtendimento||6; c.prefixoOS = String(c.prefixoOS||"").trim();
      if(CFG.nome.trim().length<2){ toast("Informe o nome da empresa"); break; }
      try{ await API.salvarEmpresa(S.org.id, {nome:CFG.nome.trim(), cnpj:CFG.cnpj.trim()||null, config:c}); S.org.nome=CFG.nome.trim(); S.org.cnpj=CFG.cnpj.trim(); S.org.config=normConfig(c); CFG=null; renderShell(); render(); toast("Configurações salvas"); }
      catch(e){ toast(traduzErro(e)); } break; }
    // plataforma
    case "platRecarregar": PLAT=null; render(); break;
    case "platSalvar": try{ await API.definirPlano(id, $("#pl-"+id).value, $("#pt-"+id).value); toast("Plano atualizado"); PLAT=null; render(); }catch(e){ toast(traduzErro(e)); } break;
  }
});
async function copiarTexto(t, el){
  try{ await navigator.clipboard.writeText(t); toast("Copiado"); }
  catch(e){ if(el.select){ el.select(); } else { const r=document.createRange(); r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r); } toast("Texto selecionado. Copie com Ctrl+C"); }
}

document.addEventListener("change", async ev=>{
  const t = ev.target;
  if(t.id==="orgsel"){ await abrirEmpresa(t.value); return; }
  if(t.dataset.perm){ try{ await API.mudarPermissao(S.org.id, t.dataset.perm, t.checked); const m = EQUIPE.membros.find(x=>x.user_id===t.dataset.perm); if(m) m.pode_editar_demandas=t.checked; toast(t.checked?"Técnico liberado para alterar demandas":"Técnico volta a só marcar o andamento"); }catch(e){ t.checked=!t.checked; toast(traduzErro(e)); } return; }
  if(t.dataset.papel){ try{ await API.mudarPapel(S.org.id, t.dataset.papel, t.value); const m = EQUIPE.membros.find(x=>x.user_id===t.dataset.papel); if(m) m.papel=t.value; render(); toast("Papel atualizado"); }catch(e){ toast(traduzErro(e)); } return; }
  if(t.type==="radio" && t.dataset.f && E){ setP(E,t.dataset.f,t.value); if(t.dataset.f==="tipo"){ $("#finbox").hidden=t.value!=="fora_garantia"; $("#garbox").hidden=t.value!=="garantia"; } }
  if(t.id==="e-cliente-cep") buscarCEP(t.value);
  if(t.id==="e-cliente-cidade" && E) sugerirRegiao();
  mudancaImportar(ev);
});
document.addEventListener("input", ev=>{
  const t = ev.target;
  if(t.dataset.filter){ S.f[t.dataset.filter]=t.value; render(); return; }
  if(t.dataset.ff){ S.ff=t.value; render(); return; }
  if(t.dataset.cfg && CFG){
    const k=t.dataset.cfg, i=t.dataset.i, c = CFG.config;
    if(k==="nome") c.regioes[i].nome=t.value;
    else if(k==="cidades") c.regioes[i].cidades=t.value.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
    else if(k==="tecNome") c.tecnicos[i].nome=t.value;
    else if(k==="tecTel") c.tecnicos[i].telefone=t.value;
    else if(k==="empNome") CFG.nome=t.value;
    else if(k==="empCnpj") CFG.cnpj=t.value;
    else c[k]=t.value;
    return;
  }
  if(!E) return;
  if(E_RO){ if(t.dataset.f==="status") setP(E,"status",t.value); return; }
  if(t.dataset.p){ const [i,k]=t.dataset.p.split("."); E.fin.pecas[i][k] = t.type==="checkbox"?t.checked:(t.type==="number"?(t.value===""?"":Number(t.value)):t.value); desenharTotais(); return; }
  if(t.dataset.f){
    const p = t.dataset.f; let v = t.type==="checkbox"?t.checked:(t.type==="number"?(t.value===""?0:Number(t.value)):t.value);
    if(t.type==="radio" && !t.checked) return;
    setP(E,p,v);
    if(p==="tipo"){ $("#finbox").hidden = v!=="fora_garantia"; $("#garbox").hidden = v!=="garantia"; }
    if(p==="fin.sinalRecebido") $("#sinalbox").hidden=!v;
    if(p==="fin.pago") $("#pagobox").hidden=!v;
    if(p==="cliente.cep" && digits(v).length===8) buscarCEP(v);
    if(p==="regiao") $("#regnote").textContent="";
    if(p.startsWith("fin.")) desenharTotais();
  }
});
document.addEventListener("keydown", ev=>{ if(ev.key==="Escape"){ if($("#modal2").innerHTML){ $("#modal2").querySelector('[data-res="__cancel"],[data-r="0"]')?.click(); } else if(rotaAberta){ rotaAberta=null; $("#modal").innerHTML=""; } else if(E) fecharEditor(); } });

document.addEventListener("dragstart", ev=>{ const c=ev.target.closest?.("[data-drag]"); if(!c) return; dragId=c.dataset.drag; ev.dataTransfer.effectAllowed="move"; try{ev.dataTransfer.setData("text/plain",dragId);}catch(e){} });
document.addEventListener("dragover", ev=>{ const z=ev.target.closest?.("[data-drop]"); if(!z||!dragId) return; ev.preventDefault(); document.querySelectorAll(".drop").forEach(x=>x!==z&&x.classList.remove("drop")); z.classList.add("drop"); });
document.addEventListener("dragleave", ev=>{ const z=ev.target.closest?.("[data-drop]"); if(z && !z.contains(ev.relatedTarget)) z.classList.remove("drop"); });
document.addEventListener("drop", ev=>{ const z=ev.target.closest?.("[data-drop]"); document.querySelectorAll(".drop").forEach(x=>x.classList.remove("drop")); if(!z||!dragId) return; ev.preventDefault(); const id=dragId; dragId=null; agendar(id, z.dataset.drop); });
document.addEventListener("dragend", ()=>{ dragId=null; document.querySelectorAll(".drop").forEach(x=>x.classList.remove("drop")); });

boot();
