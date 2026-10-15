import { useCallback, useRef, useState } from 'react';

/** Standard controlled/uncontrolled prop pair: `value` wins when defined, otherwise internal state is used. */
export function useControlled<T>(value: T | undefined, initial: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState(initial);
  const controlled = value !== undefined;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const set = useCallback(
    (v: T) => {
      if (!controlled) setInner(v);
      onChangeRef.current?.(v);
    },
    [controlled],
  );
  return [controlled ? (value as T) : inner, set];
}
