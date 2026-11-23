// Verificador de segredos e dados pessoais.
//
// Roda sozinho antes de cada commit (gancho em .githooks/) e de novo no GitHub Actions.
// Se achar algo suspeito, bloqueia e diz o arquivo e a linha — mas NUNCA mostra o conteúdo
// encontrado, para o próprio aviso não vazar o segredo.
//
// Modos:
//   node scripts/verificar-segredos.mjs --todos          → todos os arquivos do repositório
//   node scripts/verificar-segredos.mjs --preparados     → só o que está indo no commit
//   node scripts/verificar-segredos.mjs --mensagem ARQ   → a mensagem do commit
//
// Termos proibidos pessoais (opcional): crie privado/termos-proibidos.txt, um termo por linha
// (nomes reais, e-mails, percentuais...). A pasta privado/ nunca é versionada.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Arquivos que nunca podem entrar no repositório, pelo nome. */
const NOMES_PROIBIDOS = [
  { regra: /(^|\/)privado\//i, motivo: 'arquivo da pasta privado/' },
  { regra: /\.(csv|tsv|xlsx|xls|ods)$/i, motivo: 'planilha ou exportação de dados' },
  { regra: /(^|\/)\.env(\.|$)/i, motivo: 'arquivo de variáveis de ambiente (.env)' },
  { regra: /\.(key|pem|p12|pfx|jks|kdbx)$/i, motivo: 'arquivo de chave ou cofre de senhas' },
  {
    regra: /(^|\/)(client_secret|credentials|service-account)[^/]*\.json$/i,
    motivo: 'arquivo de credenciais do Google',
  },
  { regra: /\.(bak|backup)$/i, motivo: 'arquivo de backup' },
];

/** Padrões de segredo dentro do conteúdo. */
const PADROES_SEGREDO = [
  { regra: /AIza[0-9A-Za-z_-]{35}/, motivo: 'chave de API do Google' },
  { regra: /ya29\.[0-9A-Za-z_-]{20,}/, motivo: 'token de acesso do Google' },
  { regra: /1\/\/0[0-9A-Za-z_-]{20,}/, motivo: 'token de renovação do Google' },
  { regra: /GOCSPX-[0-9A-Za-z_-]{10,}/, motivo: 'segredo de cliente OAuth do Google' },
  { regra: /gh[pousr]_[0-9A-Za-z]{30,}/, motivo: 'token do GitHub' },
  { regra: /github_pat_[0-9A-Za-z_]{30,}/, motivo: 'token do GitHub' },
  { regra: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, motivo: 'chave privada' },
  { regra: /AKIA[0-9A-Z]{16}/, motivo: 'chave da AWS' },
  { regra: /xox[abprs]-[0-9A-Za-z-]{10,}/, motivo: 'token do Slack' },
];

const REGEX_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** E-mails que podem aparecer: anônimos, de exemplo ou de ferramentas. */
const EMAILS_PERMITIDOS = [
  /@users\.noreply\.github\.com$/i,
  /^noreply@anthropic\.com$/i,
  /^git@github\.com$/i,
  /@(example|exemplo)\.(com|org|net|com\.br)$/i,
  /\.(test|example|invalid|localhost)$/i,
];

/**
 * Arquivos gerados por ferramentas que trazem contatos públicos de autores de pacotes.
 * Neles só a busca por e-mail é pulada; segredos e termos proibidos continuam sendo verificados.
 */
const SEM_VERIFICACAO_DE_EMAIL = new Set(['package-lock.json']);

/** Extensões tratadas como binárias: só o nome é verificado, não o conteúdo. */
const EXTENSOES_BINARIAS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip',
]);

/** Tira acentos e deixa minúsculo, para "José" e "jose" contarem como o mesmo termo. */
export function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Transforma a lista de termos proibidos em buscas por palavra inteira. */
export function prepararTermos(linhas) {
  return linhas
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#'))
    .map((termo) => new RegExp(`(^|[^a-z0-9])${escaparRegex(normalizar(termo))}($|[^a-z0-9])`));
}

export function emailPermitido(email) {
  return EMAILS_PERMITIDOS.some((regra) => regra.test(email));
}

/** Verifica o nome do arquivo. Devolve o motivo do bloqueio, ou null. */
export function analisarNome(caminho) {
  const normalizado = caminho.replaceAll('\\', '/');
  const achado = NOMES_PROIBIDOS.find(({ regra }) => regra.test(normalizado));
  return achado ? achado.motivo : null;
}

/** Verifica o texto. Devolve a lista de problemas { linha, motivo } — sem o conteúdo achado. */
export function analisarTexto(texto, termos = [], { verificarEmails = true } = {}) {
  const problemas = [];
  texto.split(/\r?\n/).forEach((conteudo, indice) => {
    const linha = indice + 1;
    for (const { regra, motivo } of PADROES_SEGREDO) {
      if (regra.test(conteudo)) problemas.push({ linha, motivo });
    }
    for (const email of verificarEmails ? (conteudo.match(REGEX_EMAIL) ?? []) : []) {
      if (!emailPermitido(email)) problemas.push({ linha, motivo: 'endereço de e-mail' });
    }
    const normalizado = normalizar(conteudo);
    termos.forEach((termo, n) => {
      if (termo.test(normalizado)) {
        problemas.push({ linha, motivo: `termo proibido nº ${n + 1} de privado/termos-proibidos.txt` });
      }
    });
  });
  return problemas;
}

// ---------------------------------------------------------------------------------------------
// Execução pela linha de comando
// ---------------------------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
}

function listar(args) {
  return git(args).toString('utf8').split('\0').filter(Boolean);
}

function carregarTermos() {
  const arquivo = 'privado/termos-proibidos.txt';
  return existsSync(arquivo) ? prepararTermos(readFileSync(arquivo, 'utf8').split(/\r?\n/)) : [];
}

function verificarArquivos(caminhos, lerConteudo, termos) {
  const problemas = [];
  for (const caminho of caminhos) {
    const motivoNome = analisarNome(caminho);
    if (motivoNome) problemas.push({ caminho, linha: 0, motivo: motivoNome });
    if (EXTENSOES_BINARIAS.has(extname(caminho).toLowerCase())) continue;
    const verificarEmails = !SEM_VERIFICACAO_DE_EMAIL.has(caminho);
    for (const p of analisarTexto(lerConteudo(caminho), termos, { verificarEmails })) {
      problemas.push({ caminho, ...p });
    }
  }
  return problemas;
}

function principal(argumentos) {
  const termos = carregarTermos();
  const modo = argumentos[0];
  let problemas;

  if (modo === '--todos') {
    const caminhos = [
      ...listar(['ls-files', '-z']),
      ...listar(['ls-files', '-z', '--others', '--exclude-standard']),
    ].filter((c) => existsSync(c));
    problemas = verificarArquivos(caminhos, (c) => readFileSync(c, 'utf8'), termos);
  } else if (modo === '--preparados') {
    const caminhos = listar(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
    problemas = verificarArquivos(caminhos, (c) => git(['show', `:${c}`]).toString('utf8'), termos);
  } else if (modo === '--mensagem' && argumentos[1]) {
    const texto = readFileSync(argumentos[1], 'utf8')
      .split(/\r?\n/)
      .filter((l) => !l.startsWith('#'))
      .join('\n');
    problemas = analisarTexto(texto, termos).map((p) => ({ caminho: 'mensagem do commit', ...p }));
  } else {
    console.error('Uso: verificar-segredos.mjs --todos | --preparados | --mensagem ARQUIVO');
    return 2;
  }

  if (problemas.length === 0) {
    console.log('✔ Verificador de segredos: nada suspeito encontrado.');
    return 0;
  }
  console.error('✖ Verificador de segredos BLOQUEOU a operação:');
  for (const { caminho, linha, motivo } of problemas) {
    console.error(`  - ${caminho}${linha ? `:${linha}` : ''} → ${motivo}`);
  }
  console.error('Remova o conteúdo indicado (o conteúdo não é exibido de propósito).');
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = principal(process.argv.slice(2));
}
