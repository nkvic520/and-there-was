import { networkInterfaces } from 'node:os';
process.env.HOST = '0.0.0.0';
for (const [name, addresses] of Object.entries(networkInterfaces())) {
  for (const address of addresses ?? []) if (address.family === 'IPv4' && !address.internal) console.log(`LAN (${name}): http://${address.address}:${process.env.PORT ?? 3000}/`);
}
await import('../apps/server/dist/main.js');
