export async function checkRateLimit(ip, env) {
  const MAX_REQUESTS = parseInt(env.RATE_LIMIT_MAX || '100');
  const now = Math.floor(Date.now() / 1000);
  const dayStart = Math.floor(now / 86400) * 86400;

  const key = `rate_limit:${ip}:${dayStart}`;

  const record = await env.RATE_LIMIT.get(key, 'json');
  const count = record?.count || 0;

  if (count >= MAX_REQUESTS) {
    const retryAfter = dayStart + 86400 - now;
    return { allowed: false, retryAfter };
  }

  await env.RATE_LIMIT.put(key, JSON.stringify({ count: count + 1 }), {
    expirationTtl: 86400,
  });

  return { allowed: true };
}
