# Especificação — Viver Gasta (app de despesas da casa)

> **Nome e identidade:** o app se chama **Viver Gasta**, inspirado numa frase de Ida Feldman.
> O ícone são **azulejos amarelos lisos** (sem brilho, reflexo ou relevo) com rejunte claro. O
> visual do app também é chapado, sem degradês ou efeitos brilhantes. A **cor principal é `#F8D588`**,
> usada no ícone e na interface. Por ser um tom pastel, texto sobre ela é sempre escuro, e links,
> ícones e contornos de foco usam o mesmo tom escurecido (`#8A6212`) para ficarem legíveis.

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
- **Na tela, a divisão aparece sempre do ponto de vista de quem está usando o aparelho**
  ("Sua parte nesta despesa", com a parte do outro ao lado). Ex.: se a Pessoa B tem 40% em
  "Despesas da Casa" e é ela quem lança, o campo já vem com 40%. Por dentro, a despesa e a
  categoria continuam guardando o % da Pessoa A.
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
- O id de cada ocorrência é **determinístico** (composto de recorrenteId + competência, ex.:
  `rec_<id>_2026-11`; ele fica dentro do conteúdo criptografado), para que dois aparelhos gerando
  offline não dupliquem nada.
- Recorrentes de valor variável entram com status **"aguardando valor"** e aparecem como
  pendência no topo da tela inicial.
- Ao cadastrar, o dia do vencimento é informado à parte ("Vence todo dia"), sem valor padrão.
- **Edição completa:** tudo pode ser editado (valor fixo/variável, valor, descrição, categoria,
  quem paga, divisão, dia, início e fim). Opção (marcada por padrão) de atualizar também as
  despesas já lançadas em **meses ainda não acertados**:
  - cada campo só muda na despesa se ela ainda estiver igual ao que a recorrente gerou (o que foi
    mudado à mão naquela despesa fica como está);
  - de "variável" para "fixo", as que aguardavam valor recebem o valor novo;
  - as que ficarem fora do novo período (início/fim) são excluídas.
  - Se o início ficar mais cedo, os meses que faltam são gerados na hora (menos os acertados).
  - Meses acertados nunca mudam.

**Parcelamentos**
- Ao lançar uma compra parcelada, gerar **todas as parcelas de uma vez**, cada uma na sua
  competência e com id determinístico (parcelamentoId + k).
- Quando informado pelo valor total, os centavos que não dividem por igual vão para a 1ª parcela.
- Exibir como "Sofá 3/10".
- É possível cancelar as parcelas restantes (ex.: antecipação).
- **Edição completa:** descrição, categoria, quem pagou, divisão, valor (total ou por parcela),
  nº de parcelas, data da compra e mês da 1ª parcela. Parcelas de **meses acertados nunca
  mudam**; as demais seguem estas regras:
  - descrição, categoria, quem pagou e divisão valem para todas as parcelas em aberto;
  - mudou o valor ou o nº de parcelas: pelo total, o que falta (total − já acertado) é dividido
    entre as parcelas em aberto (centavos que sobram na primeira delas); pela parcela, cada uma
    em aberto passa a ter esse valor. Parcelas excluídas à mão voltam a existir nesse caso;
  - menos parcelas: as que sobram são excluídas; mais parcelas: as novas entram nos meses
    seguintes;
  - mudou a data da compra ou o mês da 1ª parcela: as parcelas em aberto mudam de data/mês. O mês
    da 1ª parcela não muda se já houver parcela acertada;
  - é recusada a edição que deixaria uma parcela num mês já acertado, ou um nº de parcelas menor
    que o da última parcela acertada;
  - parcelamento cancelado: só descrição, categoria, quem pagou e divisão.
  - No feed de Atividade, a edição aparece numa linha só; a linha do tempo de cada parcela mostra
    o detalhe.

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
  - Exceção: ao **editar ou excluir uma despesa que já entrou no acerto**, a janela oferece só
    **"Reabrir o mês"**. Movê-la faria a mesma despesa ser cobrada duas vezes (no acerto antigo
    e no novo).

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
  - Lista usada: a portuguesa do padrão **BIP-0039** (2048 palavras, licença MIT), em
    `src/cripto/palavras.ts`. Nunca mudar a lista: isso invalidaria as frases já criadas.
  - Ao digitar, bastam as **4 primeiras letras** de cada palavra (elas nunca se repetem na lista);
    acentos, maiúsculas e espaços extras não importam.
  - Na criação, o app pede 3 palavras sorteadas de volta, para conferir se a frase foi anotada.
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
  PIN (PBKDF2 com muitas iterações). Aberta, ela só existe em memória enquanto o app está
  desbloqueado.
- **Bloqueio automático após 1 hora sem uso** (decisão do dono, 23/11/2026; antes eram 5 minutos
  em segundo plano ou ao fechar). Vale para segundo plano, app fechado pelo Android e recarga da
  página: dentro de 1 hora desde o último uso, o app reabre sem pedir a digital.
  - Como funciona: a cada desbloqueio, a DEK é embrulhada também por uma **chave temporária não
    exportável** (o navegador não deixa nenhum código copiá-la), guardada no banco local com o
    prazo. O prazo é renovado enquanto o app está na tela e quando ele vai para segundo plano.
  - "Bloquear agora", 10 PINs errados e "Apagar os dados deste celular" apagam essa sessão na
    hora.
  - Risco aceito: durante a 1 hora, quem pegar o celular destravado consegue abrir o app.
- **10 PINs errados:** apaga a DEK local e passa a exigir a frase-mestra.
- O banco local (IndexedDB) guarda **apenas dados criptografados**.
- Detalhes da implementação (Fase 2):
  - a biometria usa uma passkey do próprio aparelho com a extensão PRF; os 32 bytes secretos dela
    passam por HKDF-SHA256 e viram a chave que embrulha a DEK. O PIN usa PBKDF2-SHA256 com as
    mesmas ≥ 600.000 iterações da frase;
  - se o aparelho não oferece biometria com PRF, o app vai direto para o PIN;
  - a frase-mestra sempre pode ser usada na tela de bloqueio; depois de abrir com ela sem
    biometria/PIN configurados, o app pede para configurar um dos dois;
  - **trocar a frase exige a frase atual** (um celular desbloqueado nas mãos de outra pessoa não
    basta para trocá-la);
  - "Apagar os dados deste celular" (Configurações → Segurança) exige digitar APAGAR. O aviso diz a
    verdade conforme o caso: sem Google, não tem volta; com Google, a planilha guarda tudo, então
    apagar o celular **não desfaz nada** (ao entrar de novo, volta igual);
  - o modo demonstração usa um banco separado, sem criptografia e só com dados fictícios. Ele é
    escolhido na tela de boas-vindas e nunca se mistura com os dados reais.

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

### 6.1 Como ficou implementado (Fase 3)
- **Planilha:** "Viver Gasta (dados criptografados)", com as abas `meta` (linhas `chave | valor`:
  `formato = viver-gasta-v1` e `cofre = {parâmetros}`) e `eventos` (`id | versao | conteudo`). Tudo
  só por acréscimo; a troca de frase acrescenta uma nova linha `cofre` (vale a última válida).
- **Fila de saída:** são "pendentes" todos os eventos do aparelho que a planilha ainda não
  confirmou. Retentar é seguro: linhas repetidas são ignoradas por quem lê (mesmo id).
- **Retentativas:** 5 s, 10 s, 20 s… até 5 min. Erros de login viram "Toque para sincronizar";
  falta de acesso à planilha vira um erro claro na faixa do topo.
- **Linhas que não abrem** (outro cofre, edição manual) são ignoradas e contadas em
  Configurações → Google e sincronização.
- **Login:** o token do Google fica só em memória (5.5). Abrir a janela do Google exige um toque da
  pessoa, então **a cada abertura do app, e quando o token vence (cerca de 1 hora), aparece a
  faixa "Toque para sincronizar"**. Os lançamentos continuam funcionando normalmente e ficam na
  fila até o toque.
- **1ª pessoa (criar o cofre):** entra com o Google → frase → nomes, e-mail Google da outra pessoa
  e divisão → biometria/PIN → o app cria a planilha, grava os parâmetros do cofre, **compartilha
  como editora** com o e-mail informado (o Google avisa a outra pessoa por e-mail) e abre.
- **2ª pessoa ou celular novo ("Já temos um cofre: entrar"):** entra com o Google → escolhe a
  planilha no seletor (Picker) → digita a frase (conferida sem gravar nada) → biometria/PIN → o
  app baixa tudo e só fica se o e-mail da conta estiver entre os autorizados; se não estiver,
  apaga o que baixou. Quem é quem (Pessoa A/B) vem do e-mail.
- **Cofre criado sem o Google, ligado depois** (Configurações → Google e sincronização →
  "Conectar à planilha do Google"): pede o e-mail Google da outra pessoa, abre o login, cria a
  planilha com os parâmetros do cofre que já existe, compartilha, grava os e-mails e sobe tudo o que
  já foi lançado (cifrado). A frase-mestra continua a mesma.
- A cada login, o e-mail da conta é conferido contra os autorizados; outra conta é desconectada.
- **Identificadores do Google** (ID do cliente, chave do Picker, número do projeto) são públicos e
  ficam como *variables* do repositório no GitHub (usadas no build) e em `.env.local` no PC.

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
   - "Tipo" (Só esta vez / Parcelado / Todo mês) e, em "Todo mês", "Valor fixo / muda todo mês"
     ficam no topo, antes do valor (o valor some quando muda todo mês);
3. **Despesas do mês**
   - lista por competência, com filtros por categoria e por pessoa;
   - selo "editado por …" e linha do tempo da despesa.
4. **Relatórios**
   - gasto por categoria no mês;
   - comparação entre meses;
   - quanto cada um pagou.
5. **Acertar contas:** resumo do mês, transferência e confirmação de fechamento.
6. **Categorias:** criar, editar, arquivar e reordenar, e definir a divisão padrão.
7. **Recorrentes e parcelamentos:** listar, editar (tela completa), pausar e encerrar; a partir de
   uma despesa gerada, o link "Editar a recorrente / o parcelamento" leva direto à edição.
8. **Atividade:** histórico geral em feed limpo, agrupado por dia.
   Exemplo: "Pessoa B alterou Mercado: R$ 120 → R$ 150".
9. **Configurações**
   - nomes;
   - segurança (PIN/biometria, bloquear agora, trocar frase);
   - exportar backup legível (CSV/XLSX gerado localmente);
   - importar do Tricount;
   - sobre.

10. **Boas-vindas** (aparelho sem cofre): "Criar nosso cofre" ou "Ver a demonstração".
11. **Criar o cofre:** frase-mestra → conferir 3 palavras → nomes, quem usa o celular e a parte
    nas despesas da casa → biometria (ou PIN).
12. **Bloqueio:** digital (ou PIN), com "Usar a frase-mestra" sempre disponível.

### Diretrizes de interface
- Português do Brasil, formato BRL (R$ 1.234,56) e datas dd/mm/aaaa.
- Mobile-first, alvos de toque ≥ 44 px, modo claro e escuro, visual limpo e moderno.
- Nada de spinners bloqueantes: a interface responde na hora e a sincronização acontece por trás.

---

## 8. Inteligência de sugestão (local)
- Aprende com o histórico, incluindo o importado: descrição normalizada →
  frequência de categoria, % e quem pagou.
- Só ensinam os lançamentos feitos à mão (e os importados). Parcelas e recorrentes, que entram
  sozinhas, não contam — senão um sofá em 10x viraria "a compra mais frequente".
- Busca aproximada (sem acento, sem caixa, tokens, prefixos), tolerando **um erro de digitação**
  em palavras de 4+ letras ("mercdo" acha "Mercado"); o acerto exato vem antes.
- Ranking por frequência e recência (meia-vida de 90 dias: o uso recente pesa mais).
- Descrição nova: a categoria é **prevista pelas palavras** já usadas ("Padaria do bairro" → a
  categoria de "Padaria"), só quando há confiança (≥ 60% dos votos). Nunca sobrescreve uma
  categoria escolhida à mão.
- Roda 100% no aparelho. Nenhuma API externa.

---

## 9. Importação do Tricount
- Feita **dentro do app** (Configurações → Importar). O arquivo é lido localmente e nunca é enviado
  a lugar nenhum.
- Antes de importar, mostrar uma prévia com mapeamento de colunas, de pessoas e de categorias.
- Reembolsos/acertos do Tricount viram fechamentos. Meses importados ficam fechados.
- O import alimenta a inteligência de sugestão.

### Como ficou implementado (Fase 4)
- **Formato lido:** o CSV que o Tricount exporta em português (colunas "Título", "Valor na moeda
  padrão (BRL)", "Tipo de transação", "Categoria", "Pago por <nome>", "Impactado para <nome>",
  "Data e hora" por extenso). As colunas são reconhecidas pelo cabeçalho, sem mapeamento manual.
  Linhas de total e rodapé são puladas. Grupos com mais de 2 pessoas são recusados.
- **Prévia:** quem é quem (sugerido pelo primeiro nome), categoria do app para cada categoria do
  Tricount (sugerida por nome e sinônimos comuns; o que não casar vai para "Outros"), total por
  mês, quais meses entram acertados e o saldo final do Tricount.
- **Cada despesa** vira uma despesa do app com origem "importada", com o % calculado pelas partes
  (2 casas). Se as duas pessoas pagaram a mesma despesa, ela vira duas (uma por quem pagou).
- **Acertos do Tricount (regra revista em nov/2026):** no Tricount, os acertos não caem no fim do
  mês. Cada **transferência que deixa o saldo (quase) zerado** (sobra menos de R$ 1) é um acerto.
  Tudo até o **último acerto** já foi resolvido; só o que veio depois fica em aberto. A ordem é a
  da data e, no mesmo dia, a do arquivo (o Tricount exporta do mais novo para o mais antigo).
  - Meses anteriores ao mês corrente em que tudo já foi acertado entram **fechados** (um acerto por
    mês, marcado como "trazido do Tricount", sem inventar transferência).
  - Nos meses que ficam abertos, as despesas anteriores ao último acerto entram marcadas como
    **"já acertada no Tricount"**: contam no total do mês e nos relatórios, mas **não no saldo**.
    O cartão do mês e a tela de acerto avisam quanto já foi acertado.
  - Os centavos de arredondamento que o último acerto deixou ficam de fora (a prévia mostra quanto).
  - As transferências do Tricount não viram despesas.
- **Saldo pendente:** só aparece se o Tricount tiver, depois do último acerto, algo que não é
  despesa (reembolsos ou pagamentos parciais). Entra como "Saldo pendente do Tricount" no mês
  corrente, para o saldo bater.
- **Sem duplicar:** os ids são calculados a partir do conteúdo de cada linha; importar o mesmo
  arquivo de novo não cria nada.
- **Importar de novo corrige:** se já houve uma importação, a prévia avisa e a nova importação
  **substitui** a anterior: volta as despesas importadas que foram apagadas, ajusta as que estão
  diferentes (inclusive a marca de acertada), tira as importadas que não estão no arquivo (como um
  "Saldo pendente" antigo), reabre meses que a importação anterior fechou sem dever e fecha os que
  faltam. No histórico, a correção aparece numa linha só. Não há botão separado para isso.
- No histórico de atividade, a importação aparece numa linha só.
- Só no cofre real (não na demonstração, que não é criptografada).

---

## 10. Ferramenta de recuperação
- Página HTML isolada (`recuperacao.html`) que funciona offline.
- Recebe os CSVs das abas `meta` e `eventos`, baixados do Drive, mais a frase-mestra.
- Gera um CSV/XLSX legível com todas as despesas.
- Tudo acontece no navegador. Nenhuma requisição de rede.
- Implementação (Fase 4): é **um único arquivo HTML** com todo o código dentro (dá para salvar no
  computador e usar mesmo se o site sair do ar). A CSP da página proíbe qualquer conexão
  (`connect-src 'none'`). Aceita os dois CSVs de uma vez e reconhece qual é qual pelo cabeçalho.
  Gera os mesmos CSVs do backup legível (despesas e acertos). Linhas que não abrem são contadas.

### Backup legível (Configurações → Dados)
- Dois CSVs gerados no aparelho: **despesas** (data, mês, descrição, categoria, valor, quem pagou,
  % e parte de cada um, tipo, situação, quem lançou/alterou, id) e **acertos** (mês, total, quem
  transferiu para quem, valor, data, quem acertou).
- Formato do Excel/Google Planilhas em português: separador `;`, vírgula decimal, datas
  dd/mm/aaaa, UTF-8 com BOM. (XLSX fica para depois, se fizer falta.)

---

## 11. Roadmap
- **v1:** tudo acima.
- **v2:**
  - **Projetos**: novos livros, cada um com aba própria, moeda própria (opcional) e saldo e
    fechamento independentes do mês;
  - **limites por categoria**.
- **Futuro (se fizer falta):** notificações push (exigiria um componente de servidor).
