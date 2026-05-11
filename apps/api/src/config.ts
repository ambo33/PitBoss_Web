const defaultClientUrl = 'http://localhost:5173';

export function getClientUrl(): string {
  return (process.env.CLIENT_URL ?? process.env.RENDER_EXTERNAL_URL ?? defaultClientUrl).replace(/\/+$/, '');
}
