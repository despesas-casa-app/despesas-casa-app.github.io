# Especificação — App de Despesas da Casa

> Documento de referência do produto. Toda evolução do app deve respeitar este documento
> e atualizá-lo quando uma decisão mudar.
>
> **Privacidade:** este arquivo vai para um repositório público. Ele **não** contém nomes reais,
> percentuais de divisão, e-mails ou qualquer dado pessoal. Esses valores são configurados dentro
> do app (e ficam criptografados).

---

## 1. Problema

Um casal divide as despesas da casa. Cada um paga com a própria conta (não há conta conjunta) e,
uma vez por mês, os dois acertam quem deve para quem. O app usado hoje (Tricount) é lento e exige
retrabalho manual todo mês.

### Dores a eliminar (em ordem de prioridade)
1. Lançar manualmente, todo mês, as mesmas despesas recorrentes.
2. Lançar manualmente, todo mês, a parcela nova de cada compra parcelada.
3. Lentidão para abrir o app e para ver as atualizações do outro.
4. Escolher categoria e forma de divisão em toda despesa (o app não sugere nada).

### Critérios de sucesso
- O app abre e mostra o saldo em **menos de 1 segundo** (vindo do banco local).
- Lançar uma despesa comum leva **menos de 10 segundos**.
- Recorrentes e parcelas aparecem sozinhas no mês certo.
- Na maioria dos lançamentos, categoria, divisão e quem pagou já vêm sugeridos certos.

---

## 2. Usuários e contexto

- **Exatamente 2 pessoas** (Pessoa A e Pessoa B). Os nomes são definidos na configuração inicial.
  O app não terá suporte a outros grupos ou participantes.
- Ambos usam **Android** com Chrome e **contas Google pessoais (@gmail)**.
- Uso secundário pelo **Chrome no computador** (mesmo app, sem arquitetura adicional).
- Volume: cerca de 20 a 30 despesas por pessoa por mês.
- Ficam offline só em situações rápidas (mercado, garagem). Períodos longos offline são raros.
- O dono do projeto **não programa**: toda manutenção será feita pelo Claude Code.
- **Custo: zero.**

---

## 3. Arquitetura

```
 Celulares (Android/Chrome) e PC (Chrome)
 ┌──────────────────────────────────────────┐
 │  PWA instalável (GitHub Pages)           │
 │  ├─ Desbloqueio: biometria (passkey) ou PIN
 │  ├─ Banco local criptografado (IndexedDB)│  ← abre instantâneo, funciona offline
 │  ├─ Fila de eventos pendentes (outbox)   │
 │  └─ Motor de sincronização               │
 └──────────────┬───────────────────────────┘
                │ HTTPS + OAuth Google (escopo drive.file)
                ▼  apenas dados já criptografados saem do aparelho
 ┌──────────────────────────────────────────┐
 │  Google Sheets no Drive do casal         │
 │  compartilhada só entre as 2 contas      │
 │  aba "meta"    → parâmetros de cripto    │
 │  aba "eventos" → 1 linha por evento      │
 └──────────────────────────────────────────┘
```

- **Hospedagem:** GitHub Pages (repositório público). O código não contém nenhum segredo.
  O site fica numa **organização do GitHub exclusiva para este app** (repositório
  `<organizacao>.github.io`, endereço `https://<organizacao>.github.io/`). Motivo: todos os sites
  do Pages de uma mesma conta dividem a mesma origem no navegador e poderiam ler os dados locais
  uns dos outros e acionar a mesma passkey.
- **Banco central:** uma planilha Google Sheets usada apenas como **log de eventos criptografados,
  só de acréscimo** (append-only).
- **Local-first:** a interface sempre lê do banco local. A sincronização roda em segundo plano.
- **Sem servidor próprio.** Sem analytics, sem rastreadores, sem serviços de terceiros além do Google.

---

## 4. Modelo de dados

### 4.1 Event sourcing
Cada ação vira um evento imutável: criar, alterar campos, excluir, fechar mês, reabrir mês,
criar categoria, e assim por diante. O estado atual é a soma dos eventos.

- O app **nunca** apaga nem sobrescreve uma linha da planilha.
- Conflitos (os dois editando o mesmo campo offline) são resolvidos por **última escrita vence,
  campo a campo**, usando um relógio lógico híbrido (HLC) mais o id do aparelho como desempate.
  As duas versões ficam no histórico.
- Eventos de criação com um id que já existe são **idempotentes**: vale o de menor HLC (o mais
  antigo pelo relógio lógico, com o id do aparelho como desempate). Assim todos os aparelhos
  chegam ao mesmo resultado, seja qual for a ordem em que os eventos chegaram.

### 4.2 "Livros" (ledgers)
Toda despesa pertence a um **livro**. Na v1 existe um único livro, **"Casa"**, com fechamento
mensal. Na v2, cada projeto (viagem etc.) é um livro novo com aba, saldo e fechamento próprios,
reaproveitando o mesmo motor. O modelo já nasce preparado para isso.

### 4.3 Entidades (todas dentro do conteúdo criptografado)

| Entidade | Campos principais |
|---|---|
| **Configurações** | nomes da Pessoa A e da Pessoa B, e-mails autorizados, moeda (BRL) |
| **Categoria** | id, nome, ícone/cor, **divisão padrão** (% da Pessoa A; o da B é o complemento), ativa/arquivada, ordem |
| **Despesa** | id, livro, valor (centavos, inteiro), descrição, data, **mês de competência** (AAAA-MM), categoria, quem pagou, **% da Pessoa A gravado na própria despesa**, origem (manual / recorrente:{id} / parcela:{id, k, n}), status (normal / aguardando valor) |
| **Recorrente** | id, descrição, categoria, quem paga, valor fixo **ou** variável, dia do mês, mês de início, mês de fim (opcional), % (opcional; senão usa o da categoria), ativa |
| **Parcelamento** | id, descrição, categoria, quem pagou, valor da parcela (ou total), nº de parcelas, competência da 1ª parcela, % |
| **Fechamento** | livro, competência, saldo calculado, transferência (de quem, para quem, valor), data, quem fechou |

### 4.4 Regras de negócio

**Dinheiro**
- Sempre em centavos inteiros. Nunca usar ponto flutuante para dinheiro.
- Arredondamento da divisão: o centavo que sobrar fica com quem pagou (quem pagou absorve).
  Exemplo: R$ 10,01 em 50/50, pago pela Pessoa A → cota de A = R$ 5,01, cota de B = R$ 5,00;
  B deve R$ 5,00.

**Divisão**
- O % aceita **até 2 casas decimais** (ex.: 58,35%). Internamente é guardado como inteiro em
  centésimos de ponto percentual (0 a 10000), sem ponto flutuante.
- Cada categoria tem uma divisão padrão, configurada na aba **Categorias**.
- Ao criar uma despesa, o % da categoria é **copiado para a despesa** e pode ser mudado ali.
- Alterar o % de uma categoria vale para despesas novas. O app pergunta se deve aplicar também às
  despesas do **mês aberto** que ainda usam o % padrão. **Meses fechados nunca mudam.**

**Mês de competência**
- Por padrão é o mês da data da despesa, e o usuário pode alterar.
- O saldo e o fechamento são calculados por competência.
- Fechar um mês com atraso (ex.: fechar novembro em 5 de dezembro) não mistura meses.

**Recorrentes**
- Ser recorrente é característica da **despesa**, não da categoria.
- Ao abrir o app, gerar as ocorrências que faltam até o mês corrente. A ocorrência do mês aparece
  já no dia 1º, com a data do dia configurado.
- Se o dia configurado não existir no mês (ex.: dia 31 em fevereiro), usar o último dia do mês.
- O id de cada ocorrência é **determinístico** (hash de recorrenteId + competência), para que
  dois aparelhos gerando offline não dupliquem nada.
- Recorrentes de valor variável entram com status **"aguardando valor"** e aparecem como
  pendência no topo da tela inicial.

**Parcelamentos**
- Ao lançar uma compra parcelada, gerar **todas as parcelas de uma vez**, cada uma na sua
  competência e com id determinístico (parcelamentoId + k).
- Quando informado pelo valor total, os centavos que não dividem por igual vão para a 1ª parcela.
- Exibir como "Sofá 3/10".
- É possível editar ou cancelar as parcelas restantes (ex.: antecipação).

**Saldo do mês**
- Para cada pessoa: saldo = total que ela pagou − soma das cotas dela.
- Exibir em linguagem natural: "Pessoa B deve R$ 342,10 para Pessoa A".

**Fechamento ("Acertar contas")**
- Mostra o resumo do mês e o valor a transferir.
- Ao confirmar, registra a transferência e **trava** o mês.
- Alerta se ainda houver despesas "aguardando valor".
- Reabrir um mês é possível, com confirmação, e fica no histórico.
- **Lançamento em mês fechado:** se alguém tentar lançar ou editar uma despesa numa competência já
  fechada, ou se uma despesa lançada offline chegar pela sincronização depois que o mês foi
  fechado, o app mostra a janela **"Esse mês já está fechado. O que você deseja fazer?"** com as
  opções **"Mover para o mês em aberto"** e **"Reabrir o mês"**. Nada é movido sozinho.

**Edição**
- Qualquer um dos dois pode editar ou excluir qualquer despesa, inclusive as lançadas pelo outro.
- Tudo fica no histórico.

### 4.5 Categorias iniciais (editáveis, e é possível criar novas)

| Categoria | Divisão padrão |
|---|---|
| Moradia | proporcional (% definido no onboarding) |
| Despesas da Casa | proporcional (% definido no onboarding) |
| Contas de Consumo | proporcional (% definido no onboarding) |
| Viagens | 50/50 |
| Carro | 50/50 |
| Gatinhos | 50/50 |
| Casamento | 50/50 |
| Seguro | 50/50 |
| Transporte | 50/50 |
| Entretenimento | 50/50 |
| Hospedagem | 50/50 |
| Compras | 50/50 |
| Outros | 50/50 |

"Proporcional" significa que o onboarding pergunta o % da Pessoa A e grava esse valor nessas três
categorias. Depois disso, cada categoria é editada individualmente.

---

## 5. Segurança

### 5.1 Ameaças consideradas
- (a) celular perdido ou roubado;
- (b) alguém abrir a planilha;
- (c) o próprio Google ler os dados;
- (d) alguém se passar por um dos dois;
- (e) alguém alterar o código publicado (supply chain).

### 5.2 Criptografia de ponta a ponta
- **Frase-mestra:** 7 palavras aleatórias em português, de uma lista com pelo menos 2048 palavras
  sem acento (≥ 77 bits de entropia). É gerada pelo app no onboarding.
- **Hierarquia de chaves:**
  - frase-mestra → PBKDF2-SHA256 (≥ 600.000 iterações, salt aleatório) → **KEK**;
  - **DEK** aleatória (AES-256-GCM), "embrulhada" pela KEK;
  - salt, parâmetros e a DEK embrulhada ficam na aba `meta`;
  - trocar a frase só re-embrulha a DEK, sem recriptografar os dados.
- **Cada evento:** AES-256-GCM com IV aleatório de 96 bits. Os dados associados (AAD) incluem o
  id do evento e a versão do esquema.
- **Texto puro na planilha:** apenas `id do evento`, `versão do esquema` e `ciphertext`.
  Datas, autor, valores e descrições ficam **dentro** do ciphertext.
- Usar apenas a **WebCrypto** nativa do navegador. Nenhuma biblioteca de criptografia de terceiros.

### 5.3 Onde fica a frase-mestra
- **Na configuração inicial:** o dono guarda a frase num arquivo do PC, **fora da pasta do projeto**
  (pasta criada por ele).
- **Uso no dia a dia:** nenhum.
- **Usada só em:**
  - configurar um aparelho novo;
  - reinstalar o app ou depois de apagar os dados do Chrome;
  - usar a ferramenta de recuperação;
  - trocar a frase.
- O Claude Code **nunca** deve ler, pedir ou exibir a frase-mestra.
- Se a frase e todos os aparelhos forem perdidos, os dados são irrecuperáveis (comportamento esperado).

### 5.4 Desbloqueio local
- **Login Google só no primeiro acesso.** Depois disso, o app abre com:
  - **biometria** (método padrão): passkey via WebAuthn com a extensão PRF;
  - **PIN** (mínimo de 6 dígitos) **só como reserva**, quando o aparelho não suportar a biometria
    com PRF. O PIN é o elo mais fraco: o limite de tentativas protege contra quem digita na tela,
    mas não contra quem copia os dados do aparelho.
- A DEK fica guardada no IndexedDB **embrulhada** por uma chave derivada da PRF da passkey ou do
  PIN (PBKDF2 com muitas iterações). Ela só existe em memória enquanto o app está desbloqueado.
- **Bloqueio automático** após 5 minutos em segundo plano ou ao fechar o app.
- **10 PINs errados:** apaga a DEK local e passa a exigir a frase-mestra.
- O banco local (IndexedDB) guarda **apenas dados criptografados**.

### 5.5 Google
- OAuth com Google Identity Services, no **modelo de token**, com escopo **`drive.file`**
  (mínimo privilégio: o app só enxerga a planilha que ele criou ou que foi aberta pelo Picker).
- O access token fica **só em memória**. Nunca em localStorage.
- Renovação silenciosa em segundo plano. Se a renovação silenciosa falhar, mostrar a faixa
  "Toque para sincronizar".
- O projeto no Google Cloud fica em **modo de teste**, com só as 2 contas como usuários de teste.
- A 2ª pessoa ganha acesso pelo **Google Picker** (passo único no onboarding).
- Depois do login, conferir se o e-mail está na lista de autorizados das configurações.

### 5.6 Código e publicação
- Content Security Policy restritiva:
  - scripts: só `'self'` e os domínios do Google necessários para login e Picker;
  - `connect-src`: só as APIs do Google.
  - Como o GitHub Pages não permite cabeçalhos HTTP, a CSP vai numa tag `<meta>`. Nesse formato
    `frame-ancestors` não funciona, então o próprio app se recusa a rodar dentro de um iframe
    (proteção contra clickjacking).
- Sem CDNs de terceiros. Dependências mínimas, versões fixas e lockfile no repositório.
  O npm não roda scripts de instalação de pacotes (`ignore-scripts`). As ações do GitHub Actions
  ficam travadas pelo SHA do commit.
- `.gitignore` bloqueia `privado/`, `*.csv`, `*.xlsx`, `.env*` e `*.key` (e outros formatos de
  planilha, chave e credencial).
- **Verificador de segredos** (`scripts/verificar-segredos.mjs`): roda antes de cada commit e no
  GitHub Actions; bloqueia chaves, tokens, e-mails reais, arquivos proibidos e os termos pessoais
  listados em `privado/termos-proibidos.txt` (arquivo local, nunca versionado).
- Commits usam o e-mail anônimo (noreply) do GitHub.
- Checklist do dono: verificação em 2 etapas nas 2 contas Google e no GitHub.

---

## 6. Sincronização

- **Outbox local:** eventos criados offline ficam numa fila e são enviados com `values.append`.
- **Pull incremental:** ler a aba `eventos` a partir da última linha conhecida.
- **Gatilhos:** ao abrir/desbloquear o app, ao voltar a conexão, a cada ~30 s com o app em primeiro
  plano e logo depois de cada lançamento.
- **Indicador discreto de estado:** sincronizado / pendente (n) / offline / toque para sincronizar.
- Retentativa com backoff exponencial.
- Tratar o limite de taxa (quota) da API do Sheets.

---

## 7. Telas

1. **Início**
   - saldo do mês aberto em destaque, em linguagem natural;
   - pendências ("aguardando valor");
   - botão grande "+ Despesa";
   - últimos lançamentos;
   - indicador de sincronização.
2. **Nova/editar despesa**
   - teclado numérico já aberto no valor;
   - descrição com autocomplete;
   - sugestões de categoria, % e quem pagou;
   - data e competência;
   - opções recolhidas: "Parcelado" e "Repetir todo mês".
3. **Despesas do mês**
   - lista por competência, com filtros por categoria e por pessoa;
   - selo "editado por …" e linha do tempo da despesa.
4. **Relatórios**
   - gasto por categoria no mês;
   - comparação entre meses;
   - quanto cada um pagou.
5. **Acertar contas:** resumo do mês, transferência e confirmação de fechamento.
6. **Categorias:** criar, editar, arquivar e reordenar, e definir a divisão padrão.
7. **Recorrentes e parcelamentos:** listar, editar, pausar e encerrar.
8. **Atividade:** histórico geral em feed limpo, agrupado por dia.
   Exemplo: "Pessoa B alterou Mercado: R$ 120 → R$ 150".
9. **Configurações**
   - nomes;
   - segurança (PIN/biometria, bloquear agora, trocar frase);
   - exportar backup legível (CSV/XLSX gerado localmente);
   - importar do Tricount;
   - sobre.

### Diretrizes de interface
- Português do Brasil, formato BRL (R$ 1.234,56) e datas dd/mm/aaaa.
- Mobile-first, alvos de toque ≥ 44 px, modo claro e escuro, visual limpo e moderno.
- Nada de spinners bloqueantes: a interface responde na hora e a sincronização acontece por trás.

---

## 8. Inteligência de sugestão (local)
- Aprende com o histórico, incluindo o importado: descrição normalizada →
  frequência de categoria, % e quem pagou.
- Busca aproximada (sem acento, sem caixa, tokens, prefixos).
- Ranking por frequência e recência.
- Roda 100% no aparelho. Nenhuma API externa.

---

## 9. Importação do Tricount
- Feita **dentro do app** (Configurações → Importar). O arquivo é lido localmente e nunca é enviado
  a lugar nenhum.
- Antes de importar, mostrar uma prévia com mapeamento de colunas, de pessoas e de categorias.
- Reembolsos/acertos do Tricount viram fechamentos. Meses importados ficam fechados.
- O import alimenta a inteligência de sugestão.

---

## 10. Ferramenta de recuperação
- Página HTML isolada (`recuperacao.html`) que funciona offline.
- Recebe os CSVs das abas `meta` e `eventos`, baixados do Drive, mais a frase-mestra.
- Gera um CSV/XLSX legível com todas as despesas.
- Tudo acontece no navegador. Nenhuma requisição de rede.

---

## 11. Roadmap
- **v1:** tudo acima.
- **v2:**
  - **Projetos**: novos livros, cada um com aba própria, moeda própria (opcional) e saldo e
    fechamento independentes do mês;
  - **limites por categoria**.
- **Futuro (se fizer falta):** notificações push (exigiria um componente de servidor).
