// The production client always addresses api.openai.com. Exercise the complete
// HTTP request/response path locally without adding a deployment URL override.
const send = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== 'https://api.openai.com') return send(input, options);
  if (new Headers(options?.headers).get('authorization') !== 'Bearer e2e-openai-only') throw Error('Unexpected test credential');
  return send('http://127.0.0.1:' + Number(process.env.OPENAI_LOOPBACK_PORT) + url.pathname, options);
};
