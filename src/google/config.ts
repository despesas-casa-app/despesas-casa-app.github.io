/**
 * Identificadores PÚBLICOS do app no Google (especificação 5.5). Não são segredos: vão dentro do
 * site publicado e só funcionam no endereço do app (restrições configuradas no Google Cloud).
 * No GitHub ficam como "variables" do repositório; no PC, em .env.local (nunca versionado).
 */
export interface ConfigGoogle {
  readonly clientId: string;
  readonly apiKey: string;
  /** Número do projeto no Google Cloud (usado pelo seletor de arquivos). */
  readonly appId: string;
}

export function lerConfigGoogle(env: Record<string, string | undefined> = import.meta.env): ConfigGoogle | null {
  const clientId = env['VITE_GOOGLE_CLIENT_ID']?.trim() ?? '';
  const apiKey = env['VITE_GOOGLE_API_KEY']?.trim() ?? '';
  const appId = env['VITE_GOOGLE_APP_ID']?.trim() ?? '';
  if (!clientId.endsWith('.apps.googleusercontent.com') || apiKey === '' || !/^\d+$/.test(appId)) return null;
  return { clientId, apiKey, appId };
}

/** Escopo mínimo: só os arquivos que o app criou ou que a pessoa escolheu no seletor. */
export const ESCOPO_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';

export const URL_SCRIPT_LOGIN = 'https://accounts.google.com/gsi/client';
export const URL_SCRIPT_PICKER = 'https://apis.google.com/js/api.js';
