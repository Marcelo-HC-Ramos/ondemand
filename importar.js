/* ======================= importação em lote ======================= */
const CAMPOS_IMP = [
  {k:"numero", t:"Nº da OS", syn:["os","n os","nº os","no os","numero da os","numero os","ordem de servico","os interna","n da os"]},
  {k:"cliente.nome", t:"Nome do cliente", req:1, syn:["nome","cliente","nome do cliente","consumidor","nome cliente"]},
  {k:"cliente.telefone", t:"Telefone / WhatsApp", req:1, syn:["telefone","fone","celular","whatsapp","tel","contato","telefone 1","telefone1"]},
  {k:"cliente.telefone2", t:"Outro telefone", syn:["telefone 2","telefone2","outro telefone","fone 2","tel 2","celular 2"]},
  {k:"cliente.cep", t:"CEP", syn:["cep"]},
  {k:"cliente.endereco", t:"Endereço", syn:["endereco","rua","logradouro","endereco completo","end"]},
  {k:"_numero", t:"Número (coluna separada)", syn:["numero","n","nº","n°","num","no"]},
  {k:"_complemento", t:"Complemento", syn:["complemento","compl","apto","apartamento"]},
  {k:"cliente.bairro", t:"Bairro", syn:["bairro"]},
  {k:"cliente.cidade", t:"Cidade", req:1, syn:["cidade","municipio","localidade"]},
  {k:"cliente.referencia", t:"Ponto de referência", syn:["referencia","ponto de referencia","ref"]},
  {k:"regiao", t:"Região", syn:["regiao","zona","area","rota"]},
  {k:"equipamento.tipo", t:"Equipamento", syn:["equipamento","produto","aparelho","tipo de equipamento","eletrodomestico"]},
  {k:"equipamento.marca", t:"Marca", syn:["marca","fabricante"]},
  {k:"equipamento.modelo", t:"Modelo", syn:["modelo"]},
  {k:"equipamento.serie", t:"Nº de série", syn:["serie","numero de serie","n de serie","nº serie"]},
  {k:"problema", t:"Problema / defeito", syn:["problema","defeito","reclamacao","descricao","defeito relatado","problema relatado"]},
  {k:"tipo", t:"Garantia ou fora de garantia", syn:["tipo","garantia","tipo de atendimento","atendimento","modalidade"]},
  {k:"empresa", t:"Empresa parceira", syn:["empresa","empresa parceira","parceiro","contratante"]},
  {k:"osEmpresa", t:"Nº da OS na empresa", syn:["os empresa","os da empresa","os fabricante","os parceiro","os parceira","protocolo","chamado","n chamado"]},
  {k:"dataAgendada", t:"Data da visita", syn:["data","data agendada","data da visita","agendamento","dia","data visita"]},
  {k:"visita.janela", t:"Horário do cliente", syn:["horario","periodo","janela","disponibilidade","hora","turno"]},
  {k:"visita.tecnico", t:"Técnico", syn:["tecnico","responsavel tecnico"]},
  {k:"visita.quemRecebe", t:"Quem recebe o técnico", syn:["quem recebe","recebe","responsavel","acompanhante"]},
  {k:"visita.aviso", t:"Aviso antes (ligar/mensagem)", syn:["aviso","avisar","ligar antes","aviso antes"]},
  {k:"visita.enviarLocalizacao", t:"Enviar localização (sim/não)", syn:["localizacao","enviar localizacao","mandar localizacao"]},
  {k:"visita.observacoes", t:"Observações", syn:["observacoes","observacao","obs","anotacoes"]},
  {k:"_pecas", t:"Peças necessárias", syn:["pecas","peca","pecas necessarias"]},
  {k:"_valorPecas", t:"Valor das peças", syn:["valor pecas","valor das pecas","valor peca"]},
  {k:"fin.maoDeObra", t:"Mão de obra", syn:["mao de obra","mao obra","valor mao de obra"]},
  {k:"fin.deslocamento", t:"Deslocamento", syn:["deslocamento","taxa de visita","visita tecnica","taxa deslocamento"]},
  {k:"fin.formaPagamento", t:"Forma de pagamento", syn:["forma de pagamento","pagamento","forma pagamento"]},
];
const MODELO_CAB = ["Nº da OS","Nome do cliente","Telefone","Outro telefone","CEP","Endereço","Número","Complemento","Bairro","Cidade","Ponto de referência","Equipamento","Marca","Modelo","Problema","Tipo","Empresa parceira","OS empresa","Data da visita","Horário","Técnico","Quem recebe","Aviso","Enviar localização","Observações","Peças","Valor das peças","Mão de obra","Deslocamento","Forma de pagamento"];
const MODELO_EX = [
  ["0154","Maria Souza","(19) 99811-2040","","13024-000","Rua das Palmeiras","120","","Cambuí","Campinas","Portão verde","Geladeira","Electrolux","DF44","Não gela embaixo","Garantia","Electrolux","778120","05/10/2026","8h às 12h","","Maria","Ligar","Não","","","","","",""],
  ["","Carlos Lima","(19) 98702-3311","","","Av. Brasil","88","Casa 2","Centro","Valinhos","","Máquina de lavar","Brastemp","BWK12","Não centrifuga","Fora de garantia","","","","Após as 14h","","Pedro","Mensagem","Sim","Condomínio, avisar portaria","Atuador de freio","145,00","180,00","60,00","PIX"],
];

let IMP = null;
const impNovo = () => ({etapa:"origem", arquivo:"", cab:[], linhas:[], mapa:{}, cidadeReg:{}, guardarCidades:true, tipoPadrao:"garantia", pularDup:true, gerarOS:true, datasAjuste:{}, res:null, prog:null, lotes:null, erro:""});

/* ---------- leitura ---------- */
function detectarSeparador(txt){
  const l = txt.split(/\r?\n/).find(x=>x.trim()) || "";
  const cont = {";":0, ",":0, "\t":0}; let q=false;
  for(const ch of l){ if(ch==='"') q=!q; else if(!q && ch in cont) cont[ch]++; }
  return Object.entries(cont).sort((a,b)=>b[1]-a[1])[0][1] ? Object.entries(cont).sort((a,b)=>b[1]-a[1])[0][0] : ";";
}
function parseCSV(txt, sep){
  const rows = []; let row = [], cur = "", q = false;
  for(let i=0;i<txt.length;i++){
    const ch = txt[i];
    if(q){ if(ch==='"'){ if(txt[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=ch; }
    else if(ch==='"') q=true;
    else if(ch===sep){ row.push(cur); cur=""; }
    else if(ch==="\n"){ row.push(cur.replace(/\r$/,"")); rows.push(row); row=[]; cur=""; }
    else cur+=ch;
  }
  if(cur!=="" || row.length){ row.push(cur.replace(/\r$/,"")); rows.push(row); }
  return rows;
}
function lerTexto(file, enc){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsText(file, enc); }); }
async function lerArquivo(file){
  const nome = file.name.toLowerCase();
  if(/\.(xlsx|xlsm|xls|ods)$/.test(nome)){
    if(!window.XLSX) throw new Error("O leitor de Excel não carregou. Verifique a internet ou salve a planilha como CSV.");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:"array", cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:""});
  }
  let txt = await lerTexto(file, "utf-8");
  if(txt.includes("�")) txt = await lerTexto(file, "windows-1252");   // CSV salvo pelo Excel em português
  txt = txt.replace(/^﻿/, "");
  return parseCSV(txt, detectarSeparador(txt));
}
function carregarTabela(rows, arquivo){
  rows = rows.map(r=>r.map(c=>c instanceof Date ? c : String(c ?? "").trim())).filter(r=>r.some(c=>c!==""));
  if(rows.length < 2) throw new Error("A planilha precisa de uma linha de cabeçalho e pelo menos uma linha de dados.");
  const cab = rows[0].map((c,i)=>String(c||`Coluna ${i+1}`));
  const n = cab.length;
  IMP.cab = cab; IMP.linhas = rows.slice(1).map(r=>{ const x = r.slice(0,n); while(x.length<n) x.push(""); return x; });
  IMP.arquivo = arquivo; IMP.mapa = autoMapear(cab); IMP.etapa = "mapear"; IMP.erro = ""; IMP.cidadeReg = {}; IMP.datasAjuste = {};
}
function autoMapear(cab){
  const mapa = {}; const usados = new Set(); const nc = cab.map(c=>norm(c).replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim());
  for(const passo of ["exato","contem"]){
    for(const c of CAMPOS_IMP){
      if(mapa[c.k] !== undefined) continue;
      const idx = nc.findIndex((h,i)=>!usados.has(i) && c.syn.some(s=>{ const ns = norm(s).replace(/[^a-z0-9 ]/g," ").trim(); return passo==="exato" ? h===ns : (ns.length>3 && (h.includes(ns)||ns.includes(h)&&h.length>3)); }));
      if(idx>=0){ mapa[c.k]=idx; usados.add(idx); }
    }
  }
  return mapa;
}

/* ---------- conversão ---------- */
function paraData(v){
  if(v instanceof Date && !isNaN(v)) return ymd(new Date(v.getFullYear(), v.getMonth(), v.getDate()));
  const s = String(v||"").trim(); if(!s) return "";
  if(/^\d{5}(\.\d+)?$/.test(s)){ const d = new Date(Date.UTC(1899,11,30) + Math.floor(+s)*864e5); return ymd(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const n = norm(s);
  if(n==="hoje") return TODAY; if(n==="amanha") return addDays(TODAY,1);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return valida(+m[1],+m[2],+m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
  if(m){ let y = m[3] ? +m[3] : parse(TODAY).getFullYear(); if(y<100) y += 2000; return valida(y,+m[2],+m[1]); }
  return null;
  function valida(y,mo,d){ const dt = new Date(y,mo-1,d); return dt.getMonth()===mo-1 && dt.getDate()===d ? ymd(dt) : null; }
}
function paraValor(v){
  if(typeof v === "number") return v;
  let s = String(v||"").replace(/r\$|\s/gi,""); if(!s) return 0;
  if(s.includes(",")) s = s.replace(/\./g,"").replace(",",".");
  const n = parseFloat(s); return isFinite(n) ? n : 0;
}
const simNao = v => /^(s|sim|x|yes|y|true|1|verdadeiro)$/i.test(norm(v));
function paraEquip(v){
  const n = norm(v); if(!n) return "Outro";
  const regras = [["lava e seca","Lava e seca"],["lava-loucas","Lava-louças"],["lava loucas","Lava-louças"],["lavaloucas","Lava-louças"],["secadora","Secadora"],["lavadora","Máquina de lavar"],["maquina de lavar","Máquina de lavar"],["lava roupa","Máquina de lavar"],["tanquinho","Máquina de lavar"],["geladeira","Geladeira"],["refrigerador","Geladeira"],["freezer","Freezer"],["cooktop","Cooktop"],["fogao","Fogão"],["micro","Micro-ondas"],["forno","Forno elétrico"],["ar condicionado","Ar-condicionado"],["ar-condicionado","Ar-condicionado"],["split","Ar-condicionado"],["coifa","Depurador/Coifa"],["depurador","Depurador/Coifa"]];
  const r = regras.find(([k])=>n.includes(k)); return r ? r[1] : String(v).trim();
}
function paraTipo(v){ const n = norm(v); if(!n) return null; return /fora|avulso|particular|orcamento|^nao|sem garantia|cobrar/.test(n) ? "fora_garantia" : "garantia"; }
function paraAviso(v){ const n = norm(v); if(!n) return "ligar"; if(/lig/.test(n)) return "ligar"; if(/mens|whats|zap|sms|msg/.test(n)) return "mensagem"; if(/nao|nenhum|sem/.test(n)) return "nenhum"; return "ligar"; }
function paraPagto(v){ const n = norm(v); if(!n) return "PIX"; const r = PAGTO.find(p=>norm(p)===n) || (n.includes("pix")?"PIX":n.includes("dinheiro")?"Dinheiro":n.includes("debito")?"Cartão de débito":n.includes("credito")||n.includes("cartao")?"Cartão de crédito":n.includes("boleto")?"Boleto":n.includes("transf")||n.includes("ted")?"Transferência":null); return r || "PIX"; }
function regiaoDoTexto(v){ const n = norm(v); if(!n) return ""; const R = CFG_().regioes; const r = R.find(x=>norm(x.nome)===n || norm(x.id)===n) || R.find(x=>norm(x.nome).includes(n) || n.includes(norm(x.nome))); return r ? r.id : ""; }

function converter(){
  const col = k => IMP.mapa[k];
  const val = (r,k) => col(k)===undefined || col(k)==="" ? "" : r[col(k)];
  const txt = (r,k) => { const v = val(r,k); return v instanceof Date ? fmtD(ymd(v)) : String(v ?? "").trim(); };
  const telefonesAbertos = new Map();
  S.demandas.filter(d=>ABERTAS.includes(d.status)).forEach(d=>telefonesAbertos.set(digits(d.cliente.telefone).slice(-8)+"|"+norm(d.equipamento.tipo), d));
  const vistos = new Map();
  const osExistentes = new Set(S.demandas.map(d=>String(d.numero||"")).filter(Boolean)); const osVistas = new Map();
  return IMP.linhas.map((r, i) => {
    const d = novaDemanda(); const erros = []; const avisos = [];
    d.numero = txt(r,"numero");
    d.cliente.nome = txt(r,"cliente.nome"); d.cliente.telefone = txt(r,"cliente.telefone"); d.cliente.telefone2 = txt(r,"cliente.telefone2");
    d.cliente.cep = txt(r,"cliente.cep"); d.cliente.bairro = txt(r,"cliente.bairro"); d.cliente.cidade = txt(r,"cliente.cidade"); d.cliente.referencia = txt(r,"cliente.referencia");
    d.cliente.endereco = [txt(r,"cliente.endereco"), txt(r,"_numero"), txt(r,"_complemento")].filter(Boolean).join(", ");
    d.equipamento.tipo = paraEquip(txt(r,"equipamento.tipo")); d.equipamento.marca = txt(r,"equipamento.marca"); d.equipamento.modelo = txt(r,"equipamento.modelo"); d.equipamento.serie = txt(r,"equipamento.serie");
    d.problema = txt(r,"problema"); d.empresa = txt(r,"empresa"); d.osEmpresa = txt(r,"osEmpresa");
    d.visita.janela = txt(r,"visita.janela"); d.visita.tecnico = txt(r,"visita.tecnico") || (CFG_().tecnicos[0]?.nome||""); d.visita.quemRecebe = txt(r,"visita.quemRecebe");
    d.visita.aviso = paraAviso(txt(r,"visita.aviso")); d.visita.enviarLocalizacao = simNao(txt(r,"visita.enviarLocalizacao")); d.visita.observacoes = txt(r,"visita.observacoes");
    const pecas = txt(r,"_pecas"), vp = paraValor(val(r,"_valorPecas"));
    if(pecas || vp) d.fin.pecas = [{descricao: pecas || "Peças", qtd:1, valor: vp, comprada:false}];
    d.fin.maoDeObra = paraValor(val(r,"fin.maoDeObra")); d.fin.deslocamento = paraValor(val(r,"fin.deslocamento")); d.fin.formaPagamento = paraPagto(txt(r,"fin.formaPagamento"));
    const tp = paraTipo(txt(r,"tipo"));
    d.tipo = tp || ((d.fin.maoDeObra || d.fin.deslocamento || vp) ? "fora_garantia" : IMP.tipoPadrao);
    // região
    d.regiao = regiaoDoTexto(txt(r,"regiao")) || regiaoPorCidade(d.cliente.cidade) || IMP.cidadeReg[norm(d.cliente.cidade)] || "";
    // data
    const dv = val(r,"dataAgendada");
    if(dv !== "" && dv !== undefined){ const dt = paraData(dv); if(dt===null) avisos.push(`data “${txt(r,"dataAgendada")}” não reconhecida, entra sem data`); else if(dt){ d.dataAgendada = IMP.datasAjuste[d.regiao+"|"+dt] || dt; } }
    if(d.dataAgendada && d.dataAgendada < TODAY) avisos.push("data já passou");
    d.status = d.dataAgendada ? "agendada" : "pendente";
    // validação
    if(!d.cliente.nome) erros.push("sem nome"); if(!digits(d.cliente.telefone)) erros.push("sem telefone"); if(!d.cliente.cidade) erros.push("sem cidade");
    if(d.cliente.cidade && !d.regiao) erros.push("cidade sem região");
    if(d.numero){
      const k = d.numero;
      if(osExistentes.has(k)) erros.push(`OS ${k} já existe no sistema`);
      else if(osVistas.has(k)) erros.push(`OS ${k} repetida na planilha (linha ${osVistas.get(k)+2})`);
      else osVistas.set(k, i);
    }
    let dup = "";
    const chave = digits(d.cliente.telefone).slice(-8)+"|"+norm(d.equipamento.tipo);
    if(digits(d.cliente.telefone).length>=8){
      if(telefonesAbertos.has(chave)) dup = `já existe em aberto (${osCode(telefonesAbertos.get(chave))})`;
      else if(vistos.has(chave)) dup = `repetida na planilha (linha ${vistos.get(chave)+2})`;
      else vistos.set(chave, i);
    }
    return {i, d, erros, avisos, dup};
  });
}
function cidadesSemRegiao(){
  const m = new Map();
  if(IMP.mapa["cliente.cidade"]===undefined) return [];
  IMP.linhas.forEach(r=>{
    const c = String(r[IMP.mapa["cliente.cidade"]]||"").trim(); if(!c) return;
    const rt = IMP.mapa.regiao!==undefined ? regiaoDoTexto(r[IMP.mapa.regiao]) : "";
    if(rt || regiaoPorCidade(c)) return;
    const k = norm(c); m.set(k, {nome:c, n:(m.get(k)?.n||0)+1});
  });
  return [...m.entries()].map(([k,v])=>({k, ...v})).sort((a,b)=>b.n-a.n);
}
function divisoesRegiao(itens){
  const out = [];
  const porReg = {};
  itens.forEach(({d})=>{ if(d.dataAgendada && d.regiao) (porReg[d.regiao] ||= new Set()).add(d.dataAgendada); });
  Object.entries(porReg).forEach(([r,set])=>{
    // junta com o que já está agendado na mesma semana
    const semanas = {};
    [...set].forEach(dt=>{ const w = startOfWeek(dt); (semanas[w] ||= new Set()).add(dt); });
    S.demandas.forEach(d=>{ if(d.regiao===r && d.dataAgendada && d.status!=="cancelada" && semanas[startOfWeek(d.dataAgendada)]) semanas[startOfWeek(d.dataAgendada)].add(d.dataAgendada); });
    Object.values(semanas).forEach(s=>{ if(s.size>1) out.push({r, dias:[...s].sort()}); });
  });
  return out;
}

/* ---------- tela ---------- */
function vImportar(){
  if(!IMP) IMP = impNovo();
  if(!podeEditar()) return `<div class="head"><div><h1>Importar em lote</h1></div></div><div class="empty">${orgAtiva()?"Seu papel não permite cadastrar demandas.":"O plano da empresa não permite novos cadastros no momento."}</div>`;
  const etapas = [["origem","1. Planilha"],["mapear","2. Colunas"],["revisar","3. Revisão"],["fim","4. Pronto"]];
  const ix = etapas.findIndex(e=>e[0]===IMP.etapa);
  const steps = `<div class="steps">${etapas.map(([k,t],i)=>`<span class="${i===ix?"on":i<ix?"done":""}">${t}</span>`).join("")}</div>`;
  const head = `<div class="head"><div><h1>Importar em lote</h1><p>Cadastre muitas demandas de uma vez a partir de uma planilha Excel, CSV ou do Google Planilhas.</p></div>${IMP.etapa!=="origem"?`<button class="btn" data-act="impReiniciar">Começar de novo</button>`:""}</div>`;
  let corpo = "";
  if(IMP.etapa === "origem") corpo = etapaOrigem();
  else if(IMP.etapa === "mapear") corpo = etapaMapear();
  else if(IMP.etapa === "revisar") corpo = etapaRevisar();
  else corpo = etapaFim();
  return head + steps + (IMP.erro?`<div class="msg err" style="margin-bottom:12px">${esc(IMP.erro)}</div>`:"") + corpo;
}
function etapaOrigem(){
  const L = IMP.lotes;
  return `<div class="grid g3">
    <div class="panel stack">
      <label class="dropzone" id="impDrop" for="impFile">
        <b>Arraste a planilha aqui</b><span style="color:var(--muted);font-size:14px">ou clique para escolher · Excel (.xlsx, .xls), .csv ou .ods</span>
        <input type="file" id="impFile" accept=".csv,.txt,.xlsx,.xlsm,.xls,.ods" hidden>
        <span class="btn pri">Escolher arquivo</span>
      </label>
      <details><summary style="cursor:pointer;font-weight:500">Ou cole as linhas copiadas do Excel / Google Planilhas</summary>
        <div class="stack" style="margin-top:8px"><textarea class="paste" id="impPaste" placeholder="Copie as células com o cabeçalho e cole aqui (Ctrl+V)"></textarea>
        <div><button class="btn" data-act="impColar">Usar texto colado</button></div></div></details>
    </div>
    <div class="stack">
      <div class="panel stack"><h2>Modelo de planilha</h2>
        <p style="margin:0;font-size:14px;color:var(--muted)">Os nomes das colunas não precisam ser iguais: na próxima etapa você confirma qual coluna é qual. Só nome, telefone e cidade são obrigatórios.</p>
        <div><button class="btn" data-act="impModelo">Baixar modelo (.csv)</button></div></div>
      <div class="panel"><h2>Importações recentes</h2>
        ${L===null?`<div class="empty">Carregando…</div>`: L.length ? L.map(l=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line-2);padding:7px 0;flex-wrap:nowrap"><span style="min-width:0"><b style="font-weight:600">${esc(l.arquivo||"Planilha")}</b><span class="sub" style="display:block;font-size:12.5px;color:var(--muted)">${l.total} demandas · ${new Date(l.criado_em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</span></span><button class="btn sm danger" data-act="impDesfazer" data-id="${l.id}" data-n="${l.total}">Desfazer</button></div>`).join("") : `<div class="empty">Nenhuma importação ainda.</div>`}
      </div>
    </div></div>`;
}
function etapaMapear(){
  const amostra = IMP.linhas.slice(0,3);
  const opts = (k) => `<option value="">— não importar —</option>` + IMP.cab.map((c,i)=>`<option value="${i}" ${IMP.mapa[k]===i?"selected":""}>${esc(c)}${amostra[0]&&amostra[0][i]!==""?` (ex.: ${esc(String(amostra[0][i] instanceof Date?fmtD(ymd(amostra[0][i])):amostra[0][i]).slice(0,24))})`:""}</option>`).join("");
  const faltam = CAMPOS_IMP.filter(c=>c.req && IMP.mapa[c.k]===undefined);
  const naoUsadas = IMP.cab.filter((c,i)=>!Object.values(IMP.mapa).includes(i));
  return `<div class="panel stack">
    <div class="row" style="justify-content:space-between"><span><b>${esc(IMP.arquivo)}</b> · ${IMP.linhas.length} linhas · ${IMP.cab.length} colunas</span>
      <label style="font-size:14px;display:flex;gap:8px;align-items:center">Quando a planilha não disser o tipo:
        <select id="impTipo" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface)"><option value="garantia" ${IMP.tipoPadrao==="garantia"?"selected":""}>Garantia</option><option value="fora_garantia" ${IMP.tipoPadrao==="fora_garantia"?"selected":""}>Fora de garantia</option></select></label></div>
    <div class="mapgrid">${CAMPOS_IMP.map(c=>`<div class="f ${IMP.mapa[c.k]!==undefined?"ok":""}"><label for="map-${c.k.replace(/\./g,"-")}">${esc(c.t)}${c.req?" <em>*</em>":""}</label><select id="map-${c.k.replace(/\./g,"-")}" data-map="${c.k}">${opts(c.k)}</select></div>`).join("")}</div>
    ${naoUsadas.length?`<p style="margin:0;font-size:13px;color:var(--muted)">Colunas que não serão importadas: ${naoUsadas.map(esc).join(", ")}</p>`:""}
    <div class="row" style="justify-content:flex-end">${faltam.length?`<span style="color:var(--bad);font-size:14px">Escolha a coluna de: ${faltam.map(c=>c.t).join(", ")}</span>`:""}<button class="btn pri" data-act="impRevisar" ${faltam.length?"disabled":""}>Revisar demandas</button></div>
  </div>`;
}
function etapaRevisar(){
  const itens = converter();
  const cidades = cidadesSemRegiao().filter(c=>!IMP.cidadeReg[c.k]);
  const cidadesResolvidas = Object.entries(IMP.cidadeReg);
  const comErro = itens.filter(x=>x.erros.length), dups = itens.filter(x=>!x.erros.length && x.dup), ok = itens.filter(x=>!x.erros.length && !(x.dup && IMP.pularDup));
  const div = divisoesRegiao(ok);
  const lotacao = {}; ok.forEach(({d})=>{ if(d.dataAgendada) lotacao[d.dataAgendada]=(lotacao[d.dataAgendada]||0)+1; });
  const cap = CFG_().capacidadeDia||9;
  const lotados = Object.entries(lotacao).map(([dia,n])=>[dia, n + S.demandas.filter(d=>d.dataAgendada===dia && d.status!=="cancelada").length]).filter(([,n])=>n>cap);
  const regOpts = `<option value="">Escolha a região…</option>` + CFG_().regioes.map(r=>`<option value="${r.id}">${esc(r.nome)}</option>`).join("");
  const mostrar = itens.slice(0, 300);
  return `<div class="stack">
    <div class="panel"><div class="statrow">
      <span><b class="num">${itens.length}</b>linhas</span>
      <span style="color:var(--ok)"><b class="num">${ok.length}</b>serão importadas</span>
      <span style="color:var(--bad)"><b class="num">${comErro.length}</b>com problema</span>
      <span style="color:var(--warn)"><b class="num">${dups.length}</b>possíveis duplicadas</span>
      <span><b class="num">${ok.filter(x=>x.d.dataAgendada).length}</b>já com data</span>
      <span><b class="num">${ok.filter(x=>!x.d.numero).length}</b>sem Nº de OS</span>
    </div></div>
    ${cidades.length?`<div class="panel"><h2>Cidades sem região <small>defina uma vez e todas as linhas dessas cidades se ajustam</small></h2>
      ${cidades.map(c=>`<div class="citymap"><span><b style="font-weight:600">${esc(c.nome)}</b> <span class="mono" style="color:var(--muted)">${c.n} linha${c.n>1?"s":""}</span></span><select id="cr-${esc(c.k).replace(/[^a-z0-9]/g,"_")}" data-cidreg="${esc(c.k)}" data-nome="${esc(c.nome)}">${regOpts}</select></div>`).join("")}
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-top:10px"><input type="checkbox" id="impGuardar" ${IMP.guardarCidades?"checked":""}> Guardar essas cidades nas regiões para os próximos cadastros</label></div>`:""}
    ${cidadesResolvidas.length?`<div class="panel" style="padding:12px 18px"><span style="font-size:14px">Cidades definidas nesta importação: ${cidadesResolvidas.map(([k,r])=>`${esc((IMP.cidadeNome||{})[k]||k)} → ${chip(r)}`).join(" · ")}</span> <button class="linkbtn" data-act="impLimparCidades">refazer</button></div>`:""}
    ${div.length||lotados.length?`<div class="panel"><h2>Atenção ao roteiro</h2><div class="alerts">
      ${div.map(x=>`<div class="alert bad" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center"><span><b>Região dividida</b> ${esc(regiao(x.r)?.nome||"")} ficaria em ${x.dias.length} dias na mesma semana: ${x.dias.map(fmtDia).join(", ")}.</span><span class="row" style="gap:4px">${x.dias.map(dia=>`<button class="btn sm" data-act="impUnificar" data-r="${x.r}" data-dia="${dia}" data-dias="${x.dias.join(",")}">Tudo em ${fmtDia(dia)}</button>`).join("")}</span></div>`).join("")}
      ${lotados.map(([dia,n])=>`<div class="alert"><b>Dia lotado</b> ${fmtDia(dia)} ficaria com ${n} atendimentos (limite ${cap}).</div>`).join("")}
    </div></div>`:""}
    <div class="panel"><h2>Prévia <small>${itens.length>300?"mostrando as 300 primeiras linhas":""}</small></h2>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:6px"><input type="checkbox" id="impGerarOS" ${IMP.gerarOS?"checked":""}> Gerar o Nº da OS automaticamente para as linhas que vierem sem número${CFG_().prefixoOS?` (prefixo ${esc(CFG_().prefixoOS)})`:""}</label>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:10px"><input type="checkbox" id="impDup" ${IMP.pularDup?"checked":""}> Pular possíveis duplicadas (mesmo telefone e equipamento já em aberto ou repetidos na planilha)</label>
      <div class="tablewrap"><table class="prev"><thead><tr><th>Linha</th><th>Situação</th><th>OS</th><th>Cliente</th><th>Telefone</th><th>Cidade</th><th>Região</th><th>Equipamento</th><th>Tipo</th><th>Data</th></tr></thead><tbody>
      ${mostrar.map(x=>{ const cls = x.erros.length?"err":x.dup?"dup":""; const why = x.erros.length? x.erros.join(", ") : x.dup ? (IMP.pularDup?"será pulada: ":"")+x.dup : x.avisos.join("; ") || "✓";
        return `<tr class="${cls}"><td class="mono">${x.i+2}</td><td class="why" style="${!x.erros.length&&!x.dup?"color:var(--ok)":""}">${esc(why)}</td><td class="mono">${x.d.numero?esc(x.d.numero):`<span style="color:var(--faint)">${IMP.gerarOS?"gerar":"—"}</span>`}</td><td>${esc(x.d.cliente.nome)}</td><td class="mono">${esc(x.d.cliente.telefone)}</td><td>${esc(x.d.cliente.cidade)}</td><td>${x.d.regiao?chip(x.d.regiao):"—"}</td><td>${esc(x.d.equipamento.tipo)}</td><td>${cobra(x.d)?"Fora":"Garantia"}</td><td class="mono">${x.d.dataAgendada?fmtDia(x.d.dataAgendada):"—"}</td></tr>`; }).join("")}
      </tbody></table></div></div>
    <div class="row" style="justify-content:space-between"><button class="btn" data-act="impVoltarMapa">Voltar às colunas</button>
      <span class="row">${comErro.length?`<span style="font-size:14px;color:var(--muted)">Linhas com problema ficam de fora. Corrija na planilha e importe de novo, se quiser.</span>`:""}<button class="btn pri" data-act="impConfirmar" ${ok.length?"":"disabled"}>${IMP.prog?`Importando ${IMP.prog[0]} de ${IMP.prog[1]}…`:`Importar ${ok.length} demanda${ok.length!==1?"s":""}`}</button></span></div>
  </div>`;
}
function etapaFim(){
  const r = IMP.res;
  return `<div class="panel stack" style="max-width:640px">
    <h2>Importação concluída</h2>
    <div class="statrow"><span style="color:var(--ok)"><b class="num">${r.criadas}</b>demandas criadas</span><span><b class="num">${r.agendadas}</b>já com data</span><span style="color:var(--muted)"><b class="num">${r.ignoradas}</b>linhas deixadas de fora</span></div>
    <p style="margin:0;color:var(--muted);font-size:14px">As demandas sem data estão em “A agendar” no roteiro, agrupadas por região. Se algo saiu errado, dá para desfazer esta importação inteira.</p>
    <div class="row"><button class="btn pri" data-act="nav" data-v="roteiro">Abrir roteiro</button><button class="btn" data-act="nav" data-v="demandas">Ver demandas</button><button class="btn danger" data-act="impDesfazer" data-id="${r.loteId}" data-n="${r.criadas}">Desfazer esta importação</button><button class="btn" data-act="impReiniciar">Importar outra planilha</button></div>
  </div>`;
}

/* ---------- ações ---------- */
async function processarArquivo(file){
  try{ IMP.erro=""; const rows = await lerArquivo(file); carregarTabela(rows, file.name); }
  catch(e){ IMP.erro = e.message || "Não foi possível ler o arquivo."; }
  render();
}
let lotesCarregando = false;
async function aposRenderImportar(){
  const dz = $("#impDrop");
  if(dz && !dz._ok){
    dz._ok = true;
    dz.addEventListener("dragover", e=>{ e.preventDefault(); dz.classList.add("drop"); });
    dz.addEventListener("dragleave", ()=>dz.classList.remove("drop"));
    dz.addEventListener("drop", e=>{ e.preventDefault(); dz.classList.remove("drop"); const f = e.dataTransfer.files?.[0]; if(f) processarArquivo(f); });
  }
  if(IMP && IMP.etapa==="origem" && IMP.lotes===null && !lotesCarregando){
    lotesCarregando = true;
    try{ IMP.lotes = await API.lotes(S.org.id); }catch(e){ IMP.lotes = []; }
    lotesCarregando = false; if(S.view==="importar") render();
  }
}
async function acaoImportar(a, b){
  if(!a.startsWith("imp")) return false;
  switch(a){
    case "impReiniciar": IMP = impNovo(); render(); break;
    case "impModelo": baixarArquivo("modelo-importacao-demandas.csv", toCSV([MODELO_CAB, ...MODELO_EX]), "text/csv;charset=utf-8"); break;
    case "impColar": { const t = $("#impPaste").value; if(!t.trim()){ toast("Cole as linhas da planilha primeiro"); break; }
      try{ carregarTabela(parseCSV(t.replace(/^﻿/,""), t.includes("\t")?"\t":detectarSeparador(t)), "Texto colado"); }catch(e){ IMP.erro = e.message; } render(); break; }
    case "impRevisar": IMP.etapa="revisar"; IMP.erro=""; render(); window.scrollTo(0,0); break;
    case "impVoltarMapa": IMP.etapa="mapear"; render(); break;
    case "impLimparCidades": IMP.cidadeReg = {}; render(); break;
    case "impUnificar": { const alvo = b.dataset.dia; b.dataset.dias.split(",").forEach(dt=>{ if(dt!==alvo) IMP.datasAjuste[b.dataset.r+"|"+dt] = alvo; }); render(); toast(`Linhas da região movidas para ${fmtDia(alvo)}`); break; }
    case "impConfirmar": await confirmarImportacao(); break;
    case "impDesfazer": {
      if(!(await perguntar("Desfazer importação?", `As ${b.dataset.n} demandas criadas por esta importação serão apagadas, inclusive as que já foram editadas ou agendadas.`, "Desfazer"))) break;
      try{ await API.desfazerLote(S.org.id, b.dataset.id); S.demandas = S.demandas.filter(d=>d.loteId!==b.dataset.id); IMP = impNovo(); toast("Importação desfeita"); render(); }
      catch(e){ toast(traduzErro(e)); } break; }
  }
  return true;
}
async function confirmarImportacao(){
  if(IMP.prog) return;
  const itens = converter().filter(x=>!x.erros.length && !(x.dup && IMP.pularDup));
  if(!itens.length) return;
  // ordem de rota: depois do que já existe em cada dia
  const prox = {};
  const lista = itens.map(({d})=>{ if(d.dataAgendada){ prox[d.dataAgendada] = prox[d.dataAgendada] || proximaOrdem(d.dataAgendada); d.ordemRota = prox[d.dataAgendada]++; } return d; });
  // guarda cidades novas nas regiões
  if(IMP.guardarCidades && Object.keys(IMP.cidadeReg).length && ehAdmin()){
    const cfg = clone(S.org.config);
    const nomes = {}; IMP.linhas.forEach(r=>{ const c = String(r[IMP.mapa["cliente.cidade"]]||"").trim(); if(c) nomes[norm(c)] = nomes[norm(c)] || c; });
    Object.entries(IMP.cidadeReg).forEach(([k,rid])=>{ const r = cfg.regioes.find(x=>x.id===rid); if(r && !r.cidades.some(c=>norm(c)===k)) r.cidades.push(nomes[k]||k); });
    try{ await API.salvarEmpresa(S.org.id, {config:cfg}); S.org.config = normConfig(cfg); }catch(e){ toast("As demandas serão importadas, mas não deu para guardar as cidades nas regiões."); }
  }
  IMP.prog = [0, lista.length]; render();
  try{
    const semOS = lista.filter(d=>!d.numero);
    if(IMP.gerarOS && semOS.length){ const nums = await API.gerarNumeros(S.org.id, semOS.length, CFG_().prefixoOS||""); semOS.forEach((d,k)=>d.numero = nums[k]); }
    const r = await API.importar(S.org.id, lista, IMP.arquivo, (f,t)=>{ IMP.prog=[f,t]; const btn = document.querySelector('[data-act="impConfirmar"]'); if(btn) btn.textContent = `Importando ${f} de ${t}…`; });
    r.criadas.forEach(aplicarLocal);
    IMP.res = {loteId:r.loteId, criadas:r.criadas.length, agendadas:r.criadas.filter(d=>d.dataAgendada).length, ignoradas: IMP.linhas.length - r.criadas.length};
    IMP.etapa = "fim"; IMP.prog = null; IMP.lotes = null;
    toast(`${r.criadas.length} demandas importadas`);
  }catch(e){ IMP.prog = null; IMP.erro = traduzErro(e); }
  render(); window.scrollTo(0,0);
}
function mudancaImportar(ev){
  const t = ev.target; if(!IMP) return;
  if(t.id==="impFile" && t.files?.[0]){ processarArquivo(t.files[0]); t.value=""; return; }
  if(t.dataset.map){ const k=t.dataset.map; if(t.value==="") delete IMP.mapa[k]; else { const v=+t.value; Object.keys(IMP.mapa).forEach(x=>{ if(IMP.mapa[x]===v && x!==k) delete IMP.mapa[x]; }); IMP.mapa[k]=v; } render(); return; }
  if(t.id==="impTipo"){ IMP.tipoPadrao=t.value; return; }
  if(t.id==="impGerarOS"){ IMP.gerarOS=t.checked; render(); return; }
  if(t.id==="impDup"){ IMP.pularDup=t.checked; render(); return; }
  if(t.id==="impGuardar"){ IMP.guardarCidades=t.checked; return; }
  if(t.dataset.cidreg){ if(t.value){ IMP.cidadeReg[t.dataset.cidreg]=t.value; (IMP.cidadeNome ||= {})[t.dataset.cidreg]=t.dataset.nome; } render(); return; }
}
