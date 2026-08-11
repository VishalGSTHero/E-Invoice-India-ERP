const fs = require('fs');
const path = require('path');

const collectionPath =
  'c:/Users/Perennial/Downloads/E-Invoice India Automation.postman_collection.json';
const outDir = path.resolve(__dirname, '../testdata/payloads');
fs.mkdirSync(outDir, { recursive: true });

const j = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function isInvoiceGenerate(url) {
  const clean = String(url).split('?')[0];
  return clean.endsWith('/invoice');
}

const seen = new Map();
const index = [];

for (const item of j.item || []) {
  const r = item.request;
  if (!r || !r.url) continue;

  const url = typeof r.url === 'string' ? r.url : r.url.raw || '';
  if (!isInvoiceGenerate(url)) continue;

  const action = (r.header || []).find((h) => h.key === 'action')?.value;
  if (action !== 'GENERATEIRN') continue;
  if (!r.body || !r.body.raw || !r.body.raw.trim().startsWith('{')) continue;

  let payload;
  try {
    payload = JSON.parse(r.body.raw);
  } catch (e) {
    console.error('parse fail', item.name, e.message);
    continue;
  }

  if (payload.data && Array.isArray(payload.data.itemList)) {
    for (const it of payload.data.itemList) {
      if (it.hsnCd && String(it.hsnCd).length === 4) it.hsnCd = String(it.hsnCd) + '00';
      if (it.hsnCd && String(it.hsnCd).length === 5) it.hsnCd = String(it.hsnCd) + '0';
    }
  }

  const fingerprint = JSON.stringify({
    hasDisp: !!payload.data?.dispDtls,
    hasShip: !!payload.data?.shipDtls,
    hasEwb: !!payload.data?.ewbDtls,
    itemCnt: (payload.data?.itemList || []).length,
    docTyp: payload.data?.docDtls?.typ,
    supTyp: payload.data?.tranDtls?.supTyp,
    sellerPin: payload.data?.sellerDtls?.pin,
    buyerGstin: payload.data?.buyerDtls?.gstin,
  });

  if (seen.has(fingerprint) && /copy/i.test(item.name)) {
    console.log('SKIP duplicate copy:', item.name, 'same as', seen.get(fingerprint));
    continue;
  }
  if (!/copy/i.test(item.name)) seen.set(fingerprint, item.name);

  const key = slug(item.name);
  const file = key + '.json';
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(payload, null, 2));
  index.push({ name: item.name, file, key, fingerprint: JSON.parse(fingerprint) });
  console.log('WROTE', file);
}

fs.writeFileSync(
  path.resolve(outDir, '../scenarios.json'),
  JSON.stringify(index, null, 2)
);
console.log('TOTAL', index.length);
