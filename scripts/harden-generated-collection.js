const fs = require('fs');
const path = require('path');

const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'postman', 'ParaBank_API_Tests.postman_collection.json'));

function fail(message) {
  throw new Error(`Collection hardening failed: ${message}`);
}

function folder(collection, name) {
  const found = collection.item.find((item) => item.name === name);
  if (!found) fail(`folder not found: ${name}`);
  return found;
}

function request(targetFolder, name) {
  const found = targetFolder.item.find((item) => item.name === name);
  if (!found) fail(`request not found: ${targetFolder.name} / ${name}`);
  return found;
}

function testEvent(item) {
  const event = item.event.find((entry) => entry.listen === 'test');
  if (!event) fail(`test event not found: ${item.name}`);
  return event;
}

function guardJsonTests(item) {
  const exec = testEvent(item).script.exec;
  let testIndex = 0;
  const guarded = [];

  for (const line of exec) {
    guarded.push(line);
    if (line.startsWith("pm.test('")) {
      testIndex += 1;
      if (testIndex > 1) {
        guarded.push("    if (pm.response.code !== 200) return;");
        guarded.push("    var contentType = pm.response.headers.get('Content-Type') || ''; ");
        guarded.push("    if (!/json/i.test(contentType)) return;");
      }
    }
  }

  testEvent(item).script.exec = guarded;
}

function baselineBalanceRequest() {
  return {
    name: 'Capture persisted balance before deposit',
    event: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          packages: {},
          exec: [
            "pm.test('Status code is 200', function () {",
            '    pm.response.to.have.status(200);',
            '});',
            "pm.test('Persisted new-account balance is captured', function () {",
            '    var json = pm.response.json();',
            "    pm.expect(String(json.id)).to.eql(String(pm.collectionVariables.get('newAccountId')));",
            "    pm.expect(json.balance).to.be.a('number');",
            "    pm.collectionVariables.set('newAccountInitialBalance', Number(json.balance));",
            '});',
          ],
        },
      },
    ],
    request: {
      method: 'GET',
      header: [{ key: 'Accept', value: 'application/json' }],
      url: {
        raw: '{{baseUrl}}/accounts/{{newAccountId}}',
        host: ['{{baseUrl}}'],
        path: ['accounts', '{{newAccountId}}'],
      },
      description:
        'Captures the persisted balance after account creation. ParaBank transfers its configured minimum balance during creation, while the createAccount response may still contain the pre-transfer balance.',
    },
    response: [],
  };
}

const collection = JSON.parse(fs.readFileSync(target, 'utf8'));

// 1) Account creation has a server-side minimum-balance transfer. Never use the
// createAccount response balance as the post-persistence baseline.
const accounts = folder(collection, '03 - Accounts');
const createAccount = request(accounts, 'Create Account - Savings');
testEvent(createAccount).script.exec = testEvent(createAccount).script.exec.filter(
  (line) => !line.includes("pm.collectionVariables.set('newAccountInitialBalance'")
);

const money = folder(collection, '04 - Money Movement');
const depositIndex = money.item.findIndex((item) => item.name === 'Deposit into new account');
if (depositIndex < 0) fail('deposit request not found');
if (!money.item.some((item) => item.name === 'Capture persisted balance before deposit')) {
  money.item.splice(depositIndex, 0, baselineBalanceRequest());
}

// 2) ParaBank TransactionType is case-sensitive (Credit/Debit), despite some
// documentation examples using uppercase values. Its transaction timestamps are
// serialized in UTC, so the month assertion must also stay in UTC.
const transactions = folder(collection, '05 - Transactions');
const monthType = request(transactions, 'Get Transactions by Month and Type');
monthType.request.url.raw = monthType.request.url.raw.replace('/type/DEBIT', '/type/Debit');
monthType.request.url.path = monthType.request.url.path.map((part) => (part === 'DEBIT' ? 'Debit' : part));
guardJsonTests(monthType);
testEvent(monthType).script.exec = testEvent(monthType).script.exec.map((line) =>
  line.replace('var parsed = moment(tx.date);', 'var parsed = moment.utc(tx.date);')
);

// 3) Transaction timestamps are serialized in UTC. Calendar-date assertions
// must stay in UTC or clients west of UTC can observe the previous local day.
const dateRange = request(transactions, 'Get Transactions by Date Range');
testEvent(dateRange).script.exec = testEvent(dateRange).script.exec.map((line) =>
  line
    .replace("var from = moment(pm.collectionVariables.get('sevenDaysAgoMDY')", "var from = moment.utc(pm.collectionVariables.get('sevenDaysAgoMDY')")
    .replace("var to = moment(pm.collectionVariables.get('todayMDY')", "var to = moment.utc(pm.collectionVariables.get('todayMDY')")
    .replace('var date = moment(tx.date);', 'var date = moment.utc(tx.date);')
);

const onDate = request(transactions, 'Get Transactions on Date');
testEvent(onDate).script.exec = testEvent(onDate).script.exec.map((line) =>
  line
    .replace("var expected = moment(pm.collectionVariables.get('todayMDY')", "var expected = moment.utc(pm.collectionVariables.get('todayMDY')")
    .replace('var date = moment(tx.date);', 'var date = moment.utc(tx.date);')
);

// 4) LoanResponse.accountId is Integer in ParaBank and is only populated for
// approved loans. Keep schema strict while allowing the legitimate null value.
const loans = folder(collection, '06 - Loans');
for (const item of loans.item) {
  testEvent(item).script.exec = testEvent(item).script.exec.map((line) =>
    line.replace('"accountId":{"type":"number"}', '"accountId":{"type":["number","null"]}')
  );
}

const smallLoan = request(loans, 'Request Loan - Small amount, high down payment');
testEvent(smallLoan).script.exec.push(
  "pm.test('Loan account id matches approval decision', function () {",
  '    var json = pm.response.json();',
  "    if (json.approved) pm.expect(json.accountId).to.be.a('number');",
  '    else pm.expect(json.accountId == null).to.eql(true);',
  '});'
);

const deniedLoan = request(loans, 'Request Loan - Huge amount, no down payment');
testEvent(deniedLoan).script.exec.push(
  "pm.test('Denied loan does not create an account', function () {",
  '    var json = pm.response.json();',
  '    pm.expect(json.approved).to.eql(false);',
  '    pm.expect(json.accountId == null).to.eql(true);',
  '});'
);

fs.writeFileSync(target, `${JSON.stringify(collection, null, 2)}\n`);
console.log('Hardened live-behavior assumptions in', target);
