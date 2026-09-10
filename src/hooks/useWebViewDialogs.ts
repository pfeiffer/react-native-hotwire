import { useCallback } from 'react';
import { Alert, type NativeSyntheticEvent } from 'react-native';

import type { NativeVisitableViewRef } from '../NativeVisitableView';
import type { DialogEvent } from '../types';

/** `window.alert` from the page; call `respond` to let the page continue. */
export type OnAlert = (event: DialogEvent, respond: () => void) => void;
/** `window.confirm` from the page; call `respond` with the answer to let the page continue. */
export type OnConfirm = (event: DialogEvent, respond: (ok: boolean) => void) => void;

/**
 * Handles window.alert / window.confirm from the page. The native side blocks the page
 * until sendAlertResult / sendConfirmResult is called, so every path must call it.
 */
export function useWebViewDialogs(
  nativeRef: React.RefObject<NativeVisitableViewRef | null>,
  onAlert: OnAlert | undefined,
  onConfirm: OnConfirm | undefined
) {
  const handleAlert = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<DialogEvent>) => {
      const done = () => nativeRef.current?.sendAlertResult();

      if (onAlert) {
        onAlert(nativeEvent, done);
      } else {
        Alert.alert(nativeEvent.message, undefined, [{ text: 'OK', onPress: done }]);
      }
    },
    [onAlert, nativeRef]
  );

  const handleConfirm = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<DialogEvent>) => {
      const done = (value: boolean) => nativeRef.current?.sendConfirmResult(value);

      if (onConfirm) {
        onConfirm(nativeEvent, done);
      } else {
        Alert.alert(nativeEvent.message, undefined, [
          { text: 'OK', onPress: () => done(true) },
          { text: 'Cancel', onPress: () => done(false) },
        ]);
      }
    },
    [onConfirm, nativeRef]
  );

  return { handleAlert, handleConfirm };
}
