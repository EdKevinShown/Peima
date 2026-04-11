/**
 * P5 operations / suggestion-center DTO shapes (shared between API and clients).
 */

export type P5SuggestionCenterQueryFilter = {
  status?: string;
  priority?: string[];
  category?: string[];
  assignedToOperatorId?: string;
  userId?: string;
  /** When set, restricts export / queries to these suggestion ids. */
  suggestionIds?: string[];
  createdAfter?: string;
  createdBefore?: string;
  resolvedAfter?: string;
  resolvedBefore?: string;
};

/** Row shape returned from suggestion-center repository (includes optional user join fields). */
export type P5SuggestionCenterItem = {
  id: string;
  userId: string;
  status: string;
  sourceType: string;
  sourceVersion: string;
  proposedPatch: unknown;
  priority: string;
  category: string;
  assignedToOperatorId: string | null;
  operatorNotes: string | null;
  versionNumber: number;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  userPhone?: string;
};

export type P5SuggestionCenterStats = {
  totalCount: number;
  pendingCount: number;
  acceptedCount: number;
  dismissedCount: number;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: {
    pending: number;
    accepted: number;
    dismissed: number;
  };
};

export type P5SuggestionCenterListResponse = {
  items: P5SuggestionCenterItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: P5SuggestionCenterStats;
};

export type P5PermissionContext = {
  userId: string;
  roles: string[];
  permissions: string[];
};

export type P5AuditLog = {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  status?: string | null;
  createdAt: Date | string;
};
