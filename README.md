# OnDemand — guia de instalação (SaaS)

Sistema web para empresas de assistência técnica a domicílio. Cada empresa cria a própria conta, convida sua equipe e vê somente os próprios dados.

## O que vem no pacote

| Arquivo | Para que serve |
|---|---|
| `index.html`, `css/`, `js/` | O sistema (site estático, sem servidor próprio) |
| `js/config.js` | Onde você coloca os dados do seu Supabase |
| `supabase/schema.sql` | Banco de dados multiempresa com as regras de segurança |
| `modelos/modelo-importacao.csv` | Modelo de planilha para importação em lote |

Sem configurar nada, o sistema abre em **modo demonstração** (dados salvos só no navegador). Basta abrir o `index.html` para experimentar.

## Serviços gratuitos usados

- **Supabase (plano Free):** banco PostgreSQL, login por e-mail e atualização em tempo real. Limites principais:
  - 500 MB de banco;
  - 50.000 usuários ativos por mês;
  - 2 projetos ativos;
  - o projeto **pausa depois de 1 semana sem uso**, e basta reativar no painel.

  Confira em https://supabase.com/pricing.
- **Hospedagem estática gratuita:** Netlify, Vercel, Cloudflare Pages ou GitHub Pages.
- **ViaCEP:** preenche o endereço a partir do CEP, sem cadastro.
- **WhatsApp (links wa.me):** aviso ao cliente e envio do roteiro ao técnico, sem API paga.
- **Google Maps (links de rota):** rota do dia com todos os endereços, sem chave de API.

## Passo 1 — Criar o banco no Supabase

1. Crie uma conta em https://supabase.com e um novo projeto. Escolha a região **South America (São Paulo)**.
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
   - O arquivo pode ser rodado de novo em atualizações futuras sem apagar dados.
   - **Se você já rodou a versão anterior**, rode o arquivo novo do mesmo jeito. Ele converte o Nº da OS para texto e cria a permissão dos técnicos, mantendo os dados existentes.

## Passo 2 — Configurar o login

Em **Authentication → URL Configuration**:

- **Site URL:** o endereço onde o sistema ficará publicado (ex.: `https://app.seudominio.com.br`).
- **Redirect URLs:** adicione o mesmo endereço. Ele é usado nos links de confirmação de e-mail, recuperação de senha e convite.

O envio de e-mails embutido no Supabase tem limite baixo por hora e serve para testes. Para produção, configure em **Authentication → Emails → SMTP Settings** um provedor com plano gratuito, como Brevo ou Resend.

## Passo 3 — Ligar o sistema ao banco

Em **Project Settings → API** copie:

- a **Project URL**;
- a chave **anon public**.

Cole as duas em `js/config.js`:

```js
supabaseUrl: "https://SEU-PROJETO.supabase.co",
supabaseAnonKey: "eyJ...",
contatoSuporte: "(11) 99999-0000",   // aparece quando o teste de uma empresa vence
```

A chave *anon* pode ficar no site: quem protege os dados são as regras do banco. **Nunca** coloque a chave `service_role` no site.

## Passo 4 — Publicar de graça

**Cloudflare Pages (recomendado):**
1. No painel do Cloudflare, abra **Workers & Pages → Create application → Pages → Drag and drop your files**.
2. Dê o nome `ondemand` ao projeto, arraste a pasta inteira e clique em **Deploy site**. O sistema fica em `ondemand.pages.dev`.
3. Para usar um subdomínio, abra **Custom domains → Set up a domain** dentro do projeto e digite, por exemplo, `app.seudominio.com.br`.
   - Se o domínio já está no Cloudflare, o registro de DNS é criado sozinho.
   - Se o domínio está em outro provedor, crie lá um **CNAME** `app` apontando para `ondemand.pages.dev`.
   - Faça sempre por essa tela: um CNAME criado antes de adicionar o domínio no projeto causa erro 522.
4. Para atualizar o sistema, use **Create a new deployment** e arraste a pasta nova.

**Outras opções:** Netlify (https://app.netlify.com/drop, basta arrastar a pasta) ou Vercel (importando um repositório do GitHub). Não há comando de build, pois é um site estático.

Depois de publicar, volte ao Passo 2 e confirme que o endereço final está em *Site URL* e *Redirect URLs*.

## Passo 5 — Tornar-se o dono da plataforma

1. Crie sua conta pelo próprio sistema.
2. No **SQL Editor** do Supabase, rode:

```sql
insert into public.plataforma_admins(user_id)
select id from auth.users where email = 'SEU-EMAIL@exemplo.com';
```

Ao entrar de novo, aparece o menu **Plataforma**. Nele você vê todas as empresas, quantos usuários e demandas cada uma tem, e muda o plano (Teste, Ativo ou Suspenso) ou o prazo de teste.

## Como as empresas usam

1. A empresa cria a conta e cadastra a empresa. Começa um teste de 14 dias, e quem cria vira **Administrador**.
2. O administrador define as regiões e cidades, os técnicos com WhatsApp e o limite de atendimentos por dia.
3. Em **Equipe**, gera convites por link (válidos por 7 dias, uso único) com o papel de cada pessoa:
   - **Administrador:** tudo, inclusive equipe e configurações.
   - **Operador:** cadastra, importa, agenda e cobra.
   - **Técnico:** vê o roteiro e muda o andamento do atendimento. Se o administrador marcar **“Pode alterar demandas”** na tela Equipe, o técnico também edita os dados das demandas (cliente, equipamento, visita e orçamento). Mesmo com essa permissão, ele não cria, não exclui e não muda o Nº da OS. Essas regras também são garantidas pelo banco.
4. O **Nº da OS** é preenchido pelo administrativo (administrador ou operador) e aceita letras e números, como `0154` ou `RT-0154`:
   - se não houver um número, o botão **Gerar número** usa o próximo número livre da sequência da empresa;
   - o prefixo opcional fica em Configurações;
   - o sistema não deixa repetir o mesmo número dentro da empresa.
5. Quando o teste vence ou a conta é suspensa, os dados continuam visíveis, mas o banco bloqueia novos cadastros e alterações. Você reativa em **Plataforma**.

## Importação em lote

Menu **Importar em lote**. O processo tem quatro etapas:

1. **Planilha:** envie um Excel (.xlsx/.xls), CSV ou .ods, ou cole as linhas copiadas do Excel ou do Google Planilhas.
2. **Colunas:** o sistema reconhece os nomes mais comuns (Cliente, Celular, Município, Defeito etc.) e você confirma ou ajusta. Só **nome, telefone e cidade** são obrigatórios.
3. **Revisão:**
   - cidades que ainda não pertencem a nenhuma região são definidas uma vez para todas as linhas, e podem ser guardadas nas regiões;
   - a coluna **Nº da OS** é opcional: as linhas sem número podem receber um número gerado automaticamente, e números que já existem no sistema são recusados;
   - possíveis duplicadas (mesmo telefone e equipamento em aberto, ou repetidas na planilha) são puladas;
   - o sistema **avisa quando uma região ficaria em dias diferentes na mesma semana**, com botão para juntar tudo em um dia;
   - também avisa quando um dia passaria do limite de atendimentos.
4. **Pronto:** cada importação vira um lote que pode ser **desfeito** inteiro.

O sistema entende datas como `05/10/2026`, `05/10` ou datas do Excel, e valores como `R$ 1.234,56`. Na coluna Tipo, “fora”, “particular” ou “avulso” vira fora de garantia. Se a planilha tiver valores de mão de obra, deslocamento ou peças e não informar o tipo, a demanda também vira fora de garantia.

## Próximos passos recomendados

- **Cobrança automática:** hoje você ativa as empresas manualmente em **Plataforma**. Para automatizar, integre Mercado Pago, Asaas ou Stripe. Eles não têm mensalidade e cobram por transação.
- **Evitar a pausa do plano gratuito:** com empresas usando todos os dias o projeto não pausa. Quando crescer, o plano Pro do Supabase remove a pausa e inclui backups.
- **Backups:** exporte periodicamente pelo botão **Exportar planilha** ou use `pg_dump`.
- **LGPD:** o sistema guarda nome, telefone e endereço de clientes finais. Publique termos de uso e política de privacidade antes de vender para outras empresas.
- **Domínio próprio:** Netlify, Vercel e Cloudflare permitem apontar um domínio (ex.: `app.seudominio.com.br`) sem custo extra.
