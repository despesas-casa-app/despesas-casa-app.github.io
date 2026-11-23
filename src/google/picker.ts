import { URL_SCRIPT_PICKER, type ConfigGoogle } from './config.ts';
import { carregarScript } from './scripts.ts';

export interface PlanilhaEscolhida {
  readonly id: string;
  readonly nome: string;
}

/**
 * Abre o seletor de arquivos do Google (Picker) para a pessoa escolher a planilha que foi
 * compartilhada com ela (especificação 5.5). Com o escopo drive.file, é essa escolha que dá ao
 * app acesso à planilha — e só a ela.
 */
export async function escolherPlanilha(config: ConfigGoogle, token: string): Promise<PlanilhaEscolhida | null> {
  await carregarScript(URL_SCRIPT_PICKER);
  const gapi = window.gapi;
  if (!gapi) throw new Error('Não foi possível carregar o seletor de arquivos do Google.');
  await new Promise<void>((ok) => {
    gapi.load('picker', ok);
  });
  const p = window.google?.picker;
  if (!p) throw new Error('Não foi possível carregar o seletor de arquivos do Google.');
  return new Promise((resolver) => {
    const visao = new p.DocsView(p.ViewId.SPREADSHEETS);
    visao.setMode(p.DocsViewMode.LIST);
    new p.PickerBuilder()
      .addView(visao)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setLocale('pt-BR')
      .setTitle('Escolha a planilha "Viver Gasta"')
      .setCallback((r) => {
        if (r.action === p.Action.PICKED) {
          const doc = r.docs?.[0];
          resolver(doc ? { id: doc.id, nome: doc.name ?? '' } : null);
        } else if (r.action === p.Action.CANCEL) {
          resolver(null);
        }
      })
      .build()
      .setVisible(true);
  });
}
