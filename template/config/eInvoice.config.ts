import path from 'path';

function required(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const eInvoiceConfig = {
  baseUrl: required('EINV_BASE_URL', 'https://dev.gsthero.com'),
  gstin: required('EINV_GSTIN', '05AALFP1139Q003'),
  uiLoginUrl: required('EINV_UI_LOGIN_URL', 'https://dev.gsthero.com/GspModel/login'),
  uiEmail: required('EINV_UI_EMAIL', required('EINV_OAUTH_USER')),
  uiPassword: required('EINV_UI_PASSWORD', required('EINV_OAUTH_PASS')),
  templateConnectorCode: required('EINV_TEMPLATE_CONNECTOR', '102'),
  templateFilePath: required(
    'EINV_TEMPLATE_FILE',
    path.resolve(
      __dirname,
      '../testdata/templates/TestFile-27_INVALID_20230904165850.xlsx'
    )
  ),
};
