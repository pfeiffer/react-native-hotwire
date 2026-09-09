import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';

export type WindowRect = {
  y: number;
  height: number;
};

/**
 * Where a view sits in the window, vertically, with the `ref`/`onLayout` pair
 * that keeps it up to date.
 *
 * Window coordinates rather than the parent-relative box `onLayout` reports:
 * they are the space the chrome publishes its boundaries in, so overlaps are a
 * subtraction.
 */
export function useWindowRect() {
  const ref = useRef<View>(null);
  const [rect, setRect] = useState<WindowRect | null>(null);

  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => {
      // Layout runs for reasons that leave the box alone; skip the re-render then.
      setRect((current) => (current?.y === y && current?.height === height ? current : { y, height }));
    });
  }, []);

  return { ref, onLayout, rect };
}
