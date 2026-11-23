# CLAUDE.md — App de Despesas da Casa

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
| `npm run build` | Gera o site final em `dist/` (inclui checagem de tipos) |
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
                 adulteração de ciphertext e de AAD.
  armazenamento/ Interface de armazenamento remoto + implementações: memória/local (testes e
                 modo demonstração) e Google Sheets.
  interface/     Telas React. Só conversa com o domínio e com as interfaces, nunca o contrário.
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

## Termos proibidos pessoais

O dono pode criar `privado/termos-proibidos.txt` (nunca versionado) com nomes reais, e-mails e
percentuais, um por linha. O verificador de segredos bloqueia commits que contenham esses termos,
sem exibi-los. O Claude Code não precisa ler esse arquivo.
