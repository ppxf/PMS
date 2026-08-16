import { QueryClient } from '@tanstack/vue-query'

import { AppError } from '@/services/http'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        if (error instanceof AppError && error.status && [401, 403, 404].includes(error.status)) {
          return false
        }

        return failureCount < 2
      },
    },
    mutations: {
      retry: false,
    },
  },
})
