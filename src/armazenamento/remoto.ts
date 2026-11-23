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
