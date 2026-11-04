import { Capacitor } from '@capacitor/core';

const configured = import.meta.env.VITE_SERVER_URL?.trim();
const defaultServer = 'https://sistema-igreja-production.up.railway.app';
export const SERVER_URL = (configured || (Capacitor.isNativePlatform() ? defaultServer : window.location.origin)).replace(/\/$/, '');

const server = new URL(SERVER_URL);
if (server.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(server.hostname)) {
  throw new Error('Configure o servidor do leitor com uma URL HTTPS.');
}
