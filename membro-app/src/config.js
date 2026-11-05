import { Capacitor } from '@capacitor/core';

const configured = import.meta.env.VITE_SERVER_URL?.trim();
const defaultServer = 'https://sistema-igreja-production.up.railway.app';
const server = new URL(configured || (Capacitor.isNativePlatform() ? defaultServer : window.location.origin));
if (server.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(server.hostname)) {
  throw new Error('Configure o servidor da credencial com um endereço HTTPS.');
}
export const SERVER_URL = server.origin;
