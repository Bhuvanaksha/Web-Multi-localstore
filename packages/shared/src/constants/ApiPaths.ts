/**
 * API path constants — the single source of truth for URL generation
 * (frontend) and route mounting (backend).
 */
export const API = {
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    VERIFY: '/auth/verify',
  },
  RESOURCES: {
    LIST: '/resources',
    CREATE: '/resources',
    DETAIL: (id: string) => `/resources/${id}`,
    UPDATE: (id: string) => `/resources/${id}`,
    DELETE: (id: string) => `/resources/${id}`,
    SUBMIT: (id: string) => `/resources/${id}/submit`,
    APPROVE: (id: string) => `/resources/${id}/approve`,
    REJECT: (id: string) => `/resources/${id}/reject`,
    REQUEST_CHANGES: (id: string) => `/resources/${id}/request-changes`,
    MINE: '/resources/mine',
  },
  VOTES: {
    TOGGLE: '/votes/toggle',
  },
  COMMENTS: {
    LIST: (id: string) => `/resources/${id}/comments`,
    CREATE: '/comments',
  },
  SEARCH: {
    QUERY: '/search',
  },
  UPLOADS: {
    PRESIGN: '/uploads/presign',
  },
  NOTIFICATIONS: {
    LIST: '/notifications',
    READ: (id: string) => `/notifications/${id}/read`,
  },
  PROVIDER_LISTINGS: {
    LIST: '/provider/listings',
    CREATE: '/provider/listings',
    MINE: '/provider/listings/mine',
    DETAIL: (id: string) => `/provider/listings/${id}`,
    UPDATE: (id: string) => `/provider/listings/${id}`,
    DELETE: (id: string) => `/provider/listings/${id}`,
  },
  ORDERS: {
    CREATE: '/orders',
    MINE: '/orders/mine',
    PROVIDER_INBOX: '/orders/provider/inbox',
    STATUS: (id: string) => `/orders/${id}/status`,
    PAY: (id: string) => `/orders/${id}/pay`,
  },
  ADMIN: {
    ACTIVITY: '/admin/activity',
    ORDERS: '/admin/orders',
    ORDERS_EXPORT: '/admin/orders/export',
  },
} as const;

export type ApiPath = (typeof API)[keyof typeof API];
