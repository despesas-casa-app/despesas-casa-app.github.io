# Prompt de criação do app

> Como usar: abra uma **sessão nova** do Claude Code nesta pasta, ative o **modo de planejamento
> (plan mode)** e cole o texto abaixo da linha.

---

Quero construir o app descrito em `docs/ESPECIFICACAO.md`. Leia esse documento inteiro antes de
qualquer coisa. Ele é a fonte da verdade do produto.

Quem vai cuidar deste projeto não programa. Toda manutenção futura será feita por você, Claude Code.

## Como trabalhar comigo
- Fale comigo em português, em linguagem simples, sem jargão. Quando um termo técnico for
  inevitável, explique em uma frase.
- Trabalhe em **fases** (abaixo). Ao final de cada fase:
  - pare;
  - me diga o que ficou pronto;
  - me diga como eu testo, passo a passo, no celular ou no PC;
  - espere meu OK antes de seguir.
- Tudo que exigir uma ação minha fora do código (criar conta, clicar num console, configurar o
  GitHub) vem como um **guia passo a passo** em `docs/guias/`, com nomes de botões e menus.
  Não faça essas ações por mim.
- **Regras de segredo:**
  - nunca me peça, nunca leia e nunca exiba a frase-mestra;
  - nunca leia arquivos fora desta pasta do projeto;
  - nunca coloque dados pessoais (nomes, e-mails, percentuais, valores reais) em código, testes ou
    documentação: o repositório é público;
  - use dados fictícios nos testes e no modo demonstração.
- Antes de qualquer commit, confira que não há segredo nem dado pessoal sendo versionado.
- Faça commits pequenos, com mensagens em português. Só faça push quando eu autorizar.
- Se alguma decisão da especificação se mostrar inviável ou ruim durante a implementação, pare e
  me explique as opções com uma recomendação. Não mude o desenho sem me consultar.
  Quando eu aprovar, atualize `docs/ESPECIFICACAO.md`.

## Stack
- Vite + React + TypeScript (modo strict).
- **Dependências de runtime mínimas:**
  - React;
  - `idb` para o IndexedDB;
  - nada além disso sem me justificar.
- Gráficos em SVG feito à mão.
- Criptografia só com WebCrypto nativa.
- PWA com service worker (pode usar `vite-plugin-pwa` como dependência de build).
- Testes com Vitest.
- Deploy no GitHub Pages via GitHub Actions.

## Arquitetura do código (obrigatória)
- **Núcleo de domínio puro**, sem React e sem rede: dinheiro, divisão, saldo, competência,
  recorrentes, parcelas, eventos, merge/HLC e sugestões. É a parte mais crítica e precisa ter
  **cobertura de testes alta**.
- **Adaptador de armazenamento remoto** atrás de uma interface, com duas implementações:
  - Google Sheets;
  - memória/local, para testes e para o **modo demonstração**.
- Camada de criptografia isolada e testada:
  - ida e volta;
  - chave errada falha;
  - adulteração do ciphertext ou da AAD falha.
- Interface separada do domínio.

## Fases
**Fase 0 — Fundação**
- Estrutura do projeto, `.gitignore` reforçado (ver especificação 5.6), CSP, lint e testes.
- `CLAUDE.md` com:
  - as regras desta conversa;
  - os comandos do projeto;
  - um resumo da arquitetura;
  - a instrução de sempre consultar e atualizar `docs/ESPECIFICACAO.md`.
- Workflow do GitHub Actions publicando um PWA "olá" no Pages.
- Guia `docs/guias/01-github.md`: criar o repositório, ativar 2FA, ativar o Pages e fazer o
  primeiro push.

**Fase 1 — Núcleo + modo demonstração**
- Todo o domínio da seção 4 da especificação, com testes. Casos obrigatórios:
  - arredondamento de centavos;
  - recorrentes e parcelas idempotentes com dois aparelhos offline;
  - conflito de edição;
  - mudança do % de categoria sem afetar meses fechados;
  - fechamento e reabertura de mês.
- Todas as telas da seção 7 funcionando em **modo demonstração**: dados fictícios, só no
  aparelho, sem Google e sem criptografia.
- Objetivo: eu validar a experiência no celular antes da parte de segurança.
- Meta de usabilidade: lançar uma despesa comum em menos de 10 segundos.

**Fase 2 — Segurança local**
- Frase-mestra (geração e validação).
- Hierarquia KEK/DEK.
- Banco local criptografado.
- Desbloqueio por passkey (WebAuthn PRF), com fallback para PIN.
- Bloqueio automático e limite de tentativas.
- Tudo conforme a seção 5 da especificação.

**Fase 3 — Google e sincronização**
- Guia `docs/guias/02-google-cloud.md`:
  - criar o projeto;
  - tela de consentimento em modo de teste, com as 2 contas;
  - Client ID OAuth restrito à origem do GitHub Pages;
  - chave de API do Picker restrita por referer.
- Login com Google Identity Services, com token só em memória.
- Onboarding da 1ª pessoa (recomendado fazer no PC):
  - criar a planilha;
  - gerar a frase-mestra e instruir a salvar num arquivo **fora da pasta do projeto**;
  - definir nomes e o % das categorias proporcionais;
  - compartilhar a planilha com a 2ª pessoa.
- Onboarding da 2ª pessoa: login, Google Picker e digitar a frase.
- Sincronização conforme a seção 6, com indicador de estado.
- Teste com dois navegadores ou perfis simulando os dois celulares, inclusive offline.

**Fase 4 — Complementos da v1**
- Importação do Tricount (seção 9).
  - Eu forneço só o **cabeçalho** do CSV exportado e algumas linhas com valores **fictícios**.
  - Peça quando chegar nesta fase.
  - Os dados reais serão importados por mim, dentro do app.
- Inteligência de sugestão (seção 8).
- Relatórios.
- Atividade e histórico.
- Exportar backup legível.
- `recuperacao.html` (seção 10).

**Fase 5 — Revisão final**
- Rode uma revisão de segurança completa (`/security-review`) e corrija o que encontrar.
- Teste de ponta a ponta do fluxo completo:
  - onboarding dos dois;
  - lançamentos online e offline;
  - recorrente variável;
  - parcelado;
  - fechamento do mês;
  - recuperação a partir dos CSVs.
- `docs/MANUAL.md` para nós dois:
  - instalar no Android;
  - uso diário;
  - acertar contas;
  - trocar de celular;
  - usar a recuperação;
  - checklist de segurança das contas.

Comece lendo a especificação e me apresentando o plano da Fase 0, junto com qualquer dúvida que
tenha surgido na leitura.
