// Tipos mínimos das bibliotecas do Google carregadas em tempo de execução (sem dependências npm).
// Google Identity Services: https://developers.google.com/identity/oauth2/web/reference/js-reference
// Google Picker: https://developers.google.com/workspace/drive/picker/reference

interface RespostaTokenGoogle {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface ClienteTokenGoogle {
  requestAccessToken(opcoes?: { prompt?: string; login_hint?: string }): void;
}

interface OpcoesClienteTokenGoogle {
  client_id: string;
  scope: string;
  prompt?: string;
  login_hint?: string;
  callback: (resposta: RespostaTokenGoogle) => void;
  error_callback?: (erro: { type?: string; message?: string }) => void;
}

interface DocumentoPicker {
  id: string;
  name?: string;
  mimeType?: string;
}

interface RespostaPicker {
  action: string;
  docs?: DocumentoPicker[];
}

interface ConstrutorPicker {
  addView(visao: unknown): ConstrutorPicker;
  setOAuthToken(token: string): ConstrutorPicker;
  setDeveloperKey(chave: string): ConstrutorPicker;
  setAppId(id: string): ConstrutorPicker;
  setCallback(f: (r: RespostaPicker) => void): ConstrutorPicker;
  setLocale(l: string): ConstrutorPicker;
  setTitle(t: string): ConstrutorPicker;
  build(): { setVisible(v: boolean): void };
}

interface GooglePicker {
  PickerBuilder: new () => ConstrutorPicker;
  DocsView: new (viewId?: string) => { setMimeTypes(m: string): unknown; setMode(m: string): unknown };
  ViewId: { SPREADSHEETS: string };
  DocsViewMode: { LIST: string };
  Action: { PICKED: string; CANCEL: string };
}

interface Window {
  google?: {
    accounts?: { oauth2?: { initTokenClient(opcoes: OpcoesClienteTokenGoogle): ClienteTokenGoogle; revoke(token: string, feito?: () => void): void } };
    picker?: GooglePicker;
  };
  gapi?: { load(biblioteca: string, pronto: () => void): void };
}
