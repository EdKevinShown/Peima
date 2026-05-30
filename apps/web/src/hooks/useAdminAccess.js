import { useEffect, useState } from "react";
import { getAdminCapabilities } from "../api/admin";
import { getTestMatchingCapabilities } from "../api/testMatch";

/**
 * Admin = batch-match trigger capability (same gate as server admin tools).
 * Test flags are only exposed in UI when isAdmin (see AdminOnly).
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
        const [adminCap, testCap] = await Promise.all([
          getAdminCapabilities().catch(() => ({ batchMatchTrigger: false })),
          getTestMatchingCapabilities().catch(() => ({
            testBatchMatchTrigger: false,
            testPreviewPoolSeed: false,
          })),
        ]);
        if (!cancelled) {
          setIsAdmin(Boolean(adminCap?.batchMatchTrigger));
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
