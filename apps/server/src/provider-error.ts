export type ProviderFailure = 'provider_quota' | 'provider_access' | 'provider_refusal';
export class ProviderError extends Error {
  constructor(readonly reason: ProviderFailure, message: string) { super(message); }
}

export function openAIError(status: number, raw: string, key: string): Error {
  let code = '', detail = raw;
  try {
    const error = JSON.parse(raw).error;
    code = String(error?.code ?? error?.type ?? '');
    detail = String(error?.message ?? raw);
  } catch { /* Non-JSON gateway responses are also archived. */ }
  const message = ('OpenAI HTTP ' + status + ' ' + code + ' ' + detail).replaceAll(key, '[REDACTED]').slice(0, 500);
  if (['insufficient_quota','credit_balance_exhausted','billing_hard_limit_reached','billing_not_active'].includes(code)) return new ProviderError('provider_quota', message);
  if (status === 401 || status === 403 || code === 'model_not_found') return new ProviderError('provider_access', message);
  if (['content_policy_violation','moderation_blocked'].includes(code)) return new ProviderError('provider_refusal', message);
  return new Error(message);
}
