# Guia 02 — Google Cloud: projeto, login e chave do seletor de arquivos

Tempo estimado: **30 a 40 minutos**. Faça no **computador**, no Chrome, entrando com **a sua
conta Google** (a que vai ser dona da planilha).

**Custo: zero.** Não é preciso cadastrar cartão nem ativar faturamento. As APIs usadas (Planilhas,
Drive e seletor de arquivos) são gratuitas para este uso.

O Google Cloud às vezes aparece em português e às vezes em inglês. Os nomes abaixo estão nos dois
idiomas quando necessário: **Português / English**.

> **O que vamos criar e por quê**
> - Um **projeto** no Google Cloud, que é a "ficha" do app no Google.
> - A **tela de consentimento**, que é a janela "O app Viver Gasta quer acessar…". Ela fica em
>   **modo de teste**: só as duas contas de vocês conseguem entrar.
> - Um **ID do cliente OAuth**, que é a identidade do app no login. Ele só funciona no endereço do
>   app.
> - Uma **chave de API** do seletor de arquivos, usada quando a sua esposa escolher a planilha.
>   Ela só funciona no endereço do app.
>
> Nenhum desses itens é secreto: todos vão dentro do site publicado e só funcionam no endereço do
> app. Mesmo assim, **não crie nem baixe "chave secreta do cliente" (client secret)**: o app não
> precisa dela.

---

## Parte 1 — Verificação em 2 etapas nas duas contas Google

Peça para a sua esposa fazer o mesmo na conta dela.

1. Abra <https://myaccount.google.com/security>.
2. Em **Como você faz login no Google / How you sign in to Google**, clique em
   **Verificação em duas etapas / 2-Step Verification**.
3. Se estiver desativada, clique em **Ativar / Turn on** e siga as instruções (o celular serve como
   segundo fator).

---

## Parte 2 — Criar o projeto

1. Abra <https://console.cloud.google.com>. Se aparecer um aviso dos termos de serviço, leia e, se
   concordar, aceite.
2. No topo, à esquerda, clique no **seletor de projetos**. É o botão ao lado do logotipo "Google
   Cloud"; pode estar escrito **Selecionar um projeto / Select a project**.
3. Na janela, clique em **Novo projeto / New project** (canto superior direito).
4. Em **Nome do projeto / Project name**, escreva `viver-gasta`.
5. Deixe **Local / Location** como está (**Sem organização / No organization**) e clique em
   **Criar / Create**.
6. Espere alguns segundos. Abra o seletor de projetos de novo e escolha **viver-gasta**.
7. No menu ☰ (três tracinhos, canto superior esquerdo), clique em **Página inicial / Cloud
   overview** → **Painel / Dashboard**.
8. No cartão **Informações do projeto / Project info**, **anote o "Número do projeto /
   Project number"**. São só números (ex.: `123456789012`).

---

## Parte 3 — Ativar as 3 APIs

1. Menu ☰ → **APIs e serviços / APIs & Services** → **Biblioteca / Library**.
2. Na busca, digite **Google Sheets API**, clique no resultado e em **Ativar / Enable**.
3. Volte à Biblioteca, busque **Google Drive API** e clique em **Ativar / Enable**.
4. Volte à Biblioteca, busque **Google Picker API** e clique em **Ativar / Enable**.

---

## Parte 4 — Tela de consentimento (modo de teste)

1. Menu ☰ → **Google Auth Platform** (às vezes fica dentro de **APIs e serviços**, com o nome
   **Tela de consentimento OAuth / OAuth consent screen**).
2. Se aparecer **Primeiros passos / Get started**, clique e preencha:
   - **Nome do app / App name**: `Viver Gasta`
   - **E-mail para suporte do usuário / User support email**: o seu e-mail
   - Clique em **Próxima / Next**.
   - **Público-alvo / Audience**: **Externo / External**. Clique em **Próxima / Next**.
   - **Informações de contato / Contact information**: o seu e-mail. **Próxima / Next**.
   - Leia a política, marque que concorda e clique em **Continuar / Continue** → **Criar / Create**.
3. No menu da esquerda, clique em **Público-alvo / Audience**:
   - Confira que o **Status de publicação / Publishing status** está **Em teste / Testing**.
     **Não clique em "Publicar app"**.
   - Em **Usuários de teste / Test users**, clique em **+ Adicionar usuários / + Add users**.
   - Digite o **seu Gmail** e o **Gmail da sua esposa** (um por linha) e clique em
     **Salvar / Save**.
4. No menu da esquerda, clique em **Acesso a dados / Data access**:
   - Clique em **Adicionar ou remover escopos / Add or remove scopes**.
   - No filtro, digite `drive.file`.
   - Marque a linha **`.../auth/drive.file`**. A descrição diz algo como "Ver, editar, criar e
     excluir apenas os arquivos do Google Drive que você usa com este app".
   - Clique em **Atualizar / Update** e depois em **Salvar / Save**.

> Esse escopo é o mínimo possível: o app **só enxerga a planilha que ele mesmo criou** ou a que
> vocês escolherem no seletor. O resto do Drive de vocês fica invisível para ele.

---

## Parte 5 — ID do cliente OAuth (o login)

1. No menu da esquerda do **Google Auth Platform**, clique em **Clientes / Clients**.
2. Clique em **+ Criar cliente / + Create client**.
3. **Tipo de aplicativo / Application type**: **Aplicativo da Web / Web application**.
4. **Nome / Name**: `Viver Gasta Web`.
5. Em **Origens JavaScript autorizadas / Authorized JavaScript origins**, clique em
   **+ Adicionar URI / + Add URI** duas vezes e preencha:
   - `https://despesas-casa-app.github.io`
   - `http://localhost:4173` (usado só para os testes no PC)
6. Deixe **URIs de redirecionamento autorizados / Authorized redirect URIs** em branco.
7. Clique em **Criar / Create**.
8. Na janela que aparece, **copie o "ID do cliente / Client ID"**. Ele termina em
   `.apps.googleusercontent.com`.
   - Se aparecer uma "chave secreta do cliente / client secret", **ignore**: não copie e não baixe
     o JSON.

---

## Parte 6 — Chave de API do seletor de arquivos (Picker)

1. Menu ☰ → **APIs e serviços / APIs & Services** → **Credenciais / Credentials**.
2. Clique em **+ Criar credenciais / + Create credentials** → **Chave de API / API key**.
3. Copie a chave que aparece (começa com `AIza`) e clique em **Editar chave de API / Edit API key**
   (ou no lápis ao lado dela na lista).
4. **Nome / Name**: `Picker`.
5. Em **Restrições do aplicativo / Application restrictions**, escolha **Sites / Websites** e
   adicione dois itens com **Adicionar / Add**:
   - `https://despesas-casa-app.github.io/*`
   - `http://localhost:4173/*`
6. Em **Restrições de API / API restrictions**, escolha **Restringir chave / Restrict key** e marque
   só **Google Picker API**.
7. Clique em **Salvar / Save**.

---

## Parte 7 — Colocar os 3 valores no GitHub

O site publicado lê esses valores do GitHub na hora de ser montado. Eles ficam como **variáveis**
(não como "secrets"), porque não são secretos: já vão dentro do site, e as restrições das Partes 5
e 6 impedem o uso fora do endereço do app.

1. Abra o repositório no GitHub → **Settings** (aba no topo).
2. No menu da esquerda: **Secrets and variables** → **Actions**.
3. Clique na aba **Variables** e em **New repository variable**. Crie as três, uma de cada vez:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | o ID do cliente da Parte 5 (termina em `.apps.googleusercontent.com`) |
   | `GOOGLE_API_KEY` | a chave da Parte 6 (começa com `AIza`) |
   | `GOOGLE_APP_ID` | o **número do projeto** da Parte 2 (só números) |

4. Depois, **mande os mesmos três valores para o Claude Code** na conversa. Ele os coloca num
   arquivo local que nunca vai para o GitHub (`.env.local`), para testar no seu PC.

---

## Parte 8 — Primeiro login: o aviso "app não verificado"

Como o app fica em modo de teste, no primeiro login o Google mostra **"O Google não verificou este
app" / "Google hasn't verified this app"**. É esperado.

1. Confira que o nome mostrado é **Viver Gasta**.
2. Clique em **Continuar / Continue**.
3. Na tela seguinte, autorize o acesso aos **arquivos do Drive usados com este app**.

Só as duas contas cadastradas como usuários de teste conseguem passar dessa tela. Qualquer outra
conta é barrada pelo próprio Google.

---

## Checklist final

- [ ] 2 etapas ativa na sua conta Google e na da sua esposa
- [ ] Projeto `viver-gasta` criado; número do projeto anotado
- [ ] Google Sheets API, Google Drive API e Google Picker API ativadas
- [ ] Tela de consentimento **em teste**, com os 2 Gmails como usuários de teste
- [ ] Escopo `drive.file` adicionado
- [ ] ID do cliente (Web) com as 2 origens autorizadas
- [ ] Chave de API restrita aos 2 endereços e só à Google Picker API
- [ ] As 3 variáveis criadas no GitHub (`GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, `GOOGLE_APP_ID`)
- [ ] Os 3 valores enviados ao Claude Code
