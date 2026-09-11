// Generates the categories and assignments hooks from the domain contract.
// Run with: pnpm generate
// @ts-check
/** @type {import('@rtk-query/codegen-openapi').ConfigFile} */
const config = {
  schemaFile: '../../../../contracts/transaction-categories.public.openapi.yaml',
  apiFile: './emptyCategoriesApi.ts',
  apiImport: 'emptyCategoriesApi',
  outputFile: './generated/categoriesApi.ts',
  exportName: 'categoriesApi',
  hooks: true,
  filterEndpoints: [
    'listTransactionCategories',
    'createTransactionCategory',
    'updateTransactionCategory',
    'deleteTransactionCategory',
    'setTransactionCategory',
    'lookupTransactionCategoryAssignments',
  ],
}

module.exports = config
