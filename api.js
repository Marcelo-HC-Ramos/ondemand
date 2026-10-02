/* ======================= camada de dados =======================
 * Duas implementações com a mesma interface:
 *  - SupabaseAPI: produção (multiempresa, login, tempo real)
 *  - DemoAPI: modo demonstração, tudo salvo no navegador
 */
const toRow = (d, org) => ({
  id: d.id, org_id: org, numero: (d.numero||"").toString().trim() || null, status: d.status, tipo: d.tipo, regiao: d.regiao || null,
  data_agendada: d.dataAgendada || null, ordem_rota: d.ordemRota || 0, concluida_em: d.concluidaEm || null,
  criada_em: d.criadaEm || TODAY, empresa: d.empresa || null, os_empresa: d.osEmpresa || null, problema: d.problema || null,
  cliente: d.cliente, equipamento: d.equipamento, visita: d.visita, fin: d.fin, lote_id: d.loteId || null
});
const fromRow = r => normDem({
  id: r.id, numero: r.numero || "", status: r.status, tipo: r.tipo, regiao: r.regiao || "",
  dataAgendada: r.data_agendada || "", ordemRota: r.ordem_rota || 0, concluidaEm: r.concluida_em || "",
  criadaEm: r.criada_em, empresa: r.empresa || "", osEmpresa: r.os_empresa || "", problema: r.problema || "",
  cliente: r.cliente, equipamento: r.equipamento, visita: r.visita, fin: r.fin, loteId: r.lote_id
});
const orgFromRow = o => ({ id:o.id, nome:o.nome, cnpj:o.cnpj||"", plano:o.plano, testeAte:o.teste_ate, config: normConfig(o.config) });

function traduzErro(e){
  const m = String(e?.message || e || "");
  if(/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if(/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if(/User already registered/i.test(m)) return "Já existe uma conta com este e-mail. Use “Entrar” ou recupere a senha.";
  if(/Password should be at least/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if(/rate limit/i.test(m)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  if(/demandas_org_numero_uq/i.test(m)) return "Já existe uma demanda com este número de OS.";
  if(/row-level security/i.test(m)) return "Sem permissão para esta ação. Verifique seu papel na empresa ou o plano da empresa.";
  if(/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Verifique a internet.";
  return m || "Algo deu errado.";
}

function SupabaseAPI(cfg){
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  const ok = ({data, error}) => { if(error) throw new Error(traduzErro(error)); return data; };
  let canal = null;
  const volta = () => location.origin + location.pathname;
  return {
    demo: false,
    async sessao(){ const {data} = await sb.auth.getSession(); return data.session ? {id:data.session.user.id, email:data.session.user.email} : null; },
    aoMudarSessao(cb){ sb.auth.onAuthStateChange((ev, s) => cb(ev, s ? {id:s.user.id, email:s.user.email} : null)); },
    async entrar(email, senha){ ok(await sb.auth.signInWithPassword({email, password:senha})); },
    async cadastrar(email, senha, nome){ const d = ok(await sb.auth.signUp({email, password:senha, options:{emailRedirectTo: volta(), data:{nome}}})); return {precisaConfirmar: !d.session}; },
    async recuperar(email){ ok(await sb.auth.resetPasswordForEmail(email, {redirectTo: volta()})); },
    async novaSenha(senha){ ok(await sb.auth.updateUser({password: senha})); },
    async sair(){ if(canal){ sb.removeChannel(canal); canal=null; } await sb.auth.signOut(); },

    async minhasEmpresas(uid){
      const rows = ok(await sb.from("membros").select("papel,nome,pode_editar_demandas,organizacoes(id,nome,cnpj,plano,teste_ate,config)").eq("user_id", uid));
      return rows.filter(r=>r.organizacoes).map(r => ({ papel:r.papel, meuNome:r.nome||"", tecPode:!!r.pode_editar_demandas, org: orgFromRow(r.organizacoes) }));
    },
    async criarEmpresa(nome, cnpj, meuNome, config){ return ok(await sb.rpc("criar_organizacao", {p_nome:nome, p_cnpj:cnpj||"", p_nome_usuario:meuNome||"", p_config:config})); },
    async entrarConvite(codigo, meuNome){ return ok(await sb.rpc("entrar_com_convite", {p_codigo:codigo, p_nome_usuario:meuNome||""})); },
    async salvarEmpresa(orgId, campos){ ok(await sb.from("organizacoes").update(campos).eq("id", orgId)); },

    async demandas(orgId){
      const corte = addDays(TODAY, -180); const out = []; const passo = 1000;
      for(let de=0; ; de+=passo){
        const rows = ok(await sb.from("demandas").select("*").eq("org_id", orgId)
          .or(`data_agendada.gte.${corte},data_agendada.is.null,concluida_em.gte.${corte},criada_em.gte.${corte},status.in.(pendente,agendada,aguardando_peca,reagendar),and(tipo.eq.fora_garantia,fin->>pago.neq.true)`)
          .order("criada_em", {ascending:false}).range(de, de+passo-1));
        out.push(...rows); if(rows.length < passo) break;
      }
      return out.map(fromRow);
    },
    async salvar(orgId, d){ return fromRow(ok(await sb.from("demandas").upsert(toRow(d, orgId)).select().single())); },
    async excluir(orgId, id){ ok(await sb.from("demandas").delete().eq("id", id).eq("org_id", orgId)); },
    async importar(orgId, lista, arquivo, progresso){
      const lote = ok(await sb.from("lotes_importacao").insert({org_id:orgId, arquivo, total:lista.length}).select().single());
      const criadas = [];
      for(let i=0; i<lista.length; i+=200){
        const parte = lista.slice(i, i+200).map(d => toRow(Object.assign({}, d, {loteId: lote.id}), orgId));
        criadas.push(...ok(await sb.from("demandas").insert(parte).select()).map(fromRow));
        progresso && progresso(Math.min(lista.length, i+200), lista.length);
      }
      return {loteId: lote.id, criadas};
    },
    async lotes(orgId){ return ok(await sb.from("lotes_importacao").select("*").eq("org_id", orgId).order("criado_em", {ascending:false}).limit(20)); },
    async desfazerLote(orgId, loteId){ ok(await sb.from("demandas").delete().eq("org_id", orgId).eq("lote_id", loteId)); ok(await sb.from("lotes_importacao").delete().eq("id", loteId)); },

    async membros(orgId){ return ok(await sb.from("membros").select("user_id,papel,nome,email,criado_em,pode_editar_demandas").eq("org_id", orgId).order("criado_em")); },
    async mudarPapel(orgId, uid, papel){ ok(await sb.from("membros").update({papel}).eq("org_id", orgId).eq("user_id", uid)); },
    async mudarPermissao(orgId, uid, pode){ ok(await sb.from("membros").update({pode_editar_demandas: pode}).eq("org_id", orgId).eq("user_id", uid)); },
    async gerarNumeros(orgId, qtd, prefixo){ return ok(await sb.rpc("gerar_numeros_os", {p_org:orgId, p_qtd:qtd, p_prefixo:prefixo||""})).map(x => typeof x === "string" ? x : Object.values(x)[0]); },
    async removerMembro(orgId, uid){ ok(await sb.from("membros").delete().eq("org_id", orgId).eq("user_id", uid)); },
    async convites(orgId){ return ok(await sb.from("convites").select("*").eq("org_id", orgId).is("usado_por", null).gte("expira_em", new Date().toISOString()).order("criado_em", {ascending:false})); },
    async criarConvite(orgId, papel){ return ok(await sb.from("convites").insert({org_id:orgId, papel}).select().single()); },
    async apagarConvite(orgId, codigo){ ok(await sb.from("convites").delete().eq("codigo", codigo).eq("org_id", orgId)); },

    async souAdminPlataforma(uid){ const r = await sb.from("plataforma_admins").select("user_id").eq("user_id", uid).maybeSingle(); return !!r.data; },
    async resumoPlataforma(){ return ok(await sb.rpc("resumo_plataforma")); },
    async definirPlano(orgId, plano, testeAte){ ok(await sb.rpc("definir_plano", {p_org:orgId, p_plano:plano, p_teste_ate:testeAte||null})); },

    ouvir(orgId, aoMudar, uid){
      if(canal) sb.removeChannel(canal);
      canal = sb.channel("org-"+orgId)
        .on("postgres_changes", {event:"*", schema:"public", table:"membros", filter:`user_id=eq.${uid}`}, p => {
          const r = p.new && p.new.org_id ? p.new : null;
          if(p.eventType === "DELETE") aoMudar({tipo:"membro", removido:true});
          else if(r && r.org_id === orgId) aoMudar({tipo:"membro", papel:r.papel, tecPode:!!r.pode_editar_demandas});
        })
        .on("postgres_changes", {event:"*", schema:"public", table:"demandas", filter:`org_id=eq.${orgId}`}, p => {
          if(p.eventType === "DELETE") aoMudar({tipo:"removida", id:p.old.id});
          else aoMudar({tipo:"salva", demanda: fromRow(p.new)});
        })
        .on("postgres_changes", {event:"UPDATE", schema:"public", table:"organizacoes", filter:`id=eq.${orgId}`}, p => aoMudar({tipo:"empresa", org: orgFromRow(p.new)}))
        .subscribe();
    }
  };
}

function DemoAPI(){
  const KEY = "ondemand-demo-v1";
  let db;
  try{ db = JSON.parse(localStorage.getItem(KEY)); }catch(e){ db = null; }
  const grava = () => { try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){} };
  if(!db){
    const org = {id:"demo-org", nome:"Assistência Modelo (demonstração)", cnpj:"", plano:"teste", testeAte:addDays(TODAY,14), config: configPadrao("sp")};
    const ws = startOfWeek(TODAY);
    const ex = (o) => normDem(Object.assign(novaDemanda(), o));
    const dem = [
      ex({numero:1,status:"concluida",tipo:"garantia",empresa:"Electrolux",osEmpresa:"778120",regiao:"cps",dataAgendada:ws,concluidaEm:ws,ordemRota:1,problema:"Não gela embaixo",cliente:{nome:"Maria Souza (exemplo)",telefone:"(19) 99811-2040",endereco:"Rua das Palmeiras, 120",bairro:"Cambuí",cidade:"Campinas"},equipamento:{tipo:"Geladeira",marca:"Electrolux",modelo:"DF44"}}),
      ex({numero:2,status:"agendada",tipo:"fora_garantia",regiao:"cps",dataAgendada:addDays(ws,1),ordemRota:1,problema:"Não centrifuga",cliente:{nome:"Carlos Lima (exemplo)",telefone:"(19) 98702-3311",endereco:"Av. Brasil, 88",bairro:"Centro",cidade:"Valinhos"},equipamento:{tipo:"Máquina de lavar",marca:"Brastemp"},visita:{janela:"Após as 14h",aviso:"mensagem",enviarLocalizacao:true,quemRecebe:"Pedro",tecnico:"Técnico principal"},fin:{pecas:[{descricao:"Atuador de freio",qtd:1,valor:145,comprada:false}],maoDeObra:180,deslocamento:60,formaPagamento:"PIX",sinalRecebido:true,sinalValor:145,pago:false}}),
      ex({numero:3,status:"agendada",tipo:"garantia",empresa:"Whirlpool",regiao:"baix",dataAgendada:addDays(ws,3),ordemRota:1,problema:"Vazamento na porta",cliente:{nome:"Ana Ribeiro (exemplo)",telefone:"(13) 99640-1122",endereco:"Rua Tolentino Filgueiras, 45",bairro:"Gonzaga",cidade:"Santos"},equipamento:{tipo:"Lava-louças",marca:"Brastemp"}}),
      ex({numero:4,status:"agendada",tipo:"garantia",empresa:"Samsung",regiao:"cps",dataAgendada:addDays(ws,4),ordemRota:1,problema:"Pinga água",cliente:{nome:"Fernanda Costa (exemplo)",telefone:"(19) 99450-7788",endereco:"Rua Sete de Setembro, 910",bairro:"Jd. Planalto",cidade:"Hortolândia"},equipamento:{tipo:"Ar-condicionado",marca:"Samsung"}}),
      ex({numero:5,status:"pendente",tipo:"fora_garantia",regiao:"baix",problema:"Não aquece",cliente:{nome:"Roberto Nunes (exemplo)",telefone:"(13) 98877-4410",endereco:"Av. Presidente Wilson, 1500",bairro:"Itararé",cidade:"São Vicente"},equipamento:{tipo:"Micro-ondas",marca:"Panasonic"},fin:{pecas:[{descricao:"Magnetron",qtd:1,valor:210,comprada:false}],maoDeObra:150,deslocamento:80,formaPagamento:"PIX"}}),
      ex({numero:6,status:"pendente",tipo:"garantia",empresa:"Electrolux",regiao:"vale",problema:"Erro E-21",cliente:{nome:"Luciana Martins (exemplo)",telefone:"(12) 99300-5566",endereco:"Rua Paraibuna, 77",bairro:"Jd. São Dimas",cidade:"São José dos Campos"},equipamento:{tipo:"Lava e seca",marca:"Electrolux"}}),
    ];
    db = {user:{id:"demo-user", email:"voce@demonstracao"}, logado:true, orgs:[org], papel:"admin", demandas:{[org.id]:dem.map(d=>{ const x = clone(d); x.numero = String(x.numero).padStart(4,"0"); return x; })}, seq:{[org.id]:6},
      membros:{[org.id]:[{user_id:"demo-tec", papel:"tecnico", nome:"Técnico de exemplo", email:"tecnico@demonstracao", pode_editar_demandas:false, criado_em:new Date().toISOString()}]}, lotes:{[org.id]:[]}, convites:{[org.id]:[]}};
    grava();
  }
  const listaD = o => (db.demandas[o] ||= []);
  let ouvinte = null;
  const avisa = ev => { ouvinte && setTimeout(()=>ouvinte(ev), 0); };
  return {
    demo: true,
    async sessao(){ return db.logado ? db.user : null; },
    aoMudarSessao(){},
    async entrar(){ db.logado = true; grava(); }, async cadastrar(){ db.logado = true; grava(); return {precisaConfirmar:false}; },
    async recuperar(){}, async novaSenha(){},
    async sair(){ db.logado = false; grava(); },
    async minhasEmpresas(){ return db.orgs.map(o=>({papel:db.papel, meuNome:"Você", tecPode:false, org: Object.assign({}, o, {config: normConfig(o.config)})})); },
    async criarEmpresa(nome, cnpj, meuNome, config){ const o = {id:"demo-"+uuid().slice(0,8), nome, cnpj, plano:"teste", testeAte:addDays(TODAY,14), config}; db.orgs.push(o); db.seq[o.id]=0; grava(); return o.id; },
    async entrarConvite(){ throw new Error("Convites funcionam depois de conectar o Supabase."); },
    async salvarEmpresa(orgId, campos){ const o = db.orgs.find(x=>x.id===orgId); Object.assign(o, campos); grava(); },
    async demandas(orgId){ return listaD(orgId).map(d=>normDem(clone(d))); },
    async salvar(orgId, d){ const L = listaD(orgId); d = clone(d); d.numero = String(d.numero||"").trim(); if(d.numero && L.some(x=>x.id!==d.id && x.numero===d.numero)) throw new Error("Já existe uma demanda com este número de OS."); const i = L.findIndex(x=>x.id===d.id); if(i>=0) L[i]=d; else L.push(d); grava(); avisa({tipo:"salva", demanda: normDem(clone(d))}); return normDem(clone(d)); },
    async excluir(orgId, id){ db.demandas[orgId] = listaD(orgId).filter(d=>d.id!==id); grava(); avisa({tipo:"removida", id}); },
    async importar(orgId, lista, arquivo, progresso){
      const loteId = uuid(); const criadas = [];
      lista.forEach(d=>{ const n = clone(d); n.loteId = loteId; listaD(orgId).push(n); criadas.push(normDem(clone(n))); });
      (db.lotes[orgId] ||= []).unshift({id:loteId, arquivo, total:lista.length, criado_em:new Date().toISOString()});
      grava(); progresso && progresso(lista.length, lista.length); return {loteId, criadas};
    },
    async lotes(orgId){ return (db.lotes[orgId]||[]).slice(0,20); },
    async desfazerLote(orgId, loteId){ db.demandas[orgId] = listaD(orgId).filter(d=>d.loteId!==loteId); db.lotes[orgId] = (db.lotes[orgId]||[]).filter(l=>l.id!==loteId); grava(); },
    async membros(orgId){ return [{user_id:db.user.id, papel:"admin", nome:"Administrador", email:db.user.email, pode_editar_demandas:false, criado_em:new Date().toISOString()}].concat(((db.membros||{})[orgId])||[]); },
    async mudarPapel(orgId, uid, papel){ const m = ((db.membros||{})[orgId]||[]).find(x=>x.user_id===uid); if(m){ m.papel = papel; grava(); } },
    async mudarPermissao(orgId, uid, pode){ const m = ((db.membros||{})[orgId]||[]).find(x=>x.user_id===uid); if(m){ m.pode_editar_demandas = pode; grava(); } },
    async removerMembro(orgId, uid){ if(db.membros && db.membros[orgId]){ db.membros[orgId] = db.membros[orgId].filter(x=>x.user_id!==uid); grava(); } },
    async gerarNumeros(orgId, qtd, prefixo){ const out = []; const usados = new Set(listaD(orgId).map(d=>d.numero)); while(out.length<qtd){ const n = (prefixo||"") + String(++db.seq[orgId]).padStart(4,"0"); if(!usados.has(n)) out.push(n); } grava(); return out; },
    async convites(orgId){ return db.convites[orgId]||[]; },
    async criarConvite(orgId, papel){ const c = {codigo: uuid().slice(0,8).toUpperCase(), papel, expira_em: new Date(Date.now()+7*864e5).toISOString()}; (db.convites[orgId] ||= []).unshift(c); grava(); return c; },
    async apagarConvite(orgId, codigo){ db.convites[orgId] = (db.convites[orgId]||[]).filter(c=>c.codigo!==codigo); grava(); },
    async souAdminPlataforma(){ return true; },
    async resumoPlataforma(){ return db.orgs.map(o=>({id:o.id, nome:o.nome, cnpj:o.cnpj, plano:o.plano, teste_ate:o.testeAte, criado_em:new Date().toISOString(), membros:1, demandas:listaD(o.id).length, demandas_30d:listaD(o.id).length, admin_email:db.user.email})); },
    async definirPlano(orgId, plano, testeAte){ const o = db.orgs.find(x=>x.id===orgId); o.plano = plano; if(testeAte) o.testeAte = testeAte; grava(); },
    ouvir(orgId, cb){ ouvinte = cb; },
    zerar(){ try{ localStorage.removeItem(KEY); }catch(e){} location.reload(); }
  };
}

const API = (() => {
  const cfg = window.ONDEMAND_CONFIG || {};
  if(cfg.supabaseUrl && cfg.supabaseAnonKey){
    if(!window.supabase){ document.addEventListener("DOMContentLoaded", ()=>{ document.body.innerHTML = '<p style="padding:24px;font:16px system-ui">Não foi possível carregar a biblioteca do Supabase. Verifique a conexão e recarregue a página.</p>'; }); return DemoAPI(); }
    return SupabaseAPI(cfg);
  }
  return DemoAPI();
})();
