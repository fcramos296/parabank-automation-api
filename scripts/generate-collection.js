/* Generates the ParaBank REST API Postman collection (v2.1). */
const fs = require('fs');
const path = require('path');

const COLLECTION_ID = 'c2a0be39-cd74-40c7-8565-b0ea0b57eaab';

function scriptEvent(type, lines) {
  return {
    listen: type,
    script: { type: 'text/javascript', packages: {}, exec: lines },
  };
}

function url(rawPath, query) {
  const queryString = query?.length ? `?${query.map((q) => `${q.key}=${q.value}`).join('&')}` : '';
  const result = {
    raw: `{{baseUrl}}${rawPath}${queryString}`,
    host: ['{{baseUrl}}'],
    path: rawPath.replace(/^\//, '').split('/'),
  };
  if (query?.length) result.query = query.map((q) => ({ key: q.key, value: q.value }));
  return result;
}

function request({ name, method, rawPath, query, description = '', tests = [], prerequest = [], jsonBody }) {
  const header = [{ key: 'Accept', value: 'application/json' }];
  const item = {
    name,
    event: [],
    request: { method, header, url: url(rawPath, query), description },
    response: [],
  };

  if (jsonBody) {
    header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(jsonBody, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  if (prerequest.length) item.event.push(scriptEvent('prerequest', prerequest));
  if (tests.length) item.event.push(scriptEvent('test', tests));
  return item;
}

function folder(name, description, items) {
  return { name, description, item: items };
}

const STATUS_200 = [
  "pm.test('Status code is 200', function () {",
  '    pm.response.to.have.status(200);',
  '});',
];

const NO_SERVER_ERROR = [
  "pm.test('Request does not crash the server', function () {",
  '    pm.expect(pm.response.code).to.be.below(500);',
  '});',
];

function schemaTest(label, schema) {
  return [
    `pm.test('${label}', function () {`,
    `    var schema = ${JSON.stringify(schema)};`,
    '    pm.response.to.have.jsonSchema(schema);',
    '});',
  ];
}

const addressSchema = {
  type: 'object',
  required: ['street', 'city', 'state', 'zipCode'],
  properties: {
    street: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    zipCode: { type: 'string' },
  },
};

const customerSchema = {
  type: 'object',
  required: ['id', 'firstName', 'lastName', 'address'],
  properties: {
    id: { type: 'number' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    address: addressSchema,
    phoneNumber: { type: ['string', 'null'] },
    ssn: { type: ['string', 'null'] },
  },
};

const accountSchema = {
  type: 'object',
  required: ['id', 'type', 'balance'],
  properties: {
    id: { type: 'number' },
    customerId: { type: 'number' },
    type: { type: 'string' },
    balance: { type: 'number' },
  },
};

const transactionSchema = {
  type: 'object',
  required: ['id', 'type', 'date', 'amount'],
  properties: {
    id: { type: 'number' },
    accountId: { type: 'number' },
    type: { type: 'string' },
    date: {},
    amount: { type: 'number' },
    description: { type: ['string', 'null'] },
  },
};

const positionSchema = {
  type: 'object',
  required: ['positionId', 'symbol'],
  properties: {
    positionId: { type: 'number' },
    symbol: { type: 'string' },
    shares: { type: 'number' },
  },
};

const loanSchema = {
  type: 'object',
  required: ['approved', 'responseDate'],
  properties: {
    approved: { type: 'boolean' },
    responseDate: {},
    accountId: { type: 'number' },
    message: { type: ['string', 'null'] },
  },
};

const billPaySchema = {
  type: 'object',
  required: ['payeeName', 'amount', 'accountId'],
  properties: {
    payeeName: { type: 'string' },
    amount: { type: 'number' },
    accountId: { type: 'number' },
  },
};

const ADMIN_GUARD = [
  "var allow = String(pm.environment.get('allowDestructive') || '').toLowerCase() === 'true';",
  "var baseUrl = String(pm.environment.get('baseUrl') || '');",
  "var isPublicDemo = /parabank\\.parasoft\\.com/i.test(baseUrl);",
  "if (!allow) { throw new Error('Blocked destructive admin request. Set allowDestructive=true explicitly.'); }",
  "if (isPublicDemo) { throw new Error('Blocked destructive admin request against the public ParaBank demo. Use a controlled/local instance.'); }",
];

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

const authFolder = folder('01 - Authentication', 'Authentication and negative credential validation.', [
  request({
    name: 'Login - Valid credentials',
    method: 'GET',
    rawPath: '/login/{{username}}/{{password}}',
    tests: [
      ...STATUS_200,
      ...schemaTest('Customer contract is valid', customerSchema),
      "pm.test('Response contains the authenticated customer', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(json.id).to.be.a('number');",
      "    pm.expect(json.firstName).to.be.a('string').and.not.empty;",
      "    pm.expect(json.lastName).to.be.a('string').and.not.empty;",
      "    pm.collectionVariables.set('customerId', json.id);",
      '});',
    ],
  }),
  request({
    name: 'Login - Invalid credentials',
    method: 'GET',
    rawPath: '/login/invalid_user_xyz/wrong_password_123',
    description: 'A negative login must never resolve a real customer and must not produce a 5xx server failure.',
    tests: [
      ...NO_SERVER_ERROR,
      "pm.test('Invalid login does not resolve a customer', function () {",
      '    if (pm.response.code === 200 && pm.response.text().trim()) {',
      '        var json = pm.response.json();',
      "        pm.expect(json.id, 'unexpected customer id for invalid credentials').to.be.undefined;",
      '    }',
      '});',
    ],
  }),
]);

const customerFolder = folder('02 - Customer Profile', 'Customer lookup and idempotent update.', [
  request({
    name: 'Get Customer - Valid id',
    method: 'GET',
    rawPath: '/customers/{{customerId}}',
    tests: [
      ...STATUS_200,
      ...schemaTest('Customer contract is valid', customerSchema),
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
    tests: [
      ...NO_SERVER_ERROR,
      "pm.test('Unknown customer does not return valid customer data', function () {",
      '    if (pm.response.code === 200 && pm.response.text().trim()) {',
      '        var json = pm.response.json();',
      "        pm.expect(json.id, 'unexpected customer resolved for made-up id').to.be.undefined;",
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
    tests: [
      ...STATUS_200,
      "pm.test('Update confirmation is non-empty', function () {",
      "    pm.expect(pm.response.text()).to.be.a('string').and.not.empty;",
      '});',
    ],
  }),
]);

const accountsFolder = folder('03 - Accounts', 'Account retrieval and creation with contract checks.', [
  request({
    name: 'Get Customer Accounts',
    method: 'GET',
    rawPath: '/customers/{{customerId}}/accounts',
    tests: [
      ...STATUS_200,
      ...schemaTest('Accounts contract is valid', { type: 'array', minItems: 1, items: accountSchema }),
      "pm.test('At least one account is available', function () {",
      '    var json = pm.response.json();',
      '    pm.expect(json.length).to.be.above(0);',
      "    pm.collectionVariables.set('primaryAccountId', json[0].id);",
      '});',
    ],
  }),
  request({
    name: 'Get Account - Valid id',
    method: 'GET',
    rawPath: '/accounts/{{primaryAccountId}}',
    tests: [
      ...STATUS_200,
      ...schemaTest('Account contract is valid', accountSchema),
      "pm.test('Account id matches requested id', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(String(json.id)).to.eql(String(pm.collectionVariables.get('primaryAccountId')));",
      '});',
    ],
  }),
  request({
    name: 'Get Account - Unknown id',
    method: 'GET',
    rawPath: '/accounts/999999999',
    tests: [
      ...NO_SERVER_ERROR,
      "pm.test('Unknown account does not return valid account data', function () {",
      '    if (pm.response.code === 200 && pm.response.text().trim()) {',
      '        var json = pm.response.json();',
      "        pm.expect(json.id, 'unexpected account resolved for made-up id').to.be.undefined;",
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
    tests: [
      ...STATUS_200,
      ...schemaTest('Created account contract is valid', accountSchema),
      "pm.test('Savings account is created and isolated for this run', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(json.id).to.be.a('number');",
      "    pm.expect(String(json.type).toUpperCase()).to.include('SAV');",
      "    pm.collectionVariables.set('newAccountId', json.id);",
      "    pm.collectionVariables.set('newAccountInitialBalance', Number(json.balance));",
      '});',
    ],
  }),
]);

const moneyFolder = folder('04 - Money Movement', 'State-changing operations with post-condition balance validation.', [
  request({
    name: 'Deposit into new account',
    method: 'POST',
    rawPath: '/deposit',
    query: [
      { key: 'accountId', value: '{{newAccountId}}' },
      { key: 'amount', value: '500' },
    ],
    tests: [...STATUS_200, "pm.test('Deposit returns confirmation', function () { pm.expect(pm.response.text()).to.not.be.empty; });"],
  }),
  request({
    name: 'Verify balance after deposit',
    method: 'GET',
    rawPath: '/accounts/{{newAccountId}}',
    tests: [
      ...STATUS_200,
      ...schemaTest('Account contract is valid after deposit', accountSchema),
      "pm.test('Deposit increased balance by exactly 500', function () {",
      '    var json = pm.response.json();',
      "    var initial = Number(pm.collectionVariables.get('newAccountInitialBalance'));",
      '    pm.expect(Number(json.balance)).to.eql(initial + 500);',
      "    pm.collectionVariables.set('newBalanceAfterDeposit', Number(json.balance));",
      '});',
    ],
  }),
  request({
    name: 'Pay Bill',
    method: 'POST',
    rawPath: '/billpay',
    query: [
      { key: 'accountId', value: '{{primaryAccountId}}' },
      { key: 'amount', value: '15.00' },
    ],
    jsonBody: {
      name: 'Acme Utilities',
      address: { street: '500 Industrial Pkwy', city: 'Metropolis', state: 'IL', zipCode: '62960' },
      phoneNumber: '555-0100',
      accountNumber: 987654321,
    },
    tests: [
      ...STATUS_200,
      ...schemaTest('Bill pay contract is valid', billPaySchema),
      "pm.test('Bill pay response matches request', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(json.payeeName).to.eql('Acme Utilities');",
      '    pm.expect(Number(json.amount)).to.eql(15);',
      "    pm.expect(String(json.accountId)).to.eql(String(pm.collectionVariables.get('primaryAccountId')));",
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
    tests: [...STATUS_200, "pm.test('Withdrawal returns confirmation', function () { pm.expect(pm.response.text()).to.not.be.empty; });"],
  }),
  request({
    name: 'Verify balance after withdrawal',
    method: 'GET',
    rawPath: '/accounts/{{newAccountId}}',
    tests: [
      ...STATUS_200,
      "pm.test('Withdrawal decreased balance by exactly 100', function () {",
      '    var json = pm.response.json();',
      "    var before = Number(pm.collectionVariables.get('newBalanceAfterDeposit'));",
      '    pm.expect(Number(json.balance)).to.eql(before - 100);',
      "    pm.collectionVariables.set('recipientBalanceBeforeTransfer', Number(json.balance));",
      '});',
    ],
  }),
  request({
    name: 'Capture source balance before transfer',
    method: 'GET',
    rawPath: '/accounts/{{primaryAccountId}}',
    tests: [
      ...STATUS_200,
      "pm.test('Source balance captured', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(json.balance).to.be.a('number');",
      "    pm.collectionVariables.set('sourceBalanceBeforeTransfer', Number(json.balance));",
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
      "pm.test('Transfer returns success confirmation', function () {",
      "    pm.expect(pm.response.text().toLowerCase()).to.include('success');",
      '});',
    ],
  }),
  request({
    name: 'Verify source balance after transfer',
    method: 'GET',
    rawPath: '/accounts/{{primaryAccountId}}',
    tests: [
      ...STATUS_200,
      "pm.test('Transfer debited source by exactly 25', function () {",
      '    var json = pm.response.json();',
      "    var before = Number(pm.collectionVariables.get('sourceBalanceBeforeTransfer'));",
      '    pm.expect(Number(json.balance)).to.eql(before - 25);',
      '});',
    ],
  }),
  request({
    name: 'Verify recipient balance after transfer',
    method: 'GET',
    rawPath: '/accounts/{{newAccountId}}',
    tests: [
      ...STATUS_200,
      "pm.test('Transfer credited recipient by exactly 25', function () {",
      '    var json = pm.response.json();',
      "    var before = Number(pm.collectionVariables.get('recipientBalanceBeforeTransfer'));",
      '    pm.expect(Number(json.balance)).to.eql(before + 25);',
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
      ...NO_SERVER_ERROR,
      "pm.test('Invalid transfer is not reported as successful', function () {",
      "    pm.expect(pm.response.text().toLowerCase()).to.not.include('success');",
      '});',
    ],
  }),
  request({
    name: 'Withdraw - Oversized amount (exploratory)',
    method: 'POST',
    rawPath: '/withdraw',
    query: [
      { key: 'accountId', value: '{{newAccountId}}' },
      { key: 'amount', value: '999999999' },
    ],
    description: 'Exploratory check kept after deterministic balance validations so it cannot corrupt earlier assertions.',
    tests: [
      ...NO_SERVER_ERROR,
      "pm.test('Oversized withdrawal response is observable', function () {",
      "    console.log('Oversized withdrawal -> status ' + pm.response.code + ', body: ' + pm.response.text());",
      "    pm.expect(pm.response.text()).to.be.a('string');",
      '});',
    ],
  }),
]);

const transactionsFolder = folder('05 - Transactions', 'Transaction searches validate both contract and filtering semantics.', [
  request({
    name: 'Get Transactions for Account',
    method: 'GET',
    rawPath: '/accounts/{{primaryAccountId}}/transactions',
    tests: [
      ...STATUS_200,
      ...schemaTest('Transactions contract is valid', { type: 'array', minItems: 1, items: transactionSchema }),
      "pm.test('Transfer transaction is present and captured', function () {",
      '    var json = pm.response.json();',
      "    var match = json.filter(function (tx) { return Number(tx.amount) === 25 && String(tx.type).toLowerCase() === 'debit'; }).pop();",
      "    pm.expect(match, 'expected debit transfer of 25').to.not.be.undefined;",
      "    pm.collectionVariables.set('transactionId', match.id);",
      '});',
    ],
  }),
  request({
    name: 'Get Transaction by Id',
    method: 'GET',
    rawPath: '/transactions/{{transactionId}}',
    tests: [
      ...STATUS_200,
      ...schemaTest('Transaction contract is valid', transactionSchema),
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
    tests: [
      ...STATUS_200,
      ...schemaTest('Amount filter returns transaction array', { type: 'array', minItems: 1, items: transactionSchema }),
      "pm.test('Every transaction matches amount 25', function () {",
      '    pm.response.json().forEach(function (tx) { pm.expect(Number(tx.amount)).to.eql(25); });',
      '});',
    ],
  }),
  request({
    name: 'Get Transactions by Month and Type',
    method: 'GET',
    rawPath: '/accounts/{{primaryAccountId}}/transactions/month/{{currentMonthName}}/type/DEBIT',
    tests: [
      ...STATUS_200,
      ...schemaTest('Month/type filter returns transaction array', { type: 'array', minItems: 1, items: transactionSchema }),
      "pm.test('Every transaction matches requested type and month', function () {",
      "    var moment = require('moment');",
      "    var expectedMonth = String(pm.collectionVariables.get('currentMonthName')).toLowerCase();",
      '    pm.response.json().forEach(function (tx) {',
      "        pm.expect(String(tx.type).toLowerCase()).to.eql('debit');",
      '        var parsed = moment(tx.date);',
      "        pm.expect(parsed.isValid(), 'transaction date must be parseable').to.eql(true);",
      "        pm.expect(parsed.format('MMMM').toLowerCase()).to.eql(expectedMonth);",
      '    });',
      '});',
    ],
  }),
  request({
    name: 'Get Transactions by Date Range',
    method: 'GET',
    rawPath: '/accounts/{{primaryAccountId}}/transactions/fromDate/{{sevenDaysAgoMDY}}/toDate/{{todayMDY}}',
    tests: [
      ...STATUS_200,
      ...schemaTest('Date-range filter returns transaction array', { type: 'array', minItems: 1, items: transactionSchema }),
      "pm.test('Every transaction falls inside requested date range', function () {",
      "    var moment = require('moment');",
      "    var from = moment(pm.collectionVariables.get('sevenDaysAgoMDY'), 'MM-DD-YYYY').startOf('day');",
      "    var to = moment(pm.collectionVariables.get('todayMDY'), 'MM-DD-YYYY').endOf('day');",
      '    pm.response.json().forEach(function (tx) {',
      '        var date = moment(tx.date);',
      "        pm.expect(date.isValid(), 'transaction date must be parseable').to.eql(true);",
      "        pm.expect(date.isBetween(from, to, undefined, '[]')).to.eql(true);",
      '    });',
      '});',
    ],
  }),
  request({
    name: 'Get Transactions on Date',
    method: 'GET',
    rawPath: '/accounts/{{primaryAccountId}}/transactions/onDate/{{todayMDY}}',
    tests: [
      ...STATUS_200,
      ...schemaTest('On-date filter returns transaction array', { type: 'array', minItems: 1, items: transactionSchema }),
      "pm.test('Every transaction matches requested calendar date', function () {",
      "    var moment = require('moment');",
      "    var expected = moment(pm.collectionVariables.get('todayMDY'), 'MM-DD-YYYY').format('YYYY-MM-DD');",
      '    pm.response.json().forEach(function (tx) {',
      '        var date = moment(tx.date);',
      "        pm.expect(date.isValid(), 'transaction date must be parseable').to.eql(true);",
      "        pm.expect(date.format('YYYY-MM-DD')).to.eql(expected);",
      '    });',
      '});',
    ],
  }),
]);

const loansFolder = folder('06 - Loans', 'Loan decisions with response contract validation.', [
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
    tests: [
      ...STATUS_200,
      ...schemaTest('Loan response contract is valid', loanSchema),
      "pm.test('Loan response contains a decision', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(json.approved).to.be.a('boolean');",
      "    if (json.approved && json.accountId) pm.collectionVariables.set('loanAccountId', json.accountId);",
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
    tests: [
      ...STATUS_200,
      ...schemaTest('Loan denial contract is valid', loanSchema),
      "pm.test('Huge loan with zero down payment is denied', function () {",
      '    pm.expect(pm.response.json().approved).to.eql(false);',
      '});',
    ],
  }),
]);

const investmentsFolder = folder('07 - Investments (Positions)', 'Position lifecycle with contract and identity checks.', [
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
      ...schemaTest('Positions contract is valid after buy', { type: 'array', minItems: 1, items: positionSchema }),
      "pm.test('New AAPL position is present', function () {",
      '    var json = pm.response.json();',
      "    var aapl = json.filter(function (p) { return p.symbol === 'AAPL'; }).pop();",
      "    pm.expect(aapl, 'expected AAPL position').to.not.be.undefined;",
      "    pm.expect(Number(aapl.shares)).to.be.at.least(10);",
      "    pm.collectionVariables.set('positionId', aapl.positionId);",
      '});',
    ],
  }),
  request({
    name: 'Get Positions for Customer',
    method: 'GET',
    rawPath: '/customers/{{customerId}}/positions',
    tests: [
      ...STATUS_200,
      ...schemaTest('Positions contract is valid', { type: 'array', items: positionSchema }),
      "pm.test('Purchased position is returned', function () {",
      '    var ids = pm.response.json().map(function (p) { return String(p.positionId); });',
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
      ...schemaTest('Position contract is valid', positionSchema),
      "pm.test('Position id and symbol match', function () {",
      '    var json = pm.response.json();',
      "    pm.expect(String(json.positionId)).to.eql(String(pm.collectionVariables.get('positionId')));",
      "    pm.expect(json.symbol).to.eql('AAPL');",
      '});',
    ],
  }),
  request({
    name: 'Get Position History',
    method: 'GET',
    rawPath: '/positions/{{positionId}}/{{thirtyDaysAgoYMD}}/{{todayYMD}}',
    description: 'Date format remains environment-dependent; success responses are validated as arrays.',
    tests: [
      ...NO_SERVER_ERROR,
      "pm.test('Successful history response is an array', function () {",
      "    if (pm.response.code === 200) pm.expect(pm.response.json()).to.be.an('array');",
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
      ...schemaTest('Positions contract is valid after sell', { type: 'array', items: positionSchema }),
      "pm.test('Full sale removes or reduces the selected position', function () {",
      "    var id = String(pm.collectionVariables.get('positionId'));",
      '    var match = pm.response.json().filter(function (p) { return String(p.positionId) === id; })[0];',
      '    if (match) pm.expect(Number(match.shares)).to.be.below(10);',
      '});',
    ],
  }),
]);

const adminFolder = folder(
  '09 - Admin (DESTRUCTIVE - opt-in only)',
  'Destructive server-wide administration. Every request is blocked unless allowDestructive=true and baseUrl is not the public ParaBank host.',
  [
    request({
      name: 'Set Parameter',
      method: 'POST',
      rawPath: '/setParameter/{{adminParamName}}/{{adminParamValue}}',
      prerequest: ADMIN_GUARD,
      tests: [...NO_SERVER_ERROR],
    }),
    request({ name: 'Shutdown JMS Listener', method: 'POST', rawPath: '/shutdownJmsListener', prerequest: ADMIN_GUARD, tests: [...STATUS_200] }),
    request({ name: 'Startup JMS Listener', method: 'POST', rawPath: '/startupJmsListener', prerequest: ADMIN_GUARD, tests: [...STATUS_200] }),
    request({ name: 'Initialize Database', method: 'POST', rawPath: '/initializeDB', prerequest: ADMIN_GUARD, tests: [...STATUS_200] }),
    request({ name: 'Clean Database', method: 'POST', rawPath: '/cleanDB', prerequest: ADMIN_GUARD, tests: [...STATUS_200] }),
  ]
);

const collection = {
  info: {
    _postman_id: COLLECTION_ID,
    name: 'ParaBank REST API Tests',
    description:
      'Automated Postman/Newman coverage for the ParaBank REST API. Endpoint coverage is complete, while assertions focus on response contracts, filtering semantics and state changes. Folders 01-07 are the default flow. Folder 09 is destructive and has an explicit execution guard.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [authFolder, customerFolder, accountsFolder, moneyFolder, transactionsFolder, loansFolder, investmentsFolder, adminFolder],
  event: [scriptEvent('prerequest', COLLECTION_PREREQUEST), scriptEvent('test', COLLECTION_TEST)],
  variable: [
    { key: 'customerId', value: '' },
    { key: 'primaryAccountId', value: '' },
    { key: 'newAccountId', value: '' },
    { key: 'newAccountInitialBalance', value: '' },
    { key: 'newBalanceAfterDeposit', value: '' },
    { key: 'recipientBalanceBeforeTransfer', value: '' },
    { key: 'sourceBalanceBeforeTransfer', value: '' },
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

const outPath = path.resolve(__dirname, '..', 'postman', 'ParaBank_API_Tests.postman_collection.json');
const target = path.resolve(process.argv[2] || outPath);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(collection, null, 2)}\n`);
console.log('Wrote', target);
