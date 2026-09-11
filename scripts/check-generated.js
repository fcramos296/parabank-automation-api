const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const generator = path.join(__dirname, 'generate-collection.js');
const hardener = path.join(__dirname, 'harden-generated-collection.js');
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
  'GET /accounts/{{primaryAccountId}}/transactions/month/{{currentMonthName}}/type/Debit',
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
  execFileSync(process.execPath, [hardener, target], { stdio: 'pipe' });
  return fs.readFileSync(target, 'utf8');
}

function allRequests(collection) {
  return collection.item.flatMap((folder) => folder.item.map((item) => ({ folder: folder.name, item })));
}

function endpointKey(item) {
  const raw = item.request.url.raw.replace('{{baseUrl}}', '').split('?')[0];
  return `${item.request.method} ${raw}`;
}

function getRequest(requests, folderPrefix, name) {
  const match = requests.find(({ folder, item }) => folder.startsWith(folderPrefix) && item.name === name);
  if (!match) throw new Error(`Expected request not generated: ${folderPrefix} / ${name}`);
  return match.item;
}

function scriptText(item) {
  return item.event
    .filter((event) => event.listen === 'test')
    .flatMap((event) => event.script.exec)
    .join('\n');
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

  const baseline = getRequest(requests, '04 - Money Movement', 'Capture persisted balance before deposit');
  if (!scriptText(baseline).includes("pm.collectionVariables.set('newAccountInitialBalance'")) {
    throw new Error('Persisted new-account balance must be captured before deposit.');
  }

  const createAccount = getRequest(requests, '03 - Accounts', 'Create Account - Savings');
  if (scriptText(createAccount).includes("pm.collectionVariables.set('newAccountInitialBalance'")) {
    throw new Error('createAccount response must not be used as the persisted balance baseline.');
  }

  const monthType = getRequest(requests, '05 - Transactions', 'Get Transactions by Month and Type');
  if (!monthType.request.url.raw.endsWith('/type/Debit')) {
    throw new Error('Month/type transaction search must use ParaBank case-sensitive Debit value.');
  }
  if (!scriptText(monthType).includes("if (pm.response.code !== 200) return;")) {
    throw new Error('Month/type JSON assertions must be guarded against non-200 HTML error responses.');
  }
  if (!scriptText(monthType).includes('moment.utc(tx.date)')) {
    throw new Error('Month/type transaction date assertions must normalize response timestamps in UTC.');
  }

  const range = getRequest(requests, '05 - Transactions', 'Get Transactions by Date Range');
  const exactDate = getRequest(requests, '05 - Transactions', 'Get Transactions on Date');
  if (!scriptText(range).includes('moment.utc(tx.date)') || !scriptText(exactDate).includes('moment.utc(tx.date)')) {
    throw new Error('Transaction calendar-date assertions must normalize response timestamps in UTC.');
  }

  for (const name of ['Request Loan - Small amount, high down payment', 'Request Loan - Huge amount, no down payment']) {
    const loan = getRequest(requests, '06 - Loans', name);
    if (!scriptText(loan).includes('"accountId":{"type":["number","null"]}')) {
      throw new Error(`Loan schema must allow nullable accountId: ${name}`);
    }
  }

  if (collection.info._postman_id !== 'c2a0be39-cd74-40c7-8565-b0ea0b57eaab') {
    throw new Error('Postman collection id must remain stable across generations.');
  }

  console.log(
    `Quality check passed: ${requiredEndpoints.size}/${requiredEndpoints.size} endpoints covered, ${requests.length} requests generated, deterministic output and live-behavior guards confirmed.`
  );
} finally {
  for (const file of [first, second]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
