# Orçamento 2026

App de orçamento pessoal (web e celular) publicado no **GitHub Pages**, com os dados guardados no **Supabase**, protegidos por login.

- O site no GitHub é público, mas **não contém nenhum dado financeiro**. Os números ficam no Supabase, e as regras de segurança deixam cada conta ver só os próprios dados.
- **Nunca suba o arquivo `dados-orcamento.json` para o GitHub.**

## Colocar no ar (uma vez só)

### 1. Supabase (banco + login)
1. Crie uma conta grátis em supabase.com e clique em **New project** (região: São Paulo).
2. No projeto, abra **SQL Editor › New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings › API**, copie o **Project URL** e a **anon public key**. Cole os dois em `config.js` ou digite na primeira tela do app.
4. Em **Authentication › URL Configuration**, coloque o endereço do seu site do GitHub em **Site URL**. Isso faz o e-mail de confirmação voltar para o app.

### 2. GitHub Pages
1. Crie um repositório público em github.com/new (ex.: `orcamento`).
2. Envie todos os arquivos desta pasta (Add file › Upload files).
3. Em **Settings › Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. Em 1 ou 2 minutos o site fica em `https://SEU-USUARIO.github.io/orcamento/`.

### 3. Primeiro acesso
1. Abra o link, toque em **Criar minha conta** e confirme o e-mail.
2. Entre e escolha o arquivo `dados-orcamento.json` para carregar seus dados. Isso é feito uma vez só; os outros aparelhos já entram com tudo.
3. No celular, use **Compartilhar › Adicionar à Tela de Início** para abrir como aplicativo.

## Arquivos
- `index.html`, `app.js`: o app (telas do handoff "design_handoff_app_orcamento")
- `config.js`: endereço e chave pública do Supabase
- `supabase.js`: biblioteca oficial do Supabase (v2.45.4), embutida no projeto
- `supabase/schema.sql`: tabela e regras de segurança
