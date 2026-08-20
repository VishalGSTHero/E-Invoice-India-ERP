export function uniqueDocNo(prefix = 'ERP'): string {
  // NIC: ^([a-zA-Z1-9]{1}[a-zA-Z0-9/-]{0,15})$  — no underscore, max 16
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, '') || 'ERP';
  const ts = Date.now().toString().slice(-7);
  const rnd = Math.floor(Math.random() * 90 + 10);
  return `${cleanPrefix}${ts}${rnd}`.slice(0, 16);
}

export function todayDocDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function buildBasicAuth(basicAuthHeader: string, clientId: string, clientSecret: string): string {
  if (basicAuthHeader) return basicAuthHeader;
  if (!clientSecret) {
    throw new Error(
      'Set EINV_BASIC_AUTH or EINV_CLIENT_SECRET (and optionally EINV_CLIENT_ID) for OAuth Basic auth'
    );
  }
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

export function extractAccessToken(body: Record<string, any>): string | undefined {
  return (
    body.access_token ||
    body.Data?.AuthToken ||
    body.data?.access_token ||
    body.authToken
  );
}

export function isGenerateSuccess(body: Record<string, any>): boolean {
  const status =
    body.status ||
    body.Status ||
    body.status_cd ||
    body.StatusCd ||
    body.isRequestSuccess;

  const irn =
    body.Irn ||
    body.irn ||
    body.Data?.Irn ||
    body.data?.Irn ||
    body.data?.irn;

  return (
    status === 1 ||
    status === '1' ||
    status === 'SUCCESS' ||
    status === 'Success' ||
    Boolean(irn) ||
    body.success === true
  );
}

export function extractIrn(body: Record<string, any>): string | undefined {
  return body.Irn || body.irn || body.Data?.Irn || body.data?.Irn || body.data?.irn;
}
