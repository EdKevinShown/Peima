import { useEffect, useState } from "react";
import { fetchAdminCapabilities } from "../api/admin";
import { getTestMatchingCapabilities } from "../api/testMatch";

/**
 * Admin nav/tools gate: user must have VIEW_ADMIN_CAPABILITIES (200 from /admin/capabilities).
 * batchMatchTrigger inside capabilities is a separate flag for batch-match UI.
 */
export function useAdminAccess() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [testCaps, setTestCaps] = useState({
    testBatchMatchTrigger: false,
    testPreviewPoolSeed: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem("peimaToken");
        if (!token) {
          if (!cancelled) {
            setIsAdmin(false);
            setTestCaps({ testBatchMatchTrigger: false, testPreviewPoolSeed: false });
          }
          return;
        }
        const [adminResult, testCap] = await Promise.all([
          fetchAdminCapabilities(),
          getTestMatchingCapabilities().catch(() => ({
            testBatchMatchTrigger: false,
            testPreviewPoolSeed: false,
          })),
        ]);
        if (!cancelled) {
          setIsAdmin(adminResult.ok);
          setTestCaps({
            testBatchMatchTrigger: Boolean(testCap?.testBatchMatchTrigger),
            testPreviewPoolSeed: Boolean(testCap?.testPreviewPoolSeed),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading,
    isAdmin,
    /** Server allows test batch-match for allowlisted users (UI still admin-only). */
    testBatchMatchTrigger: testCaps.testBatchMatchTrigger,
    testPreviewPoolSeed: testCaps.testPreviewPoolSeed,
  };
}
