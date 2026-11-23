/**
 * Armazenamento REMOTO: o log de eventos compartilhado entre os dois celulares.
 * Na Fase 3 a implementação é a planilha do Google; aqui fica a interface e a versão em
 * memória (para testes e para o modo demonstração).
 *
 * É só de acréscimo (append-only): nunca apaga nem sobrescreve uma linha.
 */
export interface LinhaRemota {
  /** Id do evento (texto puro na planilha). */
  readonly id: string;
  /** Versão do esquema (texto puro na planilha). */
  readonly versao: number;
  /** Conteúdo do evento. Na Fase 2+ vai criptografado. */
  readonly conteudo: string;
}

export interface LeituraRemota {
  readonly linhas: readonly LinhaRemota[];
  /** Posição a usar no próximo "lerAPartirDe" (pull incremental). */
  readonly proximaPosicao: number;
}

export interface RepositorioRemoto {
  /** Acrescenta linhas no fim do log. */
  anexar(linhas: readonly LinhaRemota[]): Promise<void>;
  /** Lê as linhas a partir de uma posição (0 = início). */
  lerAPartirDe(posicao: number): Promise<LeituraRemota>;
}

/** Implementação em memória: o "Google Sheets de mentira". */
export class RemotoEmMemoria implements RepositorioRemoto {
  private readonly linhas: LinhaRemota[] = [];

  anexar(linhas: readonly LinhaRemota[]): Promise<void> {
    this.linhas.push(...linhas.map((l) => ({ ...l })));
    return Promise.resolve();
  }

  lerAPartirDe(posicao: number): Promise<LeituraRemota> {
    const inicio = Math.max(0, Math.trunc(posicao));
    return Promise.resolve({ linhas: this.linhas.slice(inicio), proximaPosicao: this.linhas.length });
  }

  get tamanho(): number {
    return this.linhas.length;
  }
}

// ---------------------------------------------------------------------------------------------
// Erros que um repositório remoto pode dar (a sincronização reage a cada um de um jeito)
// ---------------------------------------------------------------------------------------------

/** Sem login válido (token ausente ou vencido): pede "Toque para sincronizar". */
export class ErroSemAutorizacao extends Error {
  constructor(mensagem = 'É preciso entrar com o Google de novo.') {
    super(mensagem);
    this.name = 'ErroSemAutorizacao';
  }
}

/** A conta não tem acesso à planilha (não foi compartilhada, ou foi removida). */
export class ErroSemAcesso extends Error {
  constructor(mensagem = 'Esta conta não tem acesso à planilha.') {
    super(mensagem);
    this.name = 'ErroSemAcesso';
  }
}

/** Sem internet (ou o Google não respondeu). */
export class ErroDeRede extends Error {
  constructor(mensagem = 'Sem conexão.') {
    super(mensagem);
    this.name = 'ErroDeRede';
  }
}

/** Limite de uso da API atingido (quota) ou falha temporária do Google: tentar mais tarde. */
export class ErroTemporario extends Error {
  constructor(mensagem = 'O Google pediu para tentar mais tarde.') {
    super(mensagem);
    this.name = 'ErroTemporario';
  }
}
