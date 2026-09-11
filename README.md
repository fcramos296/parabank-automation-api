# Testes de API do ParaBank (Postman/Newman)

Suíte de testes de API para todos os serviços REST expostos pela aplicação de demonstração
[ParaBank](https://parabank.parasoft.com/) da Parasoft, executada com [Postman](https://www.postman.com/)/[Newman](https://github.com/postmanlabs/newman).

## Cobertura

O ParaBank expõe um serviço JAX-RS (`/parabank/services/bank`) com 26 operações. A lista de endpoints foi
extraída diretamente do código-fonte oficial (`ParaBankService.java` no repositório
[parasoft/parabank](https://github.com/parasoft/parabank)), já que a documentação WADL/Swagger ao vivo não estava
acessível a partir deste ambiente. Todos os 26 endpoints estão cobertos:

| Pasta da collection | Endpoints |
|---|---|
| `01 - Authentication` | `GET /login/{username}/{password}` |
| `02 - Customer Profile` | `GET /customers/{id}`, `POST /customers/update/{id}` |
| `03 - Accounts` | `GET /customers/{id}/accounts`, `GET /accounts/{id}`, `POST /createAccount` |
| `04 - Money Movement` | `POST /deposit`, `POST /withdraw`, `POST /transfer` |
| `05 - Transactions` | `GET /accounts/{id}/transactions` (+ `/amount/{}`, `/month/{}/type/{}`, `/fromDate/{}/toDate/{}`, `/onDate/{}`), `GET /transactions/{id}` |
| `06 - Loans` | `POST /requestLoan` |
| `07 - Investments (Positions)` | `POST /customers/{id}/buyPosition`, `POST /customers/{id}/sellPosition`, `GET /customers/{id}/positions`, `GET /positions/{id}`, `GET /positions/{id}/{startDate}/{endDate}` |
| `09 - Admin (DESTRUCTIVE - opt-in only)` | `POST /setParameter/{name}/{value}`, `POST /shutdownJmsListener`, `POST /startupJmsListener`, `POST /initializeDB`, `POST /cleanDB` |

As pastas `01`-`07` são encadeadas: o login captura `customerId`, que é usado para buscar as contas
(`primaryAccountId`), criar uma nova conta (`newAccountId`), gerar transações, um empréstimo e uma posição de
ações — cada request salva variáveis de collection consumidas pelas requests seguintes. Cada endpoint tem pelo
menos um teste de caminho feliz; login, busca de cliente/conta e transferência também têm um teste negativo
(credenciais inválidas, IDs inexistentes, contas inexistentes).

A pasta `09 - Admin` cobre os 5 endpoints administrativos restantes (reset/limpeza de banco, parâmetros globais,
listener JMS). Eles afetam a instância inteira (todos os usuários simultâneos do ambiente público compartilhado),
por isso **não fazem parte do `npm test` padrão** — veja a seção de admin abaixo.

## Estrutura

```
postman/
  ParaBank_API_Tests.postman_collection.json   # collection Postman v2.1
  ParaBank.postman_environment.json            # environment (baseUrl, credenciais)
scripts/
  generate-collection.js                       # gera a collection programaticamente (fonte da verdade)
package.json                                   # scripts newman
```

A collection é gerada por `scripts/generate-collection.js` em vez de editada manualmente — isso mantém as ~30
requests e seus scripts de teste consistentes. Após alterar o gerador, rode `npm run generate` para regravar o
JSON da collection.

## Como rodar

```bash
npm install
npm test          # roda as pastas 01-07 (seguras) + relatórios CLI/JUnit/HTML em newman/
npm run test:cli  # mesma coisa, só saída no terminal (sem gerar relatórios em arquivo)
```

Variáveis do environment (`postman/ParaBank.postman_environment.json`):

- `baseUrl` — padrão `https://parabank.parasoft.com/parabank/services/bank`
- `username` / `password` — padrão `john` / `demo` (conta de demonstração publicamente documentada do ParaBank)

Ajuste-as (ou passe `--env-var chave=valor` ao newman) para apontar para outra instância/conta.

## ⚠️ Limitação conhecida deste ambiente (execução ao vivo)

Este workspace roda atrás de um proxy de saída controlado por política organizacional, que **bloqueia
(`403`) qualquer acesso direto a `parabank.parasoft.com`** — tanto via `curl`/`WebFetch` quanto via `newman`.
Além disso, foi observado que o cliente HTTP interno do Newman (`postman-request`) trava com
`Error: Unknown object type "asyncfunction"` (biblioteca `object-hash`) para **qualquer** domínio que precise
passar pelo proxy configurado neste sandbox — um problema de compatibilidade Node 22 do próprio Newman/ambiente,
não da collection.

Por isso, a suíte não pôde ser executada ao vivo contra `parabank.parasoft.com` a partir desta sessão. Em vez
disso, a lógica de cada request/teste (parsing de resposta, encadeamento de variáveis, asserções) foi validada
localmente com um mock HTTP descartável simulando os 26 endpoints: **27 requests, 54 test scripts e 107/108
asserções passaram** (a única falha foi uma simplificação do mock, não um defeito na collection).

**Rode `npm test` no seu ambiente local/CI (sem esse bloqueio de rede)** para validar contra o servidor real.
Dois pontos podem exigir ajuste fino após a primeira execução real, pois não puderam ser confirmados
empiricamente:

- Formato de data de `GET /positions/{id}/{startDate}/{endDate}` (histórico de posição) — assumido `yyyy-MM-dd`.
  Se a instância real esperar outro formato, ajuste `thirtyDaysAgoYMD`/`todayYMD` no pre-request script da
  collection.
- Comportamento exato de `POST /withdraw` ao sacar mais que o saldo, e de `POST /requestLoan` com valores
  extremos — os testes documentam o comportamento observado via `console.log` em vez de travar em uma regra de
  negócio não confirmada.

## Pasta `09 - Admin` (destrutiva, opt-in)

```bash
npm run test:admin
```

Contém `initializeDB` (reseta todos os dados para o estado padrão) e `cleanDB` (apaga o banco inteiro), além de
`setParameter` e o par `shutdownJmsListener`/`startupJmsListener`. **Não rode isso contra o ambiente público
compartilhado** a menos que você aceite resetar/apagar os dados de todos os usuários simultâneos — use apenas
contra uma instância própria (ex.: ParaBank rodando localmente via Docker/Maven).
