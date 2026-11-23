import { describe, expect, it } from 'vitest';
import {
  analisarNome,
  analisarTexto,
  emailPermitido,
  normalizar,
  prepararTermos,
} from './verificar-segredos.mjs';

// Os segredos de teste são montados em pedaços para que este próprio arquivo não seja barrado.
const junta = (...partes) => partes.join('');

describe('analisarNome', () => {
  it('bloqueia planilhas, chaves, .env e a pasta privado/', () => {
    expect(analisarNome('dados/tricount.csv')).not.toBeNull();
    expect(analisarNome('relatorio.XLSX')).not.toBeNull();
    expect(analisarNome('.env')).not.toBeNull();
    expect(analisarNome('.env.local')).not.toBeNull();
    expect(analisarNome('chave.key')).not.toBeNull();
    expect(analisarNome('privado/frase.txt')).not.toBeNull();
    expect(analisarNome('privado\\frase.txt')).not.toBeNull();
    expect(analisarNome('client_secret_123.json')).not.toBeNull();
  });

  it('libera arquivos comuns do projeto', () => {
    expect(analisarNome('src/dominio/dinheiro.ts')).toBeNull();
    expect(analisarNome('docs/ESPECIFICACAO.md')).toBeNull();
    expect(analisarNome('package.json')).toBeNull();
    expect(analisarNome('.env-exemplo.md')).toBeNull();
  });
});

describe('analisarTexto', () => {
  it('acha chaves e tokens conhecidos', () => {
    const casos = [
      junta('AI', 'za', 'A'.repeat(35)),
      junta('ya', '29.', 'b'.repeat(30)),
      junta('GOC', 'SPX-', 'c'.repeat(20)),
      junta('gh', 'p_', 'd'.repeat(36)),
      junta('-----BEGIN ', 'PRIVATE KEY-----'),
    ];
    for (const segredo of casos) {
      expect(analisarTexto(`const x = "${segredo}";`)).toHaveLength(1);
    }
  });

  it('informa a linha, mas nunca o conteúdo', () => {
    const problemas = analisarTexto(`linha 1\nlinha 2 ${junta('AI', 'za', 'Z'.repeat(35))}`);
    expect(problemas).toEqual([{ linha: 2, motivo: 'chave de API do Google' }]);
  });

  it('bloqueia e-mails reais e libera os anônimos e de exemplo', () => {
    expect(analisarTexto(junta('contato: fulano', '@', 'gmail.com'))).toHaveLength(1);
    expect(analisarTexto('Co-Authored-By: Claude <noreply@anthropic.com>')).toHaveLength(0);
    expect(analisarTexto('autor 123+alguem@users.noreply.github.com')).toHaveLength(0);
    expect(analisarTexto('pessoa.a@exemplo.com')).toHaveLength(0);
  });

  it('não confunde pacotes e versões com e-mails', () => {
    expect(analisarTexto('npm i react@19.3.1 @types/react vite@8.3.8')).toHaveLength(0);
  });

  it('acha termos proibidos sem acento e sem diferenciar maiúsculas', () => {
    const termos = prepararTermos(['# comentário', '', 'Zuleica', '58,35']);
    expect(analisarTexto('Pagou: ZULÉICA', termos)).toEqual([
      { linha: 1, motivo: 'termo proibido nº 1 de privado/termos-proibidos.txt' },
    ]);
    expect(analisarTexto('divisão de 58,35%', termos)).toHaveLength(1);
  });

  it('só acha o termo como palavra inteira', () => {
    const termos = prepararTermos(['Ana']);
    expect(analisarTexto('banana e análise', termos)).toHaveLength(0);
    expect(analisarTexto('Ana pagou', termos)).toHaveLength(1);
  });
});

describe('auxiliares', () => {
  it('normalizar tira acentos e caixa', () => {
    expect(normalizar('Ação JOSÉ')).toBe('acao jose');
  });

  it('emailPermitido reconhece domínios de teste', () => {
    expect(emailPermitido('a@b.test')).toBe(true);
    expect(emailPermitido(junta('a', '@', 'empresa.com.br'))).toBe(false);
  });

  it('pode pular só a busca de e-mail, mantendo a de segredos', () => {
    const texto = `${junta('autor', '@', 'pacote.dev')}\n${junta('AI', 'za', 'Q'.repeat(35))}`;
    expect(analisarTexto(texto, [], { verificarEmails: false })).toEqual([
      { linha: 2, motivo: 'chave de API do Google' },
    ]);
  });
});
