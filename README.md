<div align="center">

# 🏦 ParaBank API Test Suite

**Suíte automatizada de testes REST para o ParaBank com Postman/Newman, validações de contrato, regras de negócio, hardening de comportamento e CI.**

Postman • Newman • JSON Schema • GitHub Actions • Allure

![Postman](https://img.shields.io/badge/Postman-Collection%20v2.1-FF6C37?logo=postman&logoColor=white)
![Newman](https://img.shields.io/badge/tested%20with-Newman-FF6C37?logo=postman&logoColor=white)
![Allure](https://img.shields.io/badge/reports-Allure-EE3939?logo=qameta&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Coverage](https://img.shields.io/badge/endpoint%20coverage-27%2F27-brightgreen)

</div>

---

## Visão geral

O projeto cobre **27/27 endpoints REST do ParaBank** (`/parabank/services/bank`) e atualmente gera **39 requests**. Os requests adicionais aos 27 endpoints são usados para validar pós-condições e estado persistido após operações que alteram dados.

A suíte valida:

- contratos de resposta com **JSON Schema**;
- efeitos reais de `deposit`, `withdraw` e `transfer` por saldo antes/depois;
- saldo persistido da conta criada antes de iniciar movimentações;
- filtros de transações por valor, mês/tipo, intervalo e data;
- datas normalizadas em **UTC**, evitando falsos negativos por timezone;
- `LoanResponse.accountId` como campo nullable, coerente com a decisão de aprovação;
- identidade de recursos criados e consultados;
- cenários negativos sem considerar `5xx` como resultado aceitável;
- proteção contra cascatas de erro quando uma resposta não é JSON;
- endpoints administrativos com bloqueio preventivo contra o ambiente público.

## Arquitetura da collection

A collection é tratada como **build artifact** e não é versionada diretamente.

O pipeline de geração possui duas etapas:

1. `scripts/generate-collection.js` gera a estrutura base;
2. `scripts/harden-generated-collection.js` aplica regras confirmadas durante a execução live contra o ParaBank.

O `scripts/check-generated.js` gera a collection duas vezes e verifica que o resultado é determinístico, além de validar cobertura, safety guards e regras críticas de comportamento.

```text
testing-api/
├── .github/
│   └── workflows/
│       ├── quality.yml
│       └── live-api.yml
├── postman/
│   └── ParaBank.postman_environment.json
├── scripts/
│   ├── generate-collection.js
│   ├── harden-generated-collection.js
│   └── check-generated.js
├── package.json
├── package-lock.json
└── README.md
```

`npm test` executa automaticamente a geração completa antes de iniciar o Newman.

## Cobertura da API

| Área | Endpoints principais |
|---|---|
| Authentication | `GET /login/{username}/{password}` |
| Customer | `GET /customers/{id}` · `POST /customers/update/{id}` |
| Accounts | `GET /customers/{id}/accounts` · `GET /accounts/{id}` · `POST /createAccount` |
| Money movement | `POST /billpay` · `POST /deposit` · `POST /withdraw` · `POST /transfer` |
| Transactions | consulta geral, por id, valor, mês/tipo, intervalo e data |
| Loans | `POST /requestLoan` |
| Positions | buy · sell · list · get · history |
| Admin | `setParameter` · JMS stop/start · `initializeDB` · `cleanDB` |

O quality gate verifica programaticamente que os **27 endpoints obrigatórios** continuam presentes na collection gerada.

## Validações principais

### Contratos

Os principais payloads possuem JSON Schema:

- `Customer`;
- `Account`;
- `Transaction`;
- `LoanResponse`;
- `Position`;
- `BillPayResult`.

Isso permite detectar quebra de contrato mesmo quando o endpoint continua respondendo `200`.

### Operações financeiras

A suíte valida estado, não apenas mensagens de sucesso.

Fluxo de exemplo:

```text
cria conta
   ↓
GET conta → captura saldo persistido
   ↓
POST /deposit 500
   ↓
GET conta → saldo anterior + 500
   ↓
POST /withdraw 100
   ↓
GET conta → saldo anterior - 100
```

Na transferência, os saldos de origem e destino também são capturados e validados após a operação.

### Filtros de transações

Os filtros validam o conteúdo retornado:

- `/amount/25`: todas as transações devem ter valor `25`;
- `/month/{month}/type/Debit`: tipo e mês devem corresponder ao filtro;
- intervalo de datas: todas as datas devem estar dentro do período;
- `onDate`: todas as transações devem corresponder à data solicitada.

O ParaBank serializa datas em UTC. Por isso as validações de calendário usam `moment.utc(...)` para impedir que uma transação no início do mês seja interpretada como pertencente ao dia/mês anterior em timezones negativos.

### Loans

`LoanResponse.accountId` pode ser `null` quando o empréstimo não é aprovado.

A suíte valida a regra de forma condicional:

```text
approved = true  → accountId deve ser number
approved = false → accountId deve ser null
```

### Respostas não JSON

Assertions que dependem do payload JSON são protegidas para não gerar falhas em cascata quando o servidor responde com erro HTTP ou HTML. O relatório mantém a causa principal visível em vez de produzir múltiplos `JSONError` derivados da mesma resposta.

## Quality gate

```bash
npm ci
npm run quality
```

O quality gate verifica:

1. sintaxe dos scripts Node;
2. geração determinística da collection;
3. `_postman_id` estável;
4. cobertura dos 27 endpoints obrigatórios;
5. safety guard em todos os endpoints administrativos;
6. captura do saldo persistido antes do depósito;
7. uso do valor case-sensitive `Debit`;
8. normalização UTC nos filtros de calendário;
9. `LoanResponse.accountId` nullable;
10. proteção das assertions JSON contra respostas não JSON.

O workflow `.github/workflows/quality.yml` executa automaticamente em `push` e `pull_request`.

## Como executar

### Pré-requisitos

| Ferramenta | Versão | Uso |
|---|---|---|
| Node.js | ≥ 18 | geração + Newman |
| Java/JRE | ≥ 8 | relatório Allure |

Instale as dependências:

```bash
npm ci
```

### Regressão não destrutiva

```bash
npm test
```

Executa as pastas `01`–`07` e gera relatórios CLI, JUnit, HTML e Allure.

### Execução somente no terminal

```bash
npm run test:cli
```

### Gerar a collection

```bash
npm run generate
```

O comando executa:

```text
generate:base → generate:harden
```

Arquivo gerado:

```text
postman/ParaBank_API_Tests.postman_collection.json
```

Esse arquivo está no `.gitignore` e deve ser tratado como build artifact.

### Validar somente qualidade estrutural

```bash
npm run quality
```

## Configuração

Environment padrão: `postman/ParaBank.postman_environment.json`.

| Variável | Padrão | Descrição |
|---|---|---|
| `baseUrl` | `https://parabank.parasoft.com/parabank/services/bank` | endpoint base |
| `username` | `john` | usuário demo |
| `password` | `demo` | senha demo |
| `allowDestructive` | `false` | habilitação explícita dos endpoints admin |

As variáveis podem ser sobrescritas pelo Newman:

```bash
npm run test:cli -- --env-var username=meu_usuario --env-var password=minha_senha
```

## Endpoints administrativos

A pasta `09 - Admin (DESTRUCTIVE - opt-in only)` contém operações que podem alterar toda a instância do ParaBank.

Cada request exige simultaneamente:

1. `allowDestructive=true`;
2. `baseUrl` diferente de `parabank.parasoft.com`.

Assim, `cleanDB`, `initializeDB` e outras operações administrativas não podem ser executadas acidentalmente contra o demo público.

Exemplo em instância local controlada:

```bash
npm run test:admin -- \
  --env-var baseUrl=http://localhost:8080/parabank/services/bank \
  --env-var allowDestructive=true
```

## CI/CD

### Quality Gate

Arquivo: `.github/workflows/quality.yml`

```text
checkout → Node 20 → npm ci → npm run quality
```

Esse fluxo é determinístico e não depende da disponibilidade do ParaBank público.

### Live API Regression

Arquivo: `.github/workflows/live-api.yml`

É executado manualmente por `workflow_dispatch`, pois o ParaBank público é um ambiente externo e compartilhado.

A regressão publica como artifacts:

- `newman/report.xml`;
- `newman/report.html`;
- `allure-results/`.

Separar o quality gate da regressão live evita que indisponibilidade, rate limiting ou estado compartilhado do ambiente público bloqueiem a validação estrutural do projeto.

## Relatórios

`npm test` gera:

- CLI;
- JUnit XML em `newman/report.xml`;
- HTML em `newman/report.html`;
- Allure results em `allure-results/`.

Para gerar e abrir o relatório Allure:

```bash
npm run report:allure:generate
npm run report:allure:open
```

Ou execute tudo em sequência:

```bash
npm run test:allure
```

## Decisões e limitações conhecidas

### Ambiente público compartilhado

O ParaBank público não oferece isolamento de dados por execução. A suíte cria uma nova conta para o fluxo principal, reduzindo colisões, mas utiliza por padrão o usuário público `john/demo`.

Uma instância dedicada é recomendada para regressão totalmente determinística.

### HTTP 5xx em cenários negativos

Entradas inválidas não tratam `5xx` como resposta válida. Se a aplicação retorna `500`, o teste evidencia isso como problema de robustez da API.

### Overdraft

O saque acima do saldo permanece como cenário exploratório porque a regra não está formalizada como restrição estável da API. Ele roda depois das validações determinísticas para não contaminar os testes anteriores.

### Histórico de posições

O endpoint de histórico possui comportamento menos explícito quanto ao formato de data. A suíte usa `YYYY-MM-DD`, exige ausência de falha de servidor e, em respostas `200`, valida retorno em formato de array.

---

<div align="center">

Projeto de automação de API com foco em **contrato, comportamento, confiabilidade, segurança operacional e CI/CD**, não apenas em cobertura nominal de endpoints.

</div>
