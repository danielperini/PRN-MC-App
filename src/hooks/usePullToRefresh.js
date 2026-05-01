import { useEffect, useRef, useState } from 'react';

/**
 * Pull-to-refresh hook for mobile
 * Triggers refresh when user pulls down at the top of a scrollable container
 */
export function usePullToRefresh(onRefresh, { threshold = 80, damping = 0.5 } = {}) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e) => {
      startYRef.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e) => {
      const currentY = e.touches[0].clientY;
      const scrollTop = container.scrollTop;

      // Only trigger pull when at the top
      if (scrollTop === 0) {
        const distance = currentY - startYRef.current;
        if (distance > 0) {
          setIsPulling(true);
          setPullDistance(Math.min(distance * damping, threshold * 1.5));
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance >= threshold) {
        onRefresh();
      }
      setIsPulling(false);
      setPullDistance(0);
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, threshold, damping, onRefresh]);

  return { containerRef, isPulling, pullDistance };
}