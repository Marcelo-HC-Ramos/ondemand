/* ======================= utilidades gerais ======================= */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return ymd(d); };
const startOfWeek = s => { const d = parse(s); const w = (d.getDay()+6)%7; d.setDate(d.getDate()-w); return ymd(d); };
const TODAY = ymd(new Date());
const DOW = ["dom","seg","ter","qua","qui","sex","sáb"];
const DOWL = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const fmtD = s => s ? `${pad(parse(s).getDate())}/${pad(parse(s).getMonth()+1)}` : "—";
const fmtDia = s => s ? `${DOW[parse(s).getDay()]} ${fmtD(s)}` : "sem data";
const brl = n => (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const norm = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16);}));
const clone = o => JSON.parse(JSON.stringify(o));
const digits = s => String(s||"").replace(/\D/g,"");
const osCode = d => d.numero ? "OS " + d.numero : "Sem OS";
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,3200); }
function waLink(phone, text){
  let p = digits(phone);
  if(p && p.length <= 11) p = "55" + p;          // número brasileiro sem DDI
  return `https://wa.me/${p}?text=${encodeURIComponent(text||"")}`;
}
function baixarArquivo(nome, conteudo, tipo){
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], {type: tipo || "text/plain;charset=utf-8"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csvCell = v => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const toCSV = rows => "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\r\n");

const I = {
  painel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  demandas:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5h11M9 12h11M9 19h11"/><circle cx="4.5" cy="5" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="19" r="1.2"/></svg>',
  importar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/></svg>',
  roteiro:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
  financeiro:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v5M18 10v5"/></svg>',
  equipe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.5 14.4c2.3.2 4 1.8 4.5 4.6"/></svg>',
  config:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  plataforma:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  sair:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
};

/* ======================= domínio ======================= */
const STATUS = {
  pendente:{t:"A agendar",c:"warn"}, agendada:{t:"Agendada",c:"accent"}, aguardando_peca:{t:"Aguardando peça",c:"warn"},
  reagendar:{t:"Reagendar",c:"bad"}, concluida:{t:"Concluída",c:"ok"}, cancelada:{t:"Cancelada",c:"muted"}
};
const ABERTAS = ["pendente","agendada","aguardando_peca","reagendar"];
const EQUIP = ["Geladeira","Freezer","Máquina de lavar","Lava e seca","Secadora","Lava-louças","Fogão","Cooktop","Forno elétrico","Micro-ondas","Ar-condicionado","Depurador/Coifa","Outro"];
const PAGTO = ["PIX","Dinheiro","Cartão de débito","Cartão de crédito","Boleto","Transferência"];
const AVISO = {ligar:"Ligar antes", mensagem:"Mandar mensagem antes", nenhum:"Sem aviso"};
const PAPEIS = {admin:"Administrador", operador:"Operador (administrativo)", tecnico:"Técnico"};

const REGIOES_SP = [
  {id:"gsp", nome:"Capital e Grande SP", cor:0, cidades:["São Paulo","Guarulhos","Osasco","Santo André","São Bernardo do Campo","São Caetano do Sul","Diadema","Mauá","Barueri","Carapicuíba","Taboão da Serra","Cotia","Mogi das Cruzes","Suzano","Itaquaquecetuba"]},
  {id:"cps", nome:"Campinas e Jundiaí", cor:1, cidades:["Campinas","Jundiaí","Valinhos","Vinhedo","Hortolândia","Sumaré","Indaiatuba","Paulínia","Atibaia","Bragança Paulista"]},
  {id:"vale", nome:"Vale do Paraíba e Litoral Norte", cor:2, cidades:["São José dos Campos","Taubaté","Jacareí","Pindamonhangaba","Guaratinguetá","Caraguatatuba","Ubatuba","São Sebastião","Ilhabela"]},
  {id:"baix", nome:"Baixada Santista", cor:3, cidades:["Santos","São Vicente","Guarujá","Praia Grande","Cubatão","Bertioga","Mongaguá","Itanhaém","Peruíbe"]},
  {id:"soro", nome:"Sorocaba e Sudoeste", cor:4, cidades:["Sorocaba","Votorantim","Itu","Salto","Itapetininga","Tatuí","Boituva","Itapeva"]},
  {id:"pira", nome:"Piracicaba e Limeira", cor:5, cidades:["Piracicaba","Limeira","Americana","Santa Bárbara d'Oeste","Rio Claro","Araras","Nova Odessa"]},
  {id:"rp", nome:"Ribeirão Preto e Central", cor:6, cidades:["Ribeirão Preto","Franca","Sertãozinho","Araraquara","São Carlos","Jaboticabal"]},
  {id:"bau", nome:"Bauru e Marília", cor:7, cidades:["Bauru","Marília","Jaú","Botucatu","Lins","Ourinhos","Assis"]},
  {id:"oeste", nome:"Oeste Paulista", cor:8, cidades:["São José do Rio Preto","Presidente Prudente","Araçatuba","Catanduva","Barretos","Birigui"]},
];
const configPadrao = (modelo) => ({
  capacidadeDia: 9, diasAtendimento: 6, prefixoOS: "",
  tecnicos: [{nome:"Técnico principal", telefone:""}],
  regioes: modelo === "sp" ? clone(REGIOES_SP) : [{id:"r1",nome:"Região 1",cor:0,cidades:[]},{id:"r2",nome:"Região 2",cor:1,cidades:[]}]
});
function normConfig(c){
  const o = Object.assign(configPadrao("sp"), c && Object.keys(c).length ? clone(c) : {});
  o.tecnicos = (o.tecnicos||[]).map(t => typeof t === "string" ? {nome:t, telefone:""} : {nome:t.nome||"", telefone:t.telefone||""}).filter(t=>t.nome);
  if(!o.tecnicos.length) o.tecnicos = [{nome:"Técnico principal", telefone:""}];
  o.regioes = (o.regioes||[]).map((r,i)=>({id:r.id||("r"+i), nome:r.nome||"Região", cor: Number.isFinite(r.cor)? r.cor : i, cidades: r.cidades||[]}));
  return o;
}

function novaDemanda(){
  return {
    id: uuid(), numero:"", criadaEm: TODAY, status:"pendente",
    cliente:{nome:"",telefone:"",telefone2:"",endereco:"",bairro:"",cidade:"",cep:"",referencia:""},
    regiao:"", tipo:"garantia", empresa:"", osEmpresa:"",
    equipamento:{tipo:"Geladeira",marca:"",modelo:"",serie:""}, problema:"",
    visita:{janela:"",tecnico:"",quemRecebe:"",enviarLocalizacao:false,aviso:"ligar",observacoes:""},
    dataAgendada:"", ordemRota:0, concluidaEm:"", loteId:null,
    fin:{pecas:[],maoDeObra:0,deslocamento:0,formaPagamento:"PIX",sinalRecebido:false,sinalValor:0,pago:false,dataPagamento:"",obs:""}
  };
}
function normDem(d){
  const b = novaDemanda(); const o = Object.assign(b, d);
  o.cliente = Object.assign(novaDemanda().cliente, d.cliente||{});
  o.equipamento = Object.assign(novaDemanda().equipamento, d.equipamento||{});
  o.visita = Object.assign(novaDemanda().visita, d.visita||{});
  o.fin = Object.assign(novaDemanda().fin, d.fin||{}); o.fin.pecas = Array.isArray(o.fin.pecas)?o.fin.pecas:[];
  ["dataAgendada","concluidaEm"].forEach(k=>{ if(!o[k]) o[k]=""; });
  return o;
}
const cobra = d => d.tipo === "fora_garantia";
function totais(d){
  const f = d.fin; const pecas = f.pecas.reduce((s,p)=>s+(Number(p.qtd)||0)*(Number(p.valor)||0),0);
  const total = pecas + (Number(f.maoDeObra)||0) + (Number(f.deslocamento)||0);
  const sinal = f.sinalRecebido ? (Number(f.sinalValor)||0) : 0;
  return {pecas, total, sinal, restante: f.pago ? 0 : Math.max(0,total - sinal)};
}
const dataAtend = d => d.concluidaEm || d.dataAgendada;
