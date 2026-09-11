import { emptyTransactionsApi as api } from "../emptyTransactionsApi";
const injectedRtkApi = api.injectEndpoints({
  endpoints: (build) => ({
    listTransactions: build.query<
      ListTransactionsApiResponse,
      ListTransactionsApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transactions`,
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
        params: {
          account_id: queryArg.accountId,
          wallet_id: queryArg.walletId,
          page: queryArg.page,
          page_size: queryArg.pageSize,
          kind: queryArg.kind,
          status: queryArg.status,
          sort_order: queryArg.sortOrder,
          date_from: queryArg.dateFrom,
          date_to: queryArg.dateTo,
          presentation_currency: queryArg.presentationCurrency,
          amount_min_minor: queryArg.amountMinMinor,
          amount_max_minor: queryArg.amountMaxMinor,
          search: queryArg.search,
        },
      }),
    }),
    getTransaction: build.query<
      GetTransactionApiResponse,
      GetTransactionApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transactions/${queryArg.transactionId}`,
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
      }),
    }),
  }),
  overrideExisting: false,
});
export { injectedRtkApi as transactionsApi };
export type ListTransactionsApiResponse =
  /** status 200 Transaction list */ EnvelopeTransactionList;
export type ListTransactionsApiArg = {
  /** Filter transactions to all wallets under this account */
  accountId?: string;
  /** Filter transactions to a single wallet */
  walletId?: CoreWalletId;
  page?: number;
  pageSize?: number;
  kind?: TransactionKind;
  /** Repeatable filter; multiple values are OR-ed (e.g. `status=pending&status=confirmed`) */
  status?: TransactionStatus[];
  sortOrder?: SortOrder;
  /** Inclusive lower bound on `created_at` (RFC 3339 with offset; else 422). Must be ≤ `date_to` when both set. */
  dateFrom?: string;
  /** Inclusive upper bound on `created_at` (RFC 3339 with offset; else 422). Must be ≥ `date_from` when both set. */
  dateTo?: string;
  /** Currency the client wants amounts expressed in - the cabinet's currency selector. Presentation only: balances are held and settled in the wallet currency, and nothing is stored converted. Omit it to get amounts in the account's own currency, which is what a client without a selector does.
    
    Matched case-insensitively. A currency the exchange-rate service cannot price is never an error: the response reports what it could not convert rather than failing, because the underlying figures are real and already read. Each operation says where it reports that.
     */
  presentationCurrency?: CurrencyTicker;
  /** Inclusive lower bound on `amount_minor`, read in `presentation_currency` when one is supplied and in each transaction's own currency otherwise. Must be ≤ `amount_max_minor` when both are set (else 422).
   */
  amountMinMinor?: number;
  /** Inclusive upper bound on `amount_minor`, read in `presentation_currency` when one is supplied and in each transaction's own currency otherwise. Must be ≥ `amount_min_minor` when both are set (else 422).
   */
  amountMaxMinor?: number;
  /** Narrow substring match against `transaction_id`, `reference`, and `wallet_id` only (not counterparty names or free-text memo).
   */
  search?: string;
  /** The organisation the caller acts in for this request. A user may be an ACTIVE member of several organisations; the client names one per request so two browser tabs never leak into each other. The value must be an organisation where the bearer subject has an ACTIVE membership, otherwise `403 organization_context_forbidden`. Without the header the caller's first ACTIVE membership is used. A value that is not a UUID is `400 validation_error`.
   */
  "X-Organization-Id"?: string;
};
export type GetTransactionApiResponse =
  /** status 200 Transaction detail */ EnvelopeTransaction;
export type GetTransactionApiArg = {
  transactionId: CoreTransactionId;
  /** The organisation the caller acts in for this request. A user may be an ACTIVE member of several organisations; the client names one per request so two browser tabs never leak into each other. The value must be an organisation where the bearer subject has an ACTIVE membership, otherwise `403 organization_context_forbidden`. Without the header the caller's first ACTIVE membership is used. A value that is not a UUID is `400 validation_error`.
   */
  "X-Organization-Id"?: string;
};
export type Envelope = {
  correlation_id: string;
};
export type CoreTransactionId = string;
export type CoreWalletId = string;
export type TransactionKind = "deposit" | "transfer" | "withdrawal" | "receive";
export type TransactionDirection = "in" | "out";
export type TransactionStatus =
  "initiated" | "pending" | "confirmed" | "failed";
export type TransactionCounterparty = {
  name: string | null;
  bank_name: string | null;
  bank_routing_number: string | null;
  /** Last four alphanumeric characters of a masked provider value */
  account_last_four: string | null;
  rail: string | null;
  description: string | null;
};
export type TransactionRecipientContext = {
  /** True when the counterparty of a confirmed incoming transaction can be saved as a recipient. */
  can_save: boolean;
  /** Existing org-scoped recipient for this counterparty, if any */
  recipient_id: string | null;
};
export type CoreTransferId = string;
export type CoreWithdrawalId = string;
export type Transaction = {
  transaction_id: CoreTransactionId;
  account_id?: string | null;
  wallet_id?: CoreWalletId | null;
  kind: TransactionKind;
  direction: TransactionDirection;
  status: TransactionStatus;
  amount_minor: number;
  asset: "USDC";
  /** Compatibility display field. New clients should use `counterparty.name`.
   */
  counterparty_name?: string | null;
  counterparty?: TransactionCounterparty | null;
  recipient_context: TransactionRecipientContext;
  reference?: string | null;
  fee_amount_minor?: number | null;
  source_wallet_id?: CoreWalletId | null;
  destination_wallet_id?: CoreWalletId | null;
  /** Human-readable display name of `source_wallet_id` from the local wallet registry. Populated on transaction detail; null when the id is absent or unknown. Not `source_account_name`.
   */
  source_wallet_name?: string | null;
  /** Human-readable display name of `destination_wallet_id` from the local wallet registry. Populated on transaction detail; null when the id is absent or unknown. Not `destination_account_name`.
   */
  destination_wallet_name?: string | null;
  /** Transfer aggregate that produced this ledger leg */
  transfer_id?: CoreTransferId | null;
  /** Withdrawal aggregate that produced this debit leg */
  withdrawal_id?: CoreWithdrawalId | null;
  /** Machine-readable terminal failure reason from the ledger */
  failure_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
export type PageMeta = {
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
};
export type CurrencyTicker = string;
export type TransactionAmountFilter = {
  /** Currency the bounds were read in - the requested `presentation_currency`. Unlike the account total, this never falls back to another currency: a range answered in a currency the client did not ask for would return a set nobody requested.
   */
  currency: CurrencyTicker;
  /** Oldest `as_of` among the rates used, UTC - the comparison is no fresher than its weakest rate. Null when nothing needed a rate, which is the case when every transaction was already in `currency`.
   */
  as_of?: string | null;
  /** True when any rate used was stale, so the bounds were applied at a price the market may have moved past.
   */
  stale: boolean;
  /** Currencies excluded from the result because no rate was available to value them against `currency`. Empty when everything could be priced. A page that came back empty only because of this says so here instead of looking like an ordinary empty result.
   */
  unpriced_currencies: CurrencyTicker[];
};
export type EnvelopeTransactionList = Envelope & {
  data: {
    items: Transaction[];
    page: PageMeta;
    /** How the amount bounds were interpreted. Null when `presentation_currency` was not supplied, in which case the bounds kept their per-transaction meaning and nothing was valued.
     */
    amount_filter?: TransactionAmountFilter | null;
  };
};
export type ErrorResponse = {
  type: string;
  correlation_id: string;
  error: {
    code: string;
    message: string;
    data?: {
      [key: string]: any;
    };
  };
};
export type ValidationIssue = {
  /** Stable machine-readable identifier, snake_case. */
  code: string;
  /** Human-readable English string. */
  message: string;
  /** Optional context; omitted or `{}` when empty. */
  data?: {
    [key: string]: any;
  };
};
export type ValidationErrorResponse = {
  type: "ValidationError";
  correlation_id: string;
  error: {
    [key: string]: ValidationIssue[];
  };
};
export type SortOrder = "asc" | "desc";
export type EnvelopeTransaction = Envelope & {
  data: Transaction;
};
export const { useListTransactionsQuery, useGetTransactionQuery } =
  injectedRtkApi;
