import { emptyCategoriesApi as api } from "../emptyCategoriesApi";
const injectedRtkApi = api.injectEndpoints({
  endpoints: (build) => ({
    listTransactionCategories: build.query<
      ListTransactionCategoriesApiResponse,
      ListTransactionCategoriesApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transaction-categories`,
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
      }),
    }),
    createTransactionCategory: build.mutation<
      CreateTransactionCategoryApiResponse,
      CreateTransactionCategoryApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transaction-categories`,
        method: "POST",
        body: queryArg.transactionCategoryCreate,
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
      }),
    }),
    updateTransactionCategory: build.mutation<
      UpdateTransactionCategoryApiResponse,
      UpdateTransactionCategoryApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transaction-categories/${queryArg.categoryId}`,
        method: "PATCH",
        body: queryArg.transactionCategoryUpdate,
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
      }),
    }),
    deleteTransactionCategory: build.mutation<
      DeleteTransactionCategoryApiResponse,
      DeleteTransactionCategoryApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transaction-categories/${queryArg.categoryId}`,
        method: "DELETE",
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
      }),
    }),
    setTransactionCategory: build.mutation<
      SetTransactionCategoryApiResponse,
      SetTransactionCategoryApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transactions/${queryArg.transactionId}/category`,
        method: "PUT",
        body: queryArg.transactionCategoryAssignmentSet,
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
      }),
    }),
    lookupTransactionCategoryAssignments: build.query<
      LookupTransactionCategoryAssignmentsApiResponse,
      LookupTransactionCategoryAssignmentsApiArg
    >({
      query: (queryArg) => ({
        url: `/api/v1/app/transaction-category-assignments`,
        headers: {
          "X-Organization-Id": queryArg["X-Organization-Id"],
        },
        params: {
          transaction_id: queryArg.transactionId,
        },
      }),
    }),
  }),
  overrideExisting: false,
});
export { injectedRtkApi as categoriesApi };
export type ListTransactionCategoriesApiResponse =
  /** status 200 Category list */ EnvelopeTransactionCategoryList;
export type ListTransactionCategoriesApiArg = {
  /** The organisation the caller acts in for this request. Must be one of the bearer's `orgs`, otherwise
    `403 organization_context_forbidden`. Without the header the first organisation of `orgs` is used.
    A value that is not a UUID is `400 validation_error`.
     */
  "X-Organization-Id"?: string;
};
export type CreateTransactionCategoryApiResponse =
  /** status 201 Category created */ EnvelopeTransactionCategory;
export type CreateTransactionCategoryApiArg = {
  /** The organisation the caller acts in for this request. Must be one of the bearer's `orgs`, otherwise
    `403 organization_context_forbidden`. Without the header the first organisation of `orgs` is used.
    A value that is not a UUID is `400 validation_error`.
     */
  "X-Organization-Id"?: string;
  transactionCategoryCreate: TransactionCategoryCreate;
};
export type UpdateTransactionCategoryApiResponse =
  /** status 200 Updated category */ EnvelopeTransactionCategory;
export type UpdateTransactionCategoryApiArg = {
  categoryId: TransactionCategoryId;
  /** The organisation the caller acts in for this request. Must be one of the bearer's `orgs`, otherwise
    `403 organization_context_forbidden`. Without the header the first organisation of `orgs` is used.
    A value that is not a UUID is `400 validation_error`.
     */
  "X-Organization-Id"?: string;
  transactionCategoryUpdate: TransactionCategoryUpdate;
};
export type DeleteTransactionCategoryApiResponse = unknown;
export type DeleteTransactionCategoryApiArg = {
  categoryId: TransactionCategoryId;
  /** The organisation the caller acts in for this request. Must be one of the bearer's `orgs`, otherwise
    `403 organization_context_forbidden`. Without the header the first organisation of `orgs` is used.
    A value that is not a UUID is `400 validation_error`.
     */
  "X-Organization-Id"?: string;
};
export type SetTransactionCategoryApiResponse =
  /** status 200 Current assignment of the transaction */ EnvelopeTransactionCategoryAssignment;
export type SetTransactionCategoryApiArg = {
  transactionId: CoreTransactionId;
  /** The organisation the caller acts in for this request. Must be one of the bearer's `orgs`, otherwise
    `403 organization_context_forbidden`. Without the header the first organisation of `orgs` is used.
    A value that is not a UUID is `400 validation_error`.
     */
  "X-Organization-Id"?: string;
  transactionCategoryAssignmentSet: TransactionCategoryAssignmentSet;
};
export type LookupTransactionCategoryAssignmentsApiResponse =
  /** status 200 Assignments */ EnvelopeTransactionCategoryAssignmentList;
export type LookupTransactionCategoryAssignmentsApiArg = {
  /** Repeatable, 1–100 values */
  transactionId: CoreTransactionId[];
  /** The organisation the caller acts in for this request. Must be one of the bearer's `orgs`, otherwise
    `403 organization_context_forbidden`. Without the header the first organisation of `orgs` is used.
    A value that is not a UUID is `400 validation_error`.
     */
  "X-Organization-Id"?: string;
};
export type Envelope = {
  correlation_id: string;
};
export type TransactionCategoryId = string;
export type TransactionCategoryKind = "system" | "custom";
export type TransactionCategoryCode = string;
export type TransactionCategoryName = string;
export type TransactionCategoryColor =
  "slate" | "blue" | "teal" | "green" | "amber" | "orange" | "red" | "purple";
export type TransactionCategory = {
  category_id: TransactionCategoryId;
  kind: TransactionCategoryKind;
  code: TransactionCategoryCode | null;
  name: TransactionCategoryName;
  color: TransactionCategoryColor;
  created_at: string;
  updated_at: string;
};
export type EnvelopeTransactionCategoryList = Envelope & {
  data: {
    items: TransactionCategory[];
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
export type EnvelopeTransactionCategory = Envelope & {
  data: TransactionCategory;
};
export type ValidationIssue = {
  /** Stable machine-readable identifier, snake_case */
  code: string;
  message: string;
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
export type TransactionCategoryCreate = {
  name: TransactionCategoryName;
  color: TransactionCategoryColor;
};
export type TransactionCategoryUpdate = {
  name?: TransactionCategoryName;
  color?: TransactionCategoryColor;
};
export type CoreTransactionId = string;
export type TransactionCategoryAssignment = {
  transaction_id: CoreTransactionId;
  category_id: TransactionCategoryId | null;
  /** When the current non-null category was set; null when unassigned */
  assigned_at: string | null;
  /** Bearer subject that set the current non-null category; null when unassigned */
  assigned_by: string | null;
};
export type EnvelopeTransactionCategoryAssignment = Envelope & {
  data: TransactionCategoryAssignment;
};
export type TransactionCategoryAssignmentSet = {
  /** `null` clears the category */
  category_id: TransactionCategoryId | null;
};
export type EnvelopeTransactionCategoryAssignmentList = Envelope & {
  data: {
    items: TransactionCategoryAssignment[];
  };
};
export const {
  useListTransactionCategoriesQuery,
  useCreateTransactionCategoryMutation,
  useUpdateTransactionCategoryMutation,
  useDeleteTransactionCategoryMutation,
  useSetTransactionCategoryMutation,
  useLookupTransactionCategoryAssignmentsQuery,
} = injectedRtkApi;
