# CLAUDE.md — Viver Gasta (app de despesas da casa)

Instruções permanentes para o Claude Code neste projeto. Leia inteiro antes de trabalhar.

## Fonte da verdade

- **`docs/ESPECIFICACAO.md` é a fonte da verdade do produto.** Consulte antes de qualquer mudança.
- Se uma decisão da especificação se mostrar inviável ou ruim: **pare**, explique as opções com
  uma recomendação e espere o OK. Não mude o desenho sem consultar.
- Quando o dono aprovar uma mudança de decisão, **atualize `docs/ESPECIFICACAO.md`** no mesmo
  trabalho.
- `docs/PROMPT_CRIACAO.md` guarda o pedido original e o plano das fases.

## Quem é o dono e como falar com ele

- O dono **não programa**. Toda manutenção é feita pelo Claude Code.
- Fale em **português**, em linguagem simples, sem jargão. Se um termo técnico for inevitável,
  explique em uma frase.
- Trabalhe em **fases**. Ao fim de cada fase: pare; diga o que ficou pronto; diga como testar,
  passo a passo, no celular ou no PC; espere o OK antes de seguir.
- Tudo que exigir ação do dono fora do código (criar conta, clicar num console, configurar o
  GitHub ou o Google) vira um **guia passo a passo em `docs/guias/`**, com nomes de botões e
  menus. Não faça essas ações por ele, a menos que ele peça explicitamente.

## Regras de segredo (inegociáveis)

- **Nunca** peça, leia ou exiba a **frase-mestra**.
- **Nunca** leia arquivos fora desta pasta do projeto.
- **O repositório é público.** Nunca coloque dados pessoais (nomes reais, e-mails, percentuais
  de divisão, valores reais) em código, testes, documentação ou mensagens de commit.
- Use só **dados fictícios** nos testes e no modo demonstração (Pessoa A / Pessoa B, e-mails
  `@exemplo.com`, valores inventados).
- Antes de qualquer commit, confira que não há segredo nem dado pessoal sendo versionado. O
  gancho `.githooks/pre-commit` roda o verificador automaticamente — não o desative e nunca use
  `--no-verify`.
- A identidade do Git neste repositório usa o **e-mail anônimo (noreply) do GitHub**, configurado
  só localmente (`git config user.email`). Nunca use o e-mail real.

## Git

- Commits **pequenos**, com mensagens **em português**.
- **Só faça push quando o dono autorizar**, a cada vez.
- Branch principal: `main`. Cada push em `main` publica o site (workflow `publicar.yml`).

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências (sem rodar scripts de terceiros — ver `.npmrc`) |
| `npm run dev` | Abre o app no PC para desenvolvimento |
| `npm run build` | Gera o site final em `dist/` (tipos + página de recuperação + app) |
| `npm run preview` | Serve o `dist/` localmente para conferir o build |
| `npm test` | Roda os testes (Vitest) |
| `npm run test:cobertura` | Testes + cobertura (mínimo de 95% em `src/dominio` e `src/cripto`) |
| `npm run lint` | Confere o estilo e regras de segurança do código (ESLint) |
| `npm run tipos` | Confere os tipos (TypeScript estrito) |
| `npm run verificar-segredos` | Procura segredos e dados pessoais em todos os arquivos |
| `npm run verificar` | Tudo acima de uma vez (segredos, lint, tipos, testes) |
| `npm run gerar-icones` | Recria os ícones PNG em `public/icones/` |

Depois de clonar o repositório, ative os ganchos uma vez: `git config core.hooksPath .githooks`.

## Stack

- Vite + React + TypeScript (modo **strict**, com `noUncheckedIndexedAccess` e
  `exactOptionalPropertyTypes`).
- Dependências de **runtime** permitidas: `react`, `react-dom` e `idb`. Qualquer outra precisa de
  justificativa e aprovação do dono.
- Gráficos em SVG feito à mão. Criptografia só com **WebCrypto** nativa.
- PWA com `vite-plugin-pwa` (só no build). Testes com Vitest. Deploy no GitHub Pages via Actions.
- Versões **exatas** no `package.json` e `package-lock.json` versionado.
- Ações do GitHub travadas pelo **SHA do commit**, com a versão em comentário.

## Arquitetura

```
src/
  dominio/       Núcleo puro: dinheiro, divisão, saldo, competência, recorrentes, parcelas,
                 eventos, merge/HLC, sugestões. SEM React, SEM rede, SEM armazenamento.
                 O ESLint bloqueia imports de react/idb/interface e o uso de fetch, window etc.
                 Precisa de cobertura de testes alta.
  cripto/        Camada de criptografia isolada (WebCrypto). Testes: ida e volta, chave errada,
                 adulteração de ciphertext e de AAD. frase.ts + palavras.ts (BIP-0039 pt, NÃO
                 editar), chaves.ts (PBKDF2/HKDF, DEK, embrulhos), conteudo.ts (eventos AES-GCM),
                 pin.ts, passkey.ts (WebAuthn PRF, recebe navigator.credentials de fora).
  armazenamento/ remoto.ts: interface do log remoto (memória agora; Google Sheets na Fase 3).
                 local.ts: banco da demonstração (sem cripto). cifrado.ts: banco real, que só
                 guarda linhas cifradas + meta (DEK sempre embrulhada).
  aplicacao/     loja.ts: guarda os eventos do aparelho, monta o estado e executa as regras.
                 cofre.ts: cria/abre a DEK (frase, PIN com limite de 10, biometria).
                 sessao.ts: boas-vindas / bloqueado / aberto (real ou demo) + bloqueio automático,
                 criar com planilha, entrar em cofre existente, "Toque para sincronizar".
                 sincronizacao.ts: fila de saída, puxada incremental, retentativas.
                 demo.ts gera os dados FICTÍCIOS do modo demonstração.
  google/        Login (GIS, token só em memória), planilha (Sheets, só acréscimo), Drive
                 (e-mail da conta, compartilhar) e Picker. Implementa aplicacao/servicoRemoto.ts.
  recuperacao/   Página de recuperação offline (recuperacao.html na raiz + pagina.ts + recuperar.ts).
                 Montada por vite.recuperacao.config.ts como UM arquivo, com connect-src 'none'.
  interface/     Telas React (telas/ e componentes/). Só conversa com a loja e o domínio.
                 Navegação por "#" (rotas.ts). Gráficos em SVG feito à mão.
  main.tsx       Ponto de entrada; recusa rodar dentro de iframe (proteção contra clickjacking).
scripts/         Verificador de segredos (+ testes) e gerador de ícones.
.githooks/       Ganchos do Git: pre-commit e commit-msg rodam o verificador de segredos.
docs/            Especificação, guias do dono (docs/guias/) e manual.
```

## Segurança do site publicado

- **CSP** via `<meta>` (o GitHub Pages não permite cabeçalhos), injetada só no build por
  `vite.config.ts`. Hoje: tudo `'self'`. Na Fase 3, acrescentar **apenas** os domínios do Google
  necessários (login, Picker, APIs).
- `frame-ancestors` não funciona via `<meta>`; por isso `src/interface/protecao.ts`.
- Sem CDNs, sem analytics, sem rastreadores.
- O site mora numa **organização exclusiva do GitHub** (`<org>.github.io`), para não dividir a
  origem do navegador com outros sites do dono.

## Segredos no app (Fase 2)

- Bancos no navegador: `viver-gasta` (real, só cifrado) e `viver-gasta-demo` (fictício).
- A frase-mestra e o PIN nunca são gravados. A DEK só existe na memória com o app desbloqueado.
- Ao testar no navegador, crie um cofre de TESTE em localhost e apague-o no fim
  (Configurações → Segurança → Apagar os dados deste celular).

## Google (Fase 3)

- IDs públicos em variáveis: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`.
  No GitHub: *variables* (não secrets) `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, `GOOGLE_APP_ID`.
  No PC: arquivo `.env.local` (bloqueado pelo .gitignore). Nunca escrever a chave no código: o
  verificador de segredos barra chaves `AIza…`.
- Sem esses valores o app funciona sem Google (cofre só no aparelho).
- Os testes usam um "Google de mentira" (src/google/google.test.ts, src/aplicacao/sessaoGoogle.test.ts).

## Termos proibidos pessoais

O dono pode criar `privado/termos-proibidos.txt` (nunca versionado) com nomes reais, e-mails e
percentuais, um por linha. O verificador de segredos bloqueia commits que contenham esses termos,
sem exibi-los. O Claude Code não precisa ler esse arquivo.
