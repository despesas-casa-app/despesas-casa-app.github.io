import { dataLocal, nomeDaCompetencia } from '../dominio/competencia.ts';
import { nomeDoArquivo } from '../dominio/exportacao.ts';
import { baixarArquivo } from '../interface/baixar.ts';
import { ErroDeRecuperacao, lerCsv, recuperar, tipoDoArquivo, type ResultadoRecuperacao } from './recuperar.ts';
import './pagina.css';

function elemento(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento ${id} não encontrado`);
  return e;
}

const entrada = elemento('arquivos') as HTMLInputElement;
const situacao = elemento('situacao-arquivos');
const campoFrase = elemento('frase') as HTMLTextAreaElement;
const botao = elemento('recuperar') as HTMLButtonElement;
const mensagem = elemento('mensagem');
const resultado = elemento('resultado');
const resumo = elemento('resumo');

const arquivos: { meta: string | null; eventos: string | null } = { meta: null, eventos: null };
let ultimo: ResultadoRecuperacao | null = null;

function atualizar(): void {
  botao.disabled = !arquivos.meta || !arquivos.eventos || campoFrase.value.trim() === '';
}

function item(texto: string, ok: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.textContent = `${ok ? '✓' : '✗'} ${texto}`;
  li.className = ok ? 'ok' : 'erro';
  return li;
}

entrada.addEventListener('change', () => {
  void (async () => {
    situacao.replaceChildren();
    for (const arquivo of Array.from(entrada.files ?? [])) {
      const texto = await arquivo.text();
      const tipo = tipoDoArquivo(lerCsv(texto));
      if (tipo === 'desconhecido') {
        situacao.append(item(`${arquivo.name}: não parece uma aba da planilha do Viver Gasta`, false));
        continue;
      }
      arquivos[tipo] = texto;
      situacao.append(item(`${arquivo.name}: aba "${tipo}"`, true));
    }
    if (!arquivos.meta) situacao.append(item('Falta o arquivo da aba "meta"', false));
    if (!arquivos.eventos) situacao.append(item('Falta o arquivo da aba "eventos"', false));
    atualizar();
  })();
});

campoFrase.addEventListener('input', atualizar);

botao.addEventListener('click', () => {
  if (!arquivos.meta || !arquivos.eventos) return;
  const { meta, eventos } = arquivos;
  botao.disabled = true;
  mensagem.textContent = 'Abrindo os dados… (leva alguns segundos)';
  mensagem.className = 'mensagem';
  resultado.hidden = true;
  void recuperar(meta, eventos, campoFrase.value)
    .then((r) => {
      ultimo = r;
      campoFrase.value = ''; // a frase não fica na tela
      const vivas = r.estado.despesas.filter((d) => !d.excluida);
      const meses = [...new Set(vivas.map((d) => d.competencia))].sort();
      const periodo = meses.length ? ` de ${nomeDaCompetencia(meses[0] ?? '')} a ${nomeDaCompetencia(meses.at(-1) ?? '')}` : '';
      resumo.textContent =
        `${String(vivas.length)} despesas${periodo} e ${String(r.estado.fechamentos.length)} acertos recuperados.` +
        (r.ilegiveis > 0 ? ` Atenção: ${String(r.ilegiveis)} linha(s) da planilha não abriram e ficaram de fora.` : '');
      mensagem.textContent = '';
      resultado.hidden = false;
    })
    .catch((e: unknown) => {
      mensagem.textContent = e instanceof ErroDeRecuperacao ? e.message : 'Não foi possível recuperar. Confira os arquivos e a frase.';
      mensagem.className = 'mensagem erro';
    })
    .finally(atualizar);
});

elemento('baixar-despesas').addEventListener('click', () => {
  if (ultimo) baixarArquivo(nomeDoArquivo('despesas', dataLocal(new Date())), ultimo.despesasCsv);
});

elemento('baixar-acertos').addEventListener('click', () => {
  if (ultimo) baixarArquivo(nomeDoArquivo('acertos', dataLocal(new Date())), ultimo.acertosCsv);
});
