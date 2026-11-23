import { describe, expect, it, vi } from 'vitest';
import { ErroDeRede, ErroSemAcesso, ErroSemAutorizacao, ErroTemporario } from '../armazenamento/remoto.ts';
import type { MetaCofre } from '../aplicacao/cofre.ts';
import { chamarGoogle, type Buscar } from './api.ts';
import { AutenticacaoGoogle } from './auth.ts';
import { lerConfigGoogle } from './config.ts';
import { compartilharPlanilha, emailDaConta } from './drive.ts';
import { FORMATO, PlanilhaGoogle } from './planilha.ts';

interface Chamada {
  url: string;
  metodo: string;
  corpo: unknown;
  auth: string | null;
}

/** "Google" de mentira: registra as chamadas e devolve respostas programadas. */
function googleFalso(respostas: (Response | Error)[]) {
  const chamadas: Chamada[] = [];
  const buscar: Buscar = (url, init) => {
    const headers = new Headers(init?.headers);
    chamadas.push({
      url,
      metodo: init?.method ?? 'GET',
      corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: headers.get('Authorization'),
    });
    const r = respostas.shift() ?? new Response('{}', { status: 200 });
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  return { buscar, chamadas };
}

const ok = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });
const erro = (status: number, corpo: unknown = {}) => new Response(JSON.stringify(corpo), { status });
const token = () => 'token-de-teste';

describe('chamadas às APIs do Google', () => {
  it('manda o token só no cabeçalho e traduz os erros', async () => {
    const { buscar, chamadas } = googleFalso([ok({ a: 1 })]);
    expect(await chamarGoogle(buscar, token, 'https://x.test/a')).toEqual({ a: 1 });
    expect(chamadas[0]).toMatchObject({ auth: 'Bearer token-de-teste', metodo: 'GET' });
    expect(chamadas[0]?.url).not.toContain('token');

    const casos: [Response | Error, unknown][] = [
      [new TypeError('falhou'), ErroDeRede],
      [erro(401), ErroSemAutorizacao],
      [erro(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }), ErroTemporario],
      [erro(403), ErroSemAcesso],
      [erro(404), ErroSemAcesso],
      [erro(429), ErroTemporario],
      [erro(503), ErroTemporario],
    ];
    for (const [resposta, tipo] of casos) {
      const g = googleFalso([resposta]);
      await expect(chamarGoogle(g.buscar, token, 'https://x.test')).rejects.toBeInstanceOf(tipo as typeof Error);
    }
    const semJson = googleFalso([new Response('não é json', { status: 400 })]);
    await expect(chamarGoogle(semJson.buscar, token, 'https://x.test')).rejects.toThrow('Erro 400 do Google.');
    const comMensagem = googleFalso([erro(400, { error: { message: 'Pedido inválido' } })]);
    await expect(chamarGoogle(comMensagem.buscar, token, 'https://x.test')).rejects.toThrow('Pedido inválido');
  });

  it('sem login, nem chega a chamar o Google', async () => {
    const { buscar, chamadas } = googleFalso([]);
    const semToken = () => {
      throw new ErroSemAutorizacao();
    };
    await expect(chamarGoogle(buscar, semToken, 'https://x.test')).rejects.toBeInstanceOf(ErroSemAutorizacao);
    expect(chamadas).toHaveLength(0);
  });
});

describe('planilha', () => {
  it('cria com as abas "meta" e "eventos" e os cabeçalhos', async () => {
    const { buscar, chamadas } = googleFalso([ok({ spreadsheetId: 'PLAN1' }), ok({}), ok({})]);
    const p = await PlanilhaGoogle.criar(token, buscar);
    expect(p.id).toBe('PLAN1');
    expect(p.endereco).toBe('https://docs.google.com/spreadsheets/d/PLAN1');
    expect(chamadas[0]).toMatchObject({
      url: 'https://sheets.googleapis.com/v4/spreadsheets',
      metodo: 'POST',
      corpo: { sheets: [{ properties: { title: 'meta' } }, { properties: { title: 'eventos' } }] },
    });
    expect(chamadas[1]?.url).toContain('/values/meta!A%3AC:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS');
    expect(chamadas[1]?.corpo).toEqual({ values: [['chave', 'valor'], ['formato', FORMATO]] });
    expect(chamadas[2]?.corpo).toEqual({ values: [['id', 'versao', 'conteudo']] });
    await expect(PlanilhaGoogle.criar(token, googleFalso([ok({})]).buscar)).rejects.toThrow(/id da planilha/);
  });

  it('acrescenta eventos sem sobrescrever (RAW, inserindo linhas)', async () => {
    const { buscar, chamadas } = googleFalso([ok({})]);
    const p = new PlanilhaGoogle('P', token, buscar);
    await p.anexar([]);
    expect(chamadas).toHaveLength(0);
    await p.anexar([{ id: 'e1', versao: 1, conteudo: '+abc=' }]);
    expect(chamadas[0]?.url).toContain('/values/eventos!A%3AC:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS');
    expect(chamadas[0]?.corpo).toEqual({ values: [['e1', 1, '+abc=']] });
  });

  it('lê a partir da posição, pula linhas inválidas mas conta todas', async () => {
    const { buscar, chamadas } = googleFalso([
      ok({ values: [['e1', 1, 'AAA'], ['', 1, 'x'], ['e2', '1', 'BBB'], ['e3', 'x', 'C'], ['e4', 1]] }),
      ok({}),
    ]);
    const p = new PlanilhaGoogle('P', token, buscar);
    const r = await p.lerAPartirDe(10);
    expect(chamadas[0]?.url).toContain('/values/eventos!A12%3AC?valueRenderOption=UNFORMATTED_VALUE');
    expect(r.linhas).toEqual([
      { id: 'e1', versao: 1, conteudo: 'AAA' },
      { id: 'e2', versao: 1, conteudo: 'BBB' },
    ]);
    expect(r.proximaPosicao).toBe(15);
    expect(await p.lerAPartirDe(-3)).toEqual({ linhas: [], proximaPosicao: 0 });
  });

  it('lê os parâmetros do cofre: vale a última linha válida; exige o formato certo', async () => {
    const meta1: MetaCofre = { versao: 1, kdf: 'PBKDF2-SHA256', iteracoes: 600000, salt: 's1', dek: { iv: 'i', dados: 'd' }, criadoEm: 'x' };
    const meta2 = { ...meta1, salt: 's2' };
    const linhas = [['formato', FORMATO], ['cofre', JSON.stringify(meta1)], ['cofre', '{ruim'], ['cofre', JSON.stringify({ a: 1 })], ['cofre', JSON.stringify(meta2)], ['outra', 5]];
    const p = new PlanilhaGoogle('P', token, googleFalso([ok({ values: linhas })]).buscar);
    expect(await p.lerMetaCofre()).toEqual(meta2);
    const semFormato = new PlanilhaGoogle('P', token, googleFalso([ok({ values: [['cofre', JSON.stringify(meta1)]] })]).buscar);
    expect(await semFormato.lerMetaCofre()).toBeNull();
    const vazia = new PlanilhaGoogle('P', token, googleFalso([ok({})]).buscar);
    expect(await vazia.lerMetaCofre()).toBeNull();
    const g = googleFalso([ok({})]);
    await new PlanilhaGoogle('P', token, g.buscar).anexarMetaCofre(meta1);
    expect(g.chamadas[0]?.corpo).toEqual({ values: [['cofre', JSON.stringify(meta1)]] });
  });
});

describe('Drive', () => {
  it('descobre o e-mail da conta e compartilha a planilha como editora', async () => {
    const g = googleFalso([ok({ user: { emailAddress: 'Pessoa.A@Exemplo.com' } }), ok({})]);
    expect(await emailDaConta(token, g.buscar)).toBe('pessoa.a@exemplo.com');
    await compartilharPlanilha('P', 'pessoa.b@exemplo.com', token, g.buscar);
    expect(g.chamadas[1]?.url).toContain('/drive/v3/files/P/permissions?sendNotificationEmail=true');
    expect(g.chamadas[1]?.corpo).toEqual({ role: 'writer', type: 'user', emailAddress: 'pessoa.b@exemplo.com' });
    await expect(emailDaConta(token, googleFalso([ok({})]).buscar)).rejects.toThrow(/e-mail/);
  });
});

describe('configuração pública do Google', () => {
  it('só considera configurado quando os 3 valores têm o formato certo', () => {
    const bom = { VITE_GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com', VITE_GOOGLE_API_KEY: 'chave', VITE_GOOGLE_APP_ID: '123456' };
    expect(lerConfigGoogle(bom)).toEqual({ clientId: bom.VITE_GOOGLE_CLIENT_ID, apiKey: 'chave', appId: '123456' });
    expect(lerConfigGoogle({ ...bom, VITE_GOOGLE_CLIENT_ID: 'x' })).toBeNull();
    expect(lerConfigGoogle({ ...bom, VITE_GOOGLE_API_KEY: '' })).toBeNull();
    expect(lerConfigGoogle({ ...bom, VITE_GOOGLE_APP_ID: 'abc' })).toBeNull();
    expect(lerConfigGoogle({})).toBeNull();
  });
});

describe('login (token só em memória)', () => {
  const config = { clientId: 'c.apps.googleusercontent.com', apiKey: 'k', appId: '1' };

  function googleIdentityFalso() {
    let opcoes: OpcoesClienteTokenGoogle | undefined;
    const pedidos: unknown[] = [];
    const revoke = vi.fn();
    const g = {
      accounts: {
        oauth2: {
          initTokenClient: (o: OpcoesClienteTokenGoogle) => {
            opcoes = o;
            return { requestAccessToken: (p?: unknown) => { pedidos.push(p); } };
          },
          revoke,
        },
      },
    };
    return { g, pedidos, revoke, responder: (r: RespostaTokenGoogle) => opcoes?.callback(r), falhar: (e: { type?: string; message?: string }) => opcoes?.error_callback?.(e), opcoes: () => opcoes };
  }

  it('entra, guarda o token em memória, vence com margem e sai', async () => {
    let agora = 1_000_000;
    const falso = googleIdentityFalso();
    const auth = new AutenticacaoGoogle(config, () => Promise.resolve(), () => falso.g, () => agora);
    expect(auth.conectado).toBe(false);
    expect(() => auth.obterToken()).toThrow(ErroSemAutorizacao);
    const promessa = auth.entrar('pessoa.a@exemplo.com');
    await Promise.resolve();
    await Promise.resolve();
    expect(falso.opcoes()?.scope).toBe('https://www.googleapis.com/auth/drive.file');
    expect(falso.pedidos[0]).toEqual({ prompt: '', login_hint: 'pessoa.a@exemplo.com' });
    falso.responder({ access_token: 'TK', expires_in: '3600' });
    expect(await promessa).toBe('TK');
    expect(auth.obterToken()).toBe('TK');
    expect(auth.conectado).toBe(true);
    agora += 3600_000 - 30_000; // dentro da margem de 1 minuto: considera vencido
    expect(() => auth.obterToken()).toThrow(ErroSemAutorizacao);
    auth.sair();
    expect(falso.revoke).toHaveBeenCalledWith('TK');
    auth.sair();
  });

  it('janela fechada, recusa e erro viram "sem autorização"', async () => {
    const falso = googleIdentityFalso();
    const auth = new AutenticacaoGoogle(config, () => Promise.resolve(), () => falso.g);
    await auth.preparar();
    await auth.preparar();
    const p1 = auth.entrar();
    falso.falhar({ type: 'popup_closed' });
    await expect(p1).rejects.toThrow('A janela do Google foi fechada.');
    const p2 = auth.entrar();
    falso.responder({ error: 'access_denied' });
    await expect(p2).rejects.toThrow('O Google não autorizou o acesso.');
    const p3 = auth.entrar();
    falso.falhar({});
    await expect(p3).rejects.toThrow('O login não foi concluído.');
    const p4 = auth.entrar();
    const p5 = auth.entrar();
    await expect(p4).rejects.toThrow('Outro pedido de login foi aberto.');
    falso.responder({ access_token: 'T2' });
    expect(await p5).toBe('T2');
  });

  it('sem a biblioteca do Google, avisa', async () => {
    const auth = new AutenticacaoGoogle(config, () => Promise.resolve(), () => undefined);
    await expect(auth.entrar()).rejects.toThrow('Não foi possível carregar o login do Google.');
  });
});
