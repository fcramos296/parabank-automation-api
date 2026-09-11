const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const generator = path.join(__dirname, 'generate-collection.js');
const first = path.join(os.tmpdir(), `parabank-collection-${process.pid}-a.json`);
const second = path.join(os.tmpdir(), `parabank-collection-${process.pid}-b.json`);

const requiredEndpoints = new Set([
  'GET /login/{{username}}/{{password}}',
  'GET /customers/{{customerId}}',
  'POST /customers/update/{{customerId}}',
  'GET /customers/{{customerId}}/accounts',
  'GET /accounts/{{primaryAccountId}}',
  'POST /createAccount',
  'POST /billpay',
  'POST /deposit',
  'POST /withdraw',
  'POST /transfer',
  'GET /accounts/{{primaryAccountId}}/transactions',
  'GET /transactions/{{transactionId}}',
  'GET /accounts/{{primaryAccountId}}/transactions/amount/25',
  'GET /accounts/{{primaryAccountId}}/transactions/month/{{currentMonthName}}/type/DEBIT',
  'GET /accounts/{{primaryAccountId}}/transactions/fromDate/{{sevenDaysAgoMDY}}/toDate/{{todayMDY}}',
  'GET /accounts/{{primaryAccountId}}/transactions/onDate/{{todayMDY}}',
  'POST /requestLoan',
  'POST /customers/{{customerId}}/buyPosition',
  'POST /customers/{{customerId}}/sellPosition',
  'GET /customers/{{customerId}}/positions',
  'GET /positions/{{positionId}}',
  'GET /positions/{{positionId}}/{{thirtyDaysAgoYMD}}/{{todayYMD}}',
  'POST /setParameter/{{adminParamName}}/{{adminParamValue}}',
  'POST /shutdownJmsListener',
  'POST /startupJmsListener',
  'POST /initializeDB',
  'POST /cleanDB',
]);

function generate(target) {
  execFileSync(process.execPath, [generator, target], { stdio: 'pipe' });
  return fs.readFileSync(target, 'utf8');
}

function allRequests(collection) {
  return collection.item.flatMap((folder) => folder.item.map((item) => ({ folder: folder.name, item })));
}

function endpointKey(item) {
  const raw = item.request.url.raw.replace('{{baseUrl}}', '').split('?')[0];
  return `${item.request.method} ${raw}`;
}

try {
  const outputA = generate(first);
  const outputB = generate(second);

  if (outputA !== outputB) {
    throw new Error('Collection generation is not deterministic. Identical inputs produced different JSON.');
  }

  const collection = JSON.parse(outputA);
  const requests = allRequests(collection);
  const generatedEndpoints = new Set(requests.map(({ item }) => endpointKey(item)));
  const missing = [...requiredEndpoints].filter((endpoint) => !generatedEndpoints.has(endpoint));

  if (missing.length) {
    throw new Error(`Required API endpoints are missing from the collection:\n- ${missing.join('\n- ')}`);
  }

  const admin = requests.filter(({ folder }) => folder.startsWith('09 - Admin'));
  const unguarded = admin.filter(({ item }) => !item.event.some((event) => event.listen === 'prerequest'));
  if (unguarded.length) {
    throw new Error(`Destructive admin requests without a pre-request safety guard: ${unguarded.map(({ item }) => item.name).join(', ')}`);
  }

  if (collection.info._postman_id !== 'c2a0be39-cd74-40c7-8565-b0ea0b57eaab') {
    throw new Error('Postman collection id must remain stable across generations.');
  }

  console.log(`Quality check passed: ${requiredEndpoints.size}/${requiredEndpoints.size} endpoints covered, ${requests.length} requests generated, deterministic output confirmed.`);
} finally {
  for (const file of [first, second]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
