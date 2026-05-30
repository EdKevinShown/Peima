import { useAdminAccess } from "../../hooks/useAdminAccess";

/**
 * Renders children only for admin-capable users.
 * Optional fallback while loading (default: null).
 */
export default function AdminOnly({ children, fallback = null, loadingFallback = null }) {
  const { loading, isAdmin } = useAdminAccess();
  if (loading) return loadingFallback;
  if (!isAdmin) return fallback;
  return children;
}
