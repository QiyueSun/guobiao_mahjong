import { useState, useEffect, useRef } from 'react';

export function useCountdown(deadlineMs: number | null): number {
  const [remaining, setRemaining] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!deadlineMs) { setRemaining(0); return; }

    const tick = () => {
      const left = Math.max(0, deadlineMs - Date.now());
      setRemaining(Math.ceil(left / 1000));
      if (left > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [deadlineMs]);

  return remaining;
}
