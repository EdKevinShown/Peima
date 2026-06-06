import { lazy, Suspense } from "react";
import LoadingState from "../components/common/LoadingState";

/**
 * Route-level code split: dynamic import + Suspense fallback.
 * @param {() => Promise<{ default: React.ComponentType<any> }>} importFn
 */
export function lazyPage(importFn) {
  const LazyComponent = lazy(importFn);
  return function LazyPageRoute(props) {
    return (
      <Suspense fallback={<LoadingState label="加载中…" />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
