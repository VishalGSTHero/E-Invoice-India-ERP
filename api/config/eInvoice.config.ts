function required(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const eInvoiceConfig = {
  baseUrl: required('EINV_BASE_URL', 'https://dev.gsthero.com'),
  gstin: required('EINV_GSTIN', '05AALFP1139Q003'),
  connectorAuthToken: required(
    'EINV_CONNECTOR_AUTH',
    'testerpclient:20180519134451:05AALFP1139Q003'
  ),
  basicAuthHeader: required('EINV_BASIC_AUTH'),
  clientId: required('EINV_CLIENT_ID', 'testerpclient'),
  clientSecret: required('EINV_CLIENT_SECRET'),
  oauthUsername: required('EINV_OAUTH_USER'),
  oauthPassword: required('EINV_OAUTH_PASS'),
  oauthScope: 'einvauth',
  authUsername: required('EINV_AUTH_USER'),
  authPassword: required('EINV_AUTH_PASS'),
};
