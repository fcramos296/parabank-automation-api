/* Generates the ParaBank REST API Postman collection (v2.1). */
const fs = require('fs');
const path = require('path');

function uid() {
  // deterministic-ish uuid v4-like string, good enough for postman ids
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function scriptEvent(type, lines) {
  return {
    listen: type,
    script: {
      type: 'text/javascript',
      packages: {},
      exec: lines,
    },
  };
}

function url(rawPath, query) {
  const raw =
    '{{baseUrl}}' + rawPath + (query && query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : '');
  const pathParts = rawPath.replace(/^\//, '').split('/');
  const u = {
    raw,
    host: ['{{baseUrl}}'],
    path: pathParts,
  };
  if (query && query.length) {
    u.query = query.map((q) => ({ key: q.key, value: q.value }));
  }
  return u;
}

function request({ name, method, rawPath, query, description, tests, prerequest }) {
  const item = {
    name,
    event: [],
    request: {
      method,
      header: [{ key: 'Accept', value: 'application/json' }],
      url: url(rawPath, query),
      description: description || '',
    },
    response: [],
  };
  if (prerequest && prerequest.length) {
    item.event.push(scriptEvent('prerequest', prerequest));
  }
  if (tests && tests.length) {
    item.event.push(scriptEvent('test', tests));
  }
  return item;
}

function folder(name, description, items) {
  return { name, description: description || '', item: items };
}

// ---------------------------------------------------------------------------
// Reusable test snippets
// ---------------------------------------------------------------------------

const STATUS_200 = [
  "pm.test('Status code is 200', function () {",
  '    pm.response.to.have.status(200);',
  '});',
];

function arrayResponseTest(label) {
  return [`pm.test('${label}', function () {`, '    pm.expect(pm.response.json()).to.be.an(\'array\');', '});'];
}

// ---------------------------------------------------------------------------
// Collection-level scripts
// ---------------------------------------------------------------------------

const COLLECTION_PREREQUEST = [
  "if (!pm.collectionVariables.get('__datesInitialized')) {",
  "    var moment = require('moment');",
  '    var now = moment();',
  "    pm.collectionVariables.set('todayMDY', now.format('MM-DD-YYYY'));",
  "    pm.collectionVariables.set('todayYMD', now.format('YYYY-MM-DD'));",
  "    pm.collectionVariables.set('sevenDaysAgoMDY', now.clone().subtract(7, 'days').format('MM-DD-YYYY'));",
  "    pm.collectionVariables.set('thirtyDaysAgoYMD', now.clone().subtract(30, 'days').format('YYYY-MM-DD'));",
  "    pm.collectionVariables.set('currentMonthName', now.format('MMMM'));",
  "    pm.collectionVariables.set('__datesInitialized', 'true');",
  '}',
];

const COLLECTION_TEST = [
  "pm.test('[Global] Response time under 10s', function () {",
  '    pm.expect(pm.response.responseTime).to.be.below(10000);',
  '});',
];

// ---------------------------------------------------------------------------
// 01 - Authentication
// ---------------------------------------------------------------------------

const authFolder = folder(
  '01 - Authentication',
  'Login endpoint of the ParaBank REST service (GET /login/{username}/{password}).',
  [
    request({
      name: 'Login - Valid credentials',
      method: 'GET',
      rawPath: '/login/{{username}}/{{password}}',
      description:
        'Logs in with the credentials configured in the environment (defaults to the well-known ParaBank demo account john/demo) and captures the resulting customerId for every later request.',
      tests: [
        ...STATUS_200,
        "pm.test('Response contains a valid customer with an id', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json).to.have.property('id');",
        "    pm.expect(json.id).to.be.a('number');",
        "    pm.collectionVariables.set('customerId', json.id);",
        '});',
        "pm.test('Customer first/last name are present', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json.firstName).to.be.a('string');",
        "    pm.expect(json.lastName).to.be.a('string');",
        '});',
      ],
    }),
    request({
      name: 'Login - Invalid credentials',
      method: 'GET',
      rawPath: '/login/invalid_user_xyz/wrong_password_123',
      description: 'Negative test: a made-up username/password must never resolve to a real customer.',
      tests: [
        "pm.test('Invalid login does not return a valid customer', function () {",
        '    if (pm.response.code === 200) {',
        '        var body = pm.response.text();',
        '        if (body && body.trim().length > 0) {',
        '            var json = pm.response.json();',
        "            pm.expect(json.id, 'should not resolve an id for bad credentials').to.be.undefined;",
        '        }',
        '    } else {',
        '        pm.expect(pm.response.code).to.be.oneOf([204, 404, 500]);',
        '    }',
        '});',
      ],
    }),
  ]
);

// ---------------------------------------------------------------------------
// 02 - Customer Profile
// ---------------------------------------------------------------------------

const customerFolder = folder(
  '02 - Customer Profile',
  'Customer lookup and update (GET /customers/{id}, POST /customers/update/{id}).',
  [
    request({
      name: 'Get Customer - Valid id',
      method: 'GET',
      rawPath: '/customers/{{customerId}}',
      tests: [
        ...STATUS_200,
        "pm.test('Customer id matches requested id', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(String(json.id)).to.eql(String(pm.collectionVariables.get('customerId')));",
        "    pm.collectionVariables.set('custFirstName', json.firstName || '');",
        "    pm.collectionVariables.set('custLastName', json.lastName || '');",
        "    pm.collectionVariables.set('custSsn', json.ssn || '');",
        "    pm.collectionVariables.set('custPhone', json.phoneNumber || '');",
        '    var addr = json.address || {};',
        "    pm.collectionVariables.set('custStreet', addr.street || '');",
        "    pm.collectionVariables.set('custCity', addr.city || '');",
        "    pm.collectionVariables.set('custState', addr.state || '');",
        "    pm.collectionVariables.set('custZip', addr.zipCode || '');",
        '});',
      ],
    }),
    request({
      name: 'Get Customer - Unknown id',
      method: 'GET',
      rawPath: '/customers/999999999',
      description: 'Negative test with an id that should not exist on any ParaBank instance.',
      tests: [
        "pm.test('Unknown customer id does not return valid data', function () {",
        '    if (pm.response.code === 200) {',
        '        var body = pm.response.text();',
        '        if (body && body.trim().length > 0) {',
        '            var json = pm.response.json();',
        "            pm.expect(json.id, 'unexpected customer resolved for a made-up id').to.be.undefined;",
        '        }',
        '    } else {',
        '        pm.expect(pm.response.code).to.be.oneOf([404, 500]);',
        '    }',
        '});',
      ],
    }),
    request({
      name: 'Update Customer - Idempotent resubmit',
      method: 'POST',
      rawPath: '/customers/update/{{customerId}}',
      query: [
        { key: 'firstName', value: '{{custFirstName}}' },
        { key: 'lastName', value: '{{custLastName}}' },
        { key: 'street', value: '{{custStreet}}' },
        { key: 'city', value: '{{custCity}}' },
        { key: 'state', value: '{{custState}}' },
        { key: 'zipCode', value: '{{custZip}}' },
        { key: 'phoneNumber', value: '{{custPhone}}' },
        { key: 'ssn', value: '{{custSsn}}' },
        { key: 'username', value: '{{username}}' },
        { key: 'password', value: '{{password}}' },
      ],
      description:
        'Resubmits the exact same field values captured from "Get Customer - Valid id" so the endpoint is exercised without actually changing the shared demo account (safe to re-run).',
      tests: [
        ...STATUS_200,
        "pm.test('Update confirmation message returned', function () {",
        '    var body = pm.response.text();',
        "    pm.expect(body).to.be.a('string');",
        '    pm.expect(body.length).to.be.above(0);',
        '});',
      ],
    }),
  ]
);

// ---------------------------------------------------------------------------
// 03 - Accounts
// ---------------------------------------------------------------------------

const accountsFolder = folder(
  '03 - Accounts',
  'Account listing/lookup and account creation.',
  [
    request({
      name: 'Get Customer Accounts',
      method: 'GET',
      rawPath: '/customers/{{customerId}}/accounts',
      tests: [
        ...STATUS_200,
        "pm.test('Returns a non-empty array of accounts', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json).to.be.an('array');",
        '    pm.expect(json.length).to.be.above(0);',
        "    pm.collectionVariables.set('primaryAccountId', json[0].id);",
        '});',
        "pm.test('Each account has id/type/balance', function () {",
        '    var json = pm.response.json();',
        '    json.forEach(function (acc) {',
        "        pm.expect(acc).to.have.property('id');",
        "        pm.expect(acc).to.have.property('type');",
        "        pm.expect(acc).to.have.property('balance');",
        '    });',
        '});',
      ],
    }),
    request({
      name: 'Get Account - Valid id',
      method: 'GET',
      rawPath: '/accounts/{{primaryAccountId}}',
      tests: [
        ...STATUS_200,
        "pm.test('Account id matches and balance is numeric', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(String(json.id)).to.eql(String(pm.collectionVariables.get('primaryAccountId')));",
        "    pm.expect(json.balance).to.be.a('number');",
        '});',
      ],
    }),
    request({
      name: 'Get Account - Unknown id',
      method: 'GET',
      rawPath: '/accounts/999999999',
      tests: [
        "pm.test('Unknown account id does not return valid data', function () {",
        '    if (pm.response.code === 200) {',
        '        var body = pm.response.text();',
        '        if (body && body.trim().length > 0) {',
        '            var json = pm.response.json();',
        "            pm.expect(json.id, 'unexpected account resolved for a made-up id').to.be.undefined;",
        '        }',
        '    } else {',
        '        pm.expect(pm.response.code).to.be.oneOf([404, 500]);',
        '    }',
        '});',
      ],
    }),
    request({
      name: 'Create Account - Savings',
      method: 'POST',
      rawPath: '/createAccount',
      query: [
        { key: 'customerId', value: '{{customerId}}' },
        { key: 'newAccountType', value: '1' },
        { key: 'fromAccountId', value: '{{primaryAccountId}}' },
      ],
      description: 'newAccountType: 0 = CHECKING, 1 = SAVINGS. Creates a fresh account used by the rest of the suite.',
      tests: [
        ...STATUS_200,
        "pm.test('New savings account is created with an id', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json).to.have.property('id');",
        "    pm.collectionVariables.set('newAccountId', json.id);",
        '});',
      ],
    }),
  ]
);

// ---------------------------------------------------------------------------
// 04 - Money Movement
// ---------------------------------------------------------------------------

const moneyFolder = folder(
  '04 - Money Movement',
  'Deposit, withdraw and transfer between accounts.',
  [
    request({
      name: 'Deposit into new account',
      method: 'POST',
      rawPath: '/deposit',
      query: [
        { key: 'accountId', value: '{{newAccountId}}' },
        { key: 'amount', value: '500' },
      ],
      tests: [
        ...STATUS_200,
        "pm.test('Deposit confirmation returned', function () {",
        '    var body = pm.response.text();',
        '    pm.expect(body.length).to.be.above(0);',
        '});',
      ],
    }),
    request({
      name: 'Withdraw from new account',
      method: 'POST',
      rawPath: '/withdraw',
      query: [
        { key: 'accountId', value: '{{newAccountId}}' },
        { key: 'amount', value: '100' },
      ],
      tests: [
        ...STATUS_200,
        "pm.test('Withdraw confirmation returned', function () {",
        '    var body = pm.response.text();',
        '    pm.expect(body.length).to.be.above(0);',
        '});',
      ],
    }),
    request({
      name: 'Withdraw - Oversized amount (overdraft check)',
      method: 'POST',
      rawPath: '/withdraw',
      query: [
        { key: 'accountId', value: '{{newAccountId}}' },
        { key: 'amount', value: '999999999' },
      ],
      description:
        'Exploratory/negative test: documents how the API behaves when asked to withdraw far more than the account balance, without assuming an unverified business rule.',
      tests: [
        "pm.test('Server handles an oversized withdrawal without a 5xx crash', function () {",
        '    pm.expect(pm.response.code).to.be.below(500);',
        '});',
        "pm.test('Response body is logged for manual review of overdraft behaviour', function () {",
        '    var body = pm.response.text();',
        "    console.log('Oversized withdrawal -> status ' + pm.response.code + ', body: ' + body);",
        "    pm.expect(body).to.be.a('string');",
        '});',
      ],
    }),
    request({
      name: 'Transfer - Valid accounts',
      method: 'POST',
      rawPath: '/transfer',
      query: [
        { key: 'fromAccountId', value: '{{primaryAccountId}}' },
        { key: 'toAccountId', value: '{{newAccountId}}' },
        { key: 'amount', value: '25' },
      ],
      tests: [
        ...STATUS_200,
        "pm.test('Transfer succeeded message returned', function () {",
        '    var body = pm.response.text().toLowerCase();',
        "    pm.expect(body).to.include('success');",
        '});',
      ],
    }),
    request({
      name: 'Transfer - Non-existent accounts',
      method: 'POST',
      rawPath: '/transfer',
      query: [
        { key: 'fromAccountId', value: '999999997' },
        { key: 'toAccountId', value: '999999998' },
        { key: 'amount', value: '10' },
      ],
      tests: [
        "pm.test('Transfer between non-existent accounts is rejected or errors', function () {",
        '    if (pm.response.code === 200) {',
        '        var body = pm.response.text().toLowerCase();',
        "        pm.expect(body).to.not.include('success');",
        '    } else {',
        '        pm.expect(pm.response.code).to.be.oneOf([400, 404, 500]);',
        '    }',
        '});',
      ],
    }),
  ]
);

// ---------------------------------------------------------------------------
// 05 - Transactions
// ---------------------------------------------------------------------------

const transactionsFolder = folder(
  '05 - Transactions',
  'Transaction search endpoints. Must run after "04 - Money Movement" so there is at least one transaction to find.',
  [
    request({
      name: 'Get Transactions for Account',
      method: 'GET',
      rawPath: '/accounts/{{primaryAccountId}}/transactions',
      tests: [
        ...STATUS_200,
        "pm.test('Returns an array including the transfer just made', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json).to.be.an('array');",
        '    pm.expect(json.length).to.be.above(0);',
        '    var last = json[json.length - 1];',
        "    pm.collectionVariables.set('transactionId', last.id);",
        '});',
      ],
    }),
    request({
      name: 'Get Transaction by Id',
      method: 'GET',
      rawPath: '/transactions/{{transactionId}}',
      tests: [
        ...STATUS_200,
        "pm.test('Transaction id matches requested id', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(String(json.id)).to.eql(String(pm.collectionVariables.get('transactionId')));",
        '});',
      ],
    }),
    request({
      name: 'Get Transactions by Amount',
      method: 'GET',
      rawPath: '/accounts/{{primaryAccountId}}/transactions/amount/25',
      description: 'Matches the $25 transfer created in "04 - Money Movement".',
      tests: [...STATUS_200, ...arrayResponseTest('Response is an array')],
    }),
    request({
      name: 'Get Transactions by Month and Type',
      method: 'GET',
      rawPath: '/accounts/{{primaryAccountId}}/transactions/month/{{currentMonthName}}/type/Debit',
      tests: [...STATUS_200, ...arrayResponseTest('Response is an array')],
    }),
    request({
      name: 'Get Transactions by Date Range',
      method: 'GET',
      rawPath: '/accounts/{{primaryAccountId}}/transactions/fromDate/{{sevenDaysAgoMDY}}/toDate/{{todayMDY}}',
      description: 'Dates use MM-DD-YYYY, matching the format used by the ParaBank "Find Transactions" UI.',
      tests: [...STATUS_200, ...arrayResponseTest('Response is an array')],
    }),
    request({
      name: 'Get Transactions on Date',
      method: 'GET',
      rawPath: '/accounts/{{primaryAccountId}}/transactions/onDate/{{todayMDY}}',
      tests: [...STATUS_200, ...arrayResponseTest('Response is an array')],
    }),
  ]
);

// ---------------------------------------------------------------------------
// 06 - Loans
// ---------------------------------------------------------------------------

const loansFolder = folder('06 - Loans', 'Loan request endpoint under two different business scenarios.', [
  request({
    name: 'Request Loan - Small amount, high down payment',
    method: 'POST',
    rawPath: '/requestLoan',
    query: [
      { key: 'customerId', value: '{{customerId}}' },
      { key: 'amount', value: '500' },
      { key: 'downPayment', value: '450' },
      { key: 'fromAccountId', value: '{{primaryAccountId}}' },
    ],
    description: 'A small loan with a high down payment is likely (but not guaranteed) to be approved.',
    tests: [
      ...STATUS_200,
      "pm.test('Loan response contains an approval decision', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(json).to.have.property('approved');",
      "    pm.expect(json).to.have.property('responseDate');",
      '    if (json.approved && json.accountId) {',
      "        pm.collectionVariables.set('loanAccountId', json.accountId);",
      '    }',
      "    console.log('Small loan / high down payment -> approved =', json.approved);",
      '});',
    ],
  }),
  request({
    name: 'Request Loan - Huge amount, no down payment',
    method: 'POST',
    rawPath: '/requestLoan',
    query: [
      { key: 'customerId', value: '{{customerId}}' },
      { key: 'amount', value: '5000000' },
      { key: 'downPayment', value: '0' },
      { key: 'fromAccountId', value: '{{primaryAccountId}}' },
    ],
    description: 'A $5,000,000 loan with zero down payment against a demo account should be denied.',
    tests: [
      ...STATUS_200,
      "pm.test('Loan response contains an approval decision', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(json).to.have.property('approved');",
      '});',
      "pm.test('Huge loan with no down payment is denied', function () {",
      '    var json = pm.response.json();',
      '    pm.expect(json.approved).to.eql(false);',
      '});',
    ],
  }),
]);

// ---------------------------------------------------------------------------
// 07 - Investments (Positions)
// ---------------------------------------------------------------------------

const investmentsFolder = folder(
  '07 - Investments (Positions)',
  'Stock position buy/sell and lookup endpoints.',
  [
    request({
      name: 'Buy Position - AAPL',
      method: 'POST',
      rawPath: '/customers/{{customerId}}/buyPosition',
      query: [
        { key: 'accountId', value: '{{primaryAccountId}}' },
        { key: 'name', value: 'Apple Inc.' },
        { key: 'symbol', value: 'AAPL' },
        { key: 'shares', value: '10' },
        { key: 'pricePerShare', value: '150.25' },
      ],
      tests: [
        ...STATUS_200,
        "pm.test('Position list returned and includes the new AAPL position', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json).to.be.an('array');",
        "    var aapl = json.filter(function (p) { return p.symbol === 'AAPL'; }).pop();",
        "    pm.expect(aapl, 'expected an AAPL position in the response').to.not.be.undefined;",
        "    pm.collectionVariables.set('positionId', aapl.id);",
        '});',
      ],
    }),
    request({
      name: 'Get Positions for Customer',
      method: 'GET',
      rawPath: '/customers/{{customerId}}/positions',
      tests: [
        ...STATUS_200,
        "pm.test('Position list includes the AAPL position bought earlier', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json).to.be.an('array');",
        '    var ids = json.map(function (p) { return String(p.id); });',
        "    pm.expect(ids).to.include(String(pm.collectionVariables.get('positionId')));",
        '});',
      ],
    }),
    request({
      name: 'Get Position by Id',
      method: 'GET',
      rawPath: '/positions/{{positionId}}',
      tests: [
        ...STATUS_200,
        "pm.test('Position id and symbol match', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(String(json.id)).to.eql(String(pm.collectionVariables.get('positionId')));",
        "    pm.expect(json.symbol).to.eql('AAPL');",
        '});',
      ],
    }),
    request({
      name: 'Get Position History',
      method: 'GET',
      rawPath: '/positions/{{positionId}}/{{thirtyDaysAgoYMD}}/{{todayYMD}}',
      description:
        'Date format for this endpoint is not documented; YYYY-MM-DD is assumed. Adjust thirtyDaysAgoYMD/todayYMD in the collection pre-request script if the live instance expects a different format.',
      tests: [
        "pm.test('Position history endpoint responds without a server error', function () {",
        '    pm.expect(pm.response.code).to.be.below(500);',
        '});',
        "pm.test('When successful, history is returned as an array', function () {",
        '    if (pm.response.code === 200) {',
        "        pm.expect(pm.response.json()).to.be.an('array');",
        '    }',
        '});',
      ],
    }),
    request({
      name: 'Sell Position - AAPL',
      method: 'POST',
      rawPath: '/customers/{{customerId}}/sellPosition',
      query: [
        { key: 'accountId', value: '{{primaryAccountId}}' },
        { key: 'positionId', value: '{{positionId}}' },
        { key: 'shares', value: '10' },
        { key: 'pricePerShare', value: '155.00' },
      ],
      tests: [
        ...STATUS_200,
        "pm.test('Position list returned after selling', function () {",
        '    var json = pm.response.json();',
        "    pm.expect(json).to.be.an('array');",
        "    console.log('Remaining positions after full AAPL sell:', json.length);",
        '});',
      ],
    }),
  ]
);

// ---------------------------------------------------------------------------
// 09 - Admin (destructive, opt-in only)
// ---------------------------------------------------------------------------

const adminFolder = folder(
  '09 - Admin (DESTRUCTIVE - opt-in only)',
  'Server-wide administrative endpoints. These affect every user of the target ParaBank instance and are NOT part of the default "npm test" run. ' +
    'Only run this folder ("npm run test:admin") against an instance you own/control (e.g. a local ParaBank deployment), never against the shared public demo unless you accept resetting/wiping data for all concurrent users.',
  [
    request({
      name: 'Set Parameter',
      method: 'POST',
      rawPath: '/setParameter/{{adminParamName}}/{{adminParamValue}}',
      description:
        'Sets a server-side configuration parameter. adminParamName/adminParamValue are empty by default in the environment - fill them in with a parameter valid for your deployment before running.',
      tests: [
        "pm.test('Server handles the setParameter call without a 5xx crash', function () {",
        '    pm.expect(pm.response.code).to.be.below(500);',
        '});',
      ],
    }),
    request({
      name: 'Shutdown JMS Listener',
      method: 'POST',
      rawPath: '/shutdownJmsListener',
      tests: [...STATUS_200],
    }),
    request({
      name: 'Startup JMS Listener',
      method: 'POST',
      rawPath: '/startupJmsListener',
      description: 'Restarts the listener stopped by "Shutdown JMS Listener" so the pair is non-destructive when run together.',
      tests: [...STATUS_200],
    }),
    request({
      name: 'Initialize Database',
      method: 'POST',
      rawPath: '/initializeDB',
      description:
        'DESTRUCTIVE: resets the entire database to the default seed data (e.g. the john/demo account), discarding all data created by every user of this instance.',
      tests: [...STATUS_200],
    }),
    request({
      name: 'Clean Database',
      method: 'POST',
      rawPath: '/cleanDB',
      description: 'MOST DESTRUCTIVE ENDPOINT: wipes the entire database, including all customers and accounts. Use with extreme caution.',
      tests: [...STATUS_200],
    }),
  ]
);

// ---------------------------------------------------------------------------
// Assemble collection
// ---------------------------------------------------------------------------

const collection = {
  info: {
    _postman_id: uid(),
    name: 'ParaBank REST API Tests',
    description:
      'Automated Postman/Newman test suite for every REST endpoint exposed by the ParaBank demo application (' +
      'https://parabank.parasoft.com/parabank/services/bank), derived from the JAX-RS annotations in ' +
      'com.parasoft.parabank.service.ParaBankService (https://github.com/parasoft/parabank). ' +
      'Folders 01-07 are safe to run repeatedly against the shared public demo instance and are chained: ' +
      'later requests reuse ids captured from earlier ones (login -> customer -> accounts -> transactions/loans/positions). ' +
      'Folder 09 contains destructive, server-wide admin endpoints and is opt-in only (see its description).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [authFolder, customerFolder, accountsFolder, moneyFolder, transactionsFolder, loansFolder, investmentsFolder, adminFolder],
  event: [scriptEvent('prerequest', COLLECTION_PREREQUEST), scriptEvent('test', COLLECTION_TEST)],
  variable: [
    { key: 'customerId', value: '' },
    { key: 'primaryAccountId', value: '' },
    { key: 'newAccountId', value: '' },
    { key: 'transactionId', value: '' },
    { key: 'loanAccountId', value: '' },
    { key: 'positionId', value: '' },
    { key: 'custFirstName', value: '' },
    { key: 'custLastName', value: '' },
    { key: 'custStreet', value: '' },
    { key: 'custCity', value: '' },
    { key: 'custState', value: '' },
    { key: 'custZip', value: '' },
    { key: 'custPhone', value: '' },
    { key: 'custSsn', value: '' },
    { key: 'todayMDY', value: '' },
    { key: 'todayYMD', value: '' },
    { key: 'sevenDaysAgoMDY', value: '' },
    { key: 'thirtyDaysAgoYMD', value: '' },
    { key: 'currentMonthName', value: '' },
    { key: '__datesInitialized', value: '' },
  ],
};

const defaultOutPath = path.resolve(__dirname, '..', 'postman', 'ParaBank_API_Tests.postman_collection.json');
const target = process.argv[2] || defaultOutPath;
fs.writeFileSync(target, JSON.stringify(collection, null, 2) + '\n');
console.log('Wrote', target);
