// Generates the transactions hooks from the read contract.
// Run with: pnpm generate
// @ts-check
/** @type {import('@rtk-query/codegen-openapi').ConfigFile} */
const config = {
  schemaFile: '../../../contracts/transactions.public.openapi.yaml',
  apiFile: './emptyTransactionsApi.ts',
  apiImport: 'emptyTransactionsApi',
  outputFile: './generated/transactionsApi.ts',
  exportName: 'transactionsApi',
  hooks: true,
  filterEndpoints: ['listTransactions', 'getTransaction'],
}

module.exports = config
