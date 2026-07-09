# Estimate atomic flows

Este documento registra os contratos atuais das rotas atomicas de estimate. Ele deve ser lido junto dos testes:

- `tests/e2e/estimateCreation.current.e2e.test.ts`
- `tests/e2e/estimateEdit.current.e2e.test.ts`

## Rotas atomicas

| Rota | Uso | Resultado esperado |
| --- | --- | --- |
| `POST /estimate/create-full` | New estimate standalone e New project com estimate | cria project, PDF, estimate, services, anexos e SmartBuilder em uma rota |
| `POST /estimate/create-full/project/:projectId` | New estimate dentro de project existente | cria PDF, estimate, services, anexos e SmartBuilder no project existente |
| `PUT /estimate/update-full/:estimateId` | Edit de estimate | atualiza fields, services, PDF, anexos, valores e assinatura em uma rota |

## Regras preservadas

### `POST /estimate/create-full`

New estimate standalone:

- `type_estimate = "estimate"`.
- `isStandaloneEstimate = false`.
- project fica `Pending`.
- services viram `EstimateServiceProject`.
- fotos/anexos standalone ficam em `ImagesAttachments`.
- SmartBuilder session e importada quando enviada.

New project com estimate:

- project fica `Pre-Start`.
- `start_date`, `deadline`, `workContextId`, location e radius sao preservados.
- estimate fica `type_estimate = "estimateProject"` e `status = "approved"`.
- `isProjectFlow = true` deve produzir `assignatureRequired = true`.
- todos os services viram `EstimateServiceProject`.
- todos os services tambem viram `ServiceProject`.
- fotos de service ficam ligadas ao `ServiceProject`.

### `POST /estimate/create-full/project/:projectId`

- Usa project existente.
- Cria `PdfProject` vinculado ao project e ao estimate.
- Cria `EstimateServiceProject` para cada service enviado.
- Atualiza `project.workContextId` quando `workContextId` e enviado.
- Anexos ficam vinculados a `projectId` e `estimateId`.
- `isStandaloneEstimate` defaulta para `false`.

### `PUT /estimate/update-full/:estimateId`

- Deve produzir o mesmo estado final do fluxo antigo multi-call quando todas as chamadas antigas davam certo.
- Deve recalcular totals/descontos quando services mudam.
- Deve atualizar ou criar PDF no `PdfProject` existente.
- Deve limpar assinatura quando `clearSignature` for enviado.
- Deve remover `ServiceProject` relacionado quando um service de estimate e removido.

## Atomicidade

As rotas devem evitar estado parcial:

- falha de service dentro da transaction nao pode deixar estimate parcial;
- falha de update dentro da transaction nao pode deixar fields/services/PDF divergentes;
- arquivos enviados ao S3 antes da transaction devem ser limpos quando possivel;
- QuickBooks continua fire-and-forget e nao deve bloquear create/update.

## Email

Nenhuma dessas rotas envia email para o cliente. O envio acontece depois, por acao explicita no modal de email.

## Proximo ajuste necessario

O modelo atual recebe PDF e anexos via `multipart/form-data`. Isso preserva consistencia, mas pode dar timeout com muitos arquivos grandes.

O proximo desenho recomendado e staged upload:

1. criar presigned URLs;
2. front sobe PDF/imagens direto para S3;
3. rota atomica recebe `s3Key` e metadados;
4. backend faz commit no banco;
5. job limpa uploads temporarios abandonados.

Esse ajuste nao deve reintroduzir o fluxo antigo de `project -> pdf -> estimate -> services` em chamadas soltas.
