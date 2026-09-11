<div align="center">

# 🏦 ParaBank API Test Suite

**Suíte automatizada de testes REST para o ParaBank com Postman/Newman, validações de contrato, regras de negócio e CI.**

Postman • Newman • JSON Schema • GitHub Actions • Allure

![Postman](https://img.shields.io/badge/Postman-Collection%20v2.1-FF6C37?logo=postman&logoColor=white)
![Newman](https://img.shields.io/badge/tested%20with-Newman-FF6C37?logo=postman&logoColor=white)
![Allure](https://img.shields.io/badge/reports-Allure-EE3939?logo=qameta&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Coverage](https://img.shields.io/badge/endpoint%20coverage-27%2F27-brightgreen)

</div>

---

## Visão geral

O projeto cobre **27/27 endpoints REST do ParaBank** (`/parabank/services/bank`) e separa cobertura de endpoint de profundidade de validação.

Além de verificar status HTTP, a suíte valida:

- contratos de resposta com **JSON Schema**;
- efeitos reais de `deposit`, `withdraw` e `transfer` através de saldo antes/depois;
- semântica dos filtros de transações por valor, mês/tipo e datas;
- identidade dos recursos criados e consultados;
- cenários negativos sem considerar `5xx` como comportamento aceitável;
- endpoints administrativos com **bloqueio preventivo contra o ambiente público**.

A collection possui **38 requests**: os 27 endpoints da API mais requests adicionais usados para validar pós-condições de operações que alteram estado.

## Estratégia de arquitetura

`scripts/generate-collection.js` é a única fonte da verdade da collection.

O JSON gerado **não é versionado**. Isso elimina o risco de manter o gerador e uma collection commitada fora de sincronia.

```text
testing-api/
├── .github/
│   └── workflows/
│       ├── quality.yml                  # quality gate determinístico em push/PR
│       └── live-api.yml                 # regressão live sob demanda
├── postman/
│   └── ParaBank.postman_environment.json
├── scripts/
│   ├── generate-collection.js           # fonte da verdade
│   └── check-generated.js               # valida geração, cobertura e safety guards
├── package.json
├── package-lock.json
└── README.md
```

`npm test` executa automaticamente `npm run generate` antes do Newman.

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

O quality gate verifica programaticamente que todos os **27 endpoints obrigatórios** continuam presentes na collection gerada.

## Qualidade das asserções

### Contratos

Os principais payloads (`Customer`, `Account`, `Transaction`, `LoanResponse`, `Position` e `BillPayResult`) possuem validação de JSON Schema.

Isso permite detectar mudanças de contrato mesmo quando o endpoint continua retornando `200`.

### Operações financeiras

A suíte não considera apenas uma mensagem de sucesso como evidência suficiente.

Exemplo do fluxo de transferência:

```text
captura saldo origem + destino
          ↓
POST /transfer (25)
          ↓
GET origem  → saldo anterior - 25
GET destino → saldo anterior + 25
```

O mesmo princípio é utilizado para depósito e saque.

### Filtros de transação

Os endpoints de busca validam o conteúdo retornado:

- `/amount/25`: todas as transações devem ter valor `25`;
- `/month/{month}/type/DEBIT`: tipo e mês devem corresponder ao filtro;
- intervalo de datas: todas as datas devem estar dentro do período;
- `onDate`: todas as transações devem corresponder à data solicitada.

Assim, um backend que simplesmente ignorasse o filtro não passaria nos testes.

## Quality gate

```bash
npm ci
npm run quality
```

`npm run quality` valida:

1. sintaxe dos scripts Node;
2. geração determinística da collection;
3. ID estável da collection;
4. presença dos 27 endpoints esperados;
5. presença do safety guard em todos os endpoints administrativos.

O workflow `.github/workflows/quality.yml` executa esse gate automaticamente em `push` e `pull_request` sem depender do ParaBank público.

## Como executar

### Pré-requisitos

| Ferramenta | Versão | Uso |
|---|---|---|
| Node.js | ≥ 18 | generator + Newman |
| Java/JRE | ≥ 8 | geração/abertura do relatório Allure |

Instale as dependências:

```bash
npm ci
```

### Suite completa não destrutiva

```bash
npm test
```

O comando gera a collection e executa as pastas `01`–`07`.

### Somente terminal

```bash
npm run test:cli
```

### Gerar collection para importar no Postman

```bash
npm run generate
```

Arquivo gerado:

```text
postman/ParaBank_API_Tests.postman_collection.json
```

O arquivo é um build artifact e está no `.gitignore`.

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

## Endpoints administrativos: proteção obrigatória

A pasta `09 - Admin (DESTRUCTIVE - opt-in only)` contém operações que podem alterar toda a instância do ParaBank.

Todos os requests dessa pasta possuem um pre-request guard que exige simultaneamente:

1. `allowDestructive=true`;
2. `baseUrl` **não pode** apontar para `parabank.parasoft.com`.

Portanto, mesmo uma habilitação acidental não permite `cleanDB`/`initializeDB` contra o demo público.

Exemplo para uma instância local controlada:

```bash
npm run test:admin -- \
  --env-var baseUrl=http://localhost:8080/parabank/services/bank \
  --env-var allowDestructive=true
```

## CI/CD

### Quality Gate

`.github/workflows/quality.yml`

Executa em push e PR:

```text
checkout → Node 20 → npm ci → npm run quality
```

Não depende de rede para o ParaBank e deve ser determinístico.

### Live API Regression

`.github/workflows/live-api.yml`

Executado manualmente via `workflow_dispatch` porque o ParaBank público é um ambiente externo e compartilhado.

O job executa `npm test` e publica como artifacts:

- `newman/report.xml`;
- `newman/report.html`;
- `allure-results/`.

Essa separação impede que indisponibilidade/rate limiting de um ambiente externo quebre o quality gate de código.

## Relatórios

`npm test` gera:

- saída CLI;
- JUnit XML em `newman/report.xml`;
- HTML em `newman/report.html`;
- resultados Allure em `allure-results/`.

Para gerar e abrir o Allure:

```bash
npm run report:allure:generate
npm run report:allure:open
```

ou:

```bash
npm run test:allure
```

## Decisões e limitações conhecidas

### Ambiente público compartilhado

O ParaBank público não oferece isolamento de dados por execução. A suíte cria uma nova conta para o fluxo principal, reduzindo colisões, mas utiliza por padrão o usuário público `john/demo`.

Para maior previsibilidade em um cenário real, utilize uma instância dedicada e credenciais exclusivas.

### Cenários negativos e HTTP 5xx

Erros de servidor não são aceitos como resposta válida para entradas negativas. Se o ParaBank retornar `500` para uma credencial/ID inválido, o teste falha deliberadamente e evidencia um problema de robustez da API em vez de mascará-lo como resultado esperado.

### Overdraft

O saque acima do saldo permanece como cenário exploratório porque a regra de negócio não está formalizada como restrição estável da API. Ele é executado **depois** das validações determinísticas de saldo para não contaminar os testes anteriores.

### Histórico de posições

O formato aceito pelo endpoint de histórico de posição não é explicitamente tipado pela API. A suíte mantém a convenção `YYYY-MM-DD` e valida que a chamada não cause falha de servidor; respostas `200` devem ser arrays.

---

<div align="center">

Projeto de automação de API com foco em **contrato, comportamento, confiabilidade e execução contínua**, não apenas em cobertura nominal de endpoints.

</div>
