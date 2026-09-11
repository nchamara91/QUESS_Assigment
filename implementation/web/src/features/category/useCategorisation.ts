import { useCallback, useMemo, useState } from 'react'

import type { TransactionCategoryAssignment } from '../../api/generated/categoriesApi'
import { useSetTransactionCategoryMutation } from '../../api/generated/categoriesApi'
import type { ApiError } from '../../lib/errors'
import { errorMessage } from '../../lib/errors'

export type CategoryChanges = {
  categoryIdFor: (transactionId: string) => string | null
  pendingFor: (transactionId: string) => boolean
  errorFor: (transactionId: string) => string | undefined
  setCategory: (transactionId: string, categoryId: string | null) => void
}

/**
 * Optimistic category changes with rollback.
 *
 * The server is the source of truth (``assignments``); a change is applied on
 * top as a local override immediately, and dropped again if the request fails.
 * That keeps the optimistic and the settled state in one place and makes the
 * rollback a single deletion.
 */
export function useCategorisation(
  assignments: Map<string, TransactionCategoryAssignment>,
): CategoryChanges {
  const [overrides, setOverrides] = useState<Record<string, string | null>>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [setTransactionCategory] = useSetTransactionCategoryMutation()

  const setCategory = useCallback(
    (transactionId: string, categoryId: string | null): void => {
      setOverrides((prev) => ({ ...prev, [transactionId]: categoryId }))
      setPending((prev) => ({ ...prev, [transactionId]: true }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[transactionId]
        return next
      })

      void setTransactionCategory({
        transactionId,
        transactionCategoryAssignmentSet: { category_id: categoryId },
      })
        .unwrap()
        .catch((error: unknown) => {
          setOverrides((prev) => {
            const next = { ...prev }
            delete next[transactionId]
            return next
          })
          setErrors((prev) => ({ ...prev, [transactionId]: errorMessage(error as ApiError) }))
        })
        .finally(() => {
          setPending((prev) => ({ ...prev, [transactionId]: false }))
        })
    },
    [setTransactionCategory],
  )

  const categoryIdFor = useCallback(
    (transactionId: string): string | null => {
      if (transactionId in overrides) {
        return overrides[transactionId] ?? null
      }
      return assignments.get(transactionId)?.category_id ?? null
    },
    [assignments, overrides],
  )

  const pendingFor = useCallback((transactionId: string): boolean => pending[transactionId] ?? false, [pending])
  const errorFor = useCallback(
    (transactionId: string): string | undefined => errors[transactionId],
    [errors],
  )

  return useMemo(
    () => ({ categoryIdFor, pendingFor, errorFor, setCategory }),
    [categoryIdFor, pendingFor, errorFor, setCategory],
  )
}
