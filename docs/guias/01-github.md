# Guia 01 — GitHub: conta, organização, repositório e primeiro push

Tempo estimado: **20 a 30 minutos**. Faça no **computador**, no Chrome.

O GitHub está em inglês, então os nomes de botões aparecem em inglês, do jeito que estão na tela.

> **Por que uma organização?** Todo site publicado no GitHub Pages de uma conta pessoal fica sob
> o mesmo endereço (`seu-usuario.github.io`). Para o navegador, eles são **o mesmo site** e
> conseguem ler os dados uns dos outros guardados no celular. Uma organização gratuita só para
> este app dá a ele um endereço exclusivo (`nome-da-organizacao.github.io`).

---

## Parte 1 — Proteger a sua conta pessoal

### 1.1 Verificação em 2 etapas (obrigatório)

1. Entre em <https://github.com> com a sua conta.
2. Clique na sua **foto** (canto superior direito) → **Settings**.
3. No menu da esquerda, em **Access**, clique em **Password and authentication**.
4. Na seção **Two-factor authentication**:
   - se aparecer **"Enabled"**, já está ativo — pule para o 1.2;
   - se não, clique em **Enable two-factor authentication**.
5. Escolha **Authenticator app** e escaneie o QR code com um app autenticador no celular
   (Google Authenticator, Microsoft Authenticator ou similar). Digite o código de 6 dígitos.
6. **Baixe os códigos de recuperação** (botão **Download**) e guarde o arquivo **fora da pasta do
   projeto** — por exemplo, numa pasta pessoal sua ou impressos. Clique em
   **I have saved my recovery codes**.
7. Recomendado: ainda em **Password and authentication**, na seção **Passkeys**, clique em
   **Add a passkey** para também entrar com a digital ou o PIN do aparelho.

### 1.2 E-mail privado (✅ já feito)

O **"Keep my email addresses private"** já foi ativado. Assim o seu e-mail real nunca aparece
nos commits; no lugar dele o GitHub usa um e-mail anônimo terminado em
`@users.noreply.github.com`.

Recomendado (trava extra):

1. **Settings** → no menu da esquerda, **Emails**.
2. Logo abaixo de **Keep my email addresses private**, marque
   **Block command line pushes that expose my email**.

### 1.3 E-mail de backup (recomendado)

Ainda em **Settings → Emails**, o GitHub avisa que a conta tem um único e-mail. Se você perder
o acesso a ele, recuperar a conta fica difícil.

1. Em **Add email address**, digite um segundo e-mail seu e clique em **Add**.
2. Abra a mensagem de confirmação que chega nesse e-mail e clique no link.

---

## Parte 2 — Criar a organização

1. Clique na sua **foto** → **Your organizations**.
2. Clique em **New organization**.
3. Escolha o plano gratuito: **Create a free organization**.
4. Preencha:
   - **Organization name**: um nome **neutro**, sem o seu nome real (ele vira o endereço do
     site e é público). Exemplo: `despesas-casa-xyz`. Use só letras minúsculas, números e hífen.
     **Anote esse nome.**
   - **Contact email**: o seu e-mail (o GitHub não o publica).
   - **This organization belongs to**: **My personal account**.
5. Leia os termos e, se concordar, clique em **Next**.
6. Na tela de convidar pessoas, clique em **Skip this step** (não precisa de mais ninguém).

### 2.1 Exigir 2 etapas na organização

1. Na página da organização, clique em **Settings** (aba no topo).
2. No menu da esquerda, em **Security**, clique em **Authentication security**.
3. Marque **Require two-factor authentication for everyone in the … organization**.
4. Clique em **Save**.

### 2.2 Limitar as ações automáticas

1. Ainda em **Settings** da organização, no menu da esquerda: **Actions** → **General**.
2. Em **Policies**, escolha **Allow … and select non-…, actions and reusable workflows** e
   marque **Allow actions created by GitHub**. Clique em **Save**.
3. Mais abaixo, em **Workflow permissions**, escolha **Read repository contents and packages
   permissions** e clique em **Save**.

---

## Parte 3 — Criar o repositório

1. Na página da organização, clique em **Repositories** → **New repository**.
2. Preencha:
   - **Owner**: a organização que você criou.
   - **Repository name**: **exatamente** `nome-da-organizacao.github.io` (o nome da organização
     seguido de `.github.io`). Exemplo: `despesas-casa-xyz.github.io`. Assim o site fica no
     endereço raiz `https://despesas-casa-xyz.github.io/`.
   - **Description**: pode deixar em branco.
   - Marque **Public** (o GitHub Pages gratuito exige repositório público; o código não tem
     nenhum segredo).
   - **Não** marque **Add a README file**, **Add .gitignore** nem **Choose a license**. O
     repositório precisa nascer vazio.
3. Clique em **Create repository**.

### 3.1 Ligar o GitHub Pages

1. No repositório, clique em **Settings** (aba no topo).
2. No menu da esquerda, em **Code and automation**, clique em **Pages**.
3. Em **Build and deployment** → **Source**, escolha **GitHub Actions**.

### 3.2 Ligar a proteção contra vazamento de segredos

1. Ainda em **Settings** do repositório, no menu da esquerda, clique em **Advanced Security**
   (em algumas contas aparece como **Code security**).
2. Clique em **Enable** (ou ative a chave) em:
   - **Dependabot alerts** — avisa se alguma dependência tiver falha conhecida;
   - **Secret Protection** / **Secret scanning** — procura segredos no código;
   - **Push protection** — bloqueia o envio se houver segredo.

### 3.3 Proteger o branch principal

1. Em **Settings** do repositório, no menu da esquerda: **Rules** → **Rulesets**.
2. Clique em **New ruleset** → **New branch ruleset**.
3. **Ruleset Name**: `proteger-main`. **Enforcement status**: **Active**.
4. Em **Target branches**, clique em **Add target** → **Include default branch**.
5. Em **Rules**, deixe marcados **Restrict deletions** e **Block force pushes**.
6. Clique em **Create**.

Isso impede que o histórico seja apagado ou reescrito por engano.

---

## Parte 4 — Primeiro push

O código já está pronto e com commits no seu PC. Falta enviá-lo ao GitHub.

1. Volte para a conversa com o Claude Code e escreva:
   **"Pode fazer o push. A organização se chama `nome-da-organizacao`."**
2. O Claude Code liga o projeto ao repositório e envia o código.
3. Na primeira vez, vai abrir uma janela do **Git Credential Manager** pedindo para entrar no
   GitHub:
   - clique em **Sign in with your browser**;
   - no Chrome, confira que o endereço é `github.com` e clique em **Authorize git-ecosystem**;
   - se pedir, confirme com a 2 etapas.
   Essa autorização fica salva no Windows; nas próximas vezes não pergunta de novo.

### 4.1 Acompanhar a publicação

1. No repositório, clique na aba **Actions**.
2. Aparece a execução **Publicar no GitHub Pages**. Espere ficar com o ✅ verde (1 a 3 minutos).
   - Se ficar com ❌ vermelho, avise o Claude Code — ele consegue ler o erro.
3. Abra `https://nome-da-organizacao.github.io/` no Chrome. Deve aparecer **"Olá! 👋"**.

---

## Parte 5 — Testar no celular (Android)

1. No Chrome do celular, abra `https://nome-da-organizacao.github.io/`.
2. Toque nos **três pontinhos** (⋮) → **Instalar app** (ou **Adicionar à tela inicial** →
   **Instalar**).
3. Abra o app pelo ícone da casinha na tela inicial. Deve aparecer
   **"Rodando como app instalado"**.
4. Feche o app, ative o **modo avião** e abra de novo. Ele deve abrir normalmente, com o aviso
   **"Sem internet — e o app abriu mesmo assim"**.
5. Desative o modo avião.

---

## Checklist final

- [ ] 2 etapas ativa na conta pessoal (códigos de recuperação guardados fora do projeto)
- [ ] E-mail privado ativo (+ bloqueio de push com e-mail exposto)
- [ ] Organização criada, com 2 etapas obrigatória
- [ ] Repositório `nome-da-organizacao.github.io`, público e criado vazio
- [ ] Pages com **Source: GitHub Actions**
- [ ] Secret scanning, push protection e Dependabot alerts ativos
- [ ] Ruleset `proteger-main` ativo
- [ ] Primeiro push feito e ✅ verde na aba Actions
- [ ] App instalado no celular e abrindo no modo avião
