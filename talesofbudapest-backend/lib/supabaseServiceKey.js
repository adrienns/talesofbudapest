import { createHmac } from 'node:crypto';

const decodePayload = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const signJwt = (payload, secret) => {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const isValidServiceRoleKey = (token) => {
  const payload = decodePayload(token);
  return payload?.iss === 'supabase' && payload?.role === 'service_role';
};

export const resolveSupabaseServiceRoleKey = ({
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  jwtSecret = process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET,
} = {}) => {
  if (serviceRoleKey && isValidServiceRoleKey(serviceRoleKey)) {
    return serviceRoleKey;
  }

  if (!jwtSecret || !anonKey) {
    throw new Error(
      'Supabase service role key is missing or invalid. Set SUPABASE_JWT_SECRET and run: node infra/scripts/fix-service-role-key.mjs',
    );
  }

  const anonPayload = decodePayload(anonKey);
  if (!anonPayload) {
    throw new Error('SUPABASE_ANON_KEY is malformed. Cannot derive service role key.');
  }

  // Must match SERVICE_ROLE_KEY in infra/supabase-upstream/docker/.env (Kong apikey whitelist).
  return signJwt(
    {
      role: 'service_role',
      iss: 'supabase',
      iat: anonPayload.iat,
      exp: anonPayload.exp,
    },
    jwtSecret,
  );
};
