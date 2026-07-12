export const PAGE_SIZE = 1000;

export const requireSupabaseEnv = () => {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return { baseUrl, serviceKey };
};

const buildPrefer = ({ method, prefer, upsert, returnRepresentation = true }) => {
  if (prefer) {
    return prefer;
  }
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }
  if (upsert) {
    return returnRepresentation
      ? 'resolution=merge-duplicates,return=representation'
      : 'resolution=merge-duplicates,return=minimal';
  }
  return returnRepresentation ? 'return=representation' : 'return=minimal';
};

const parseRestResponse = async (response, table, returnRepresentation) => {
  if (!response.ok) {
    throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204 || !returnRepresentation) {
    return [];
  }
  const text = await response.text();
  return text ? JSON.parse(text) : [];
};

export const createRestClient = (baseUrl, serviceKey) => {
  const rest = async (
    table,
    { method = 'GET', body, params = {}, prefer, upsert = false, returnRepresentation = true } = {},
  ) => {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };
    const resolvedPrefer = buildPrefer({ method, prefer, upsert, returnRepresentation });
    if (resolvedPrefer) {
      headers.Prefer = resolvedPrefer;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return parseRestResponse(response, table, returnRepresentation);
  };

  const restAll = async (table, params = {}) => {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await rest(table, {
        params: {
          ...params,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        },
      });
      rows.push(...page);
      if (page.length < PAGE_SIZE) {
        return rows;
      }
    }
  };

  /** Positional signature used by legacy loaders (load-restricted-kg, load-mek-kg-supabase). */
  const restLegacy = async (table, method = 'GET', body, params = {}, representation = true) =>
    rest(table, {
      method,
      body,
      params,
      upsert: method === 'POST',
      returnRepresentation: representation,
    });

  return { rest, restAll, restLegacy };
};
