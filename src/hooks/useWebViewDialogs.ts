import { useCallback } from 'react';
import { Alert, type NativeSyntheticEvent } from 'react-native';

import type { NativeVisitableViewRef } from '../NativeVisitableView';
import type { DialogEvent } from '../types';

export type OnAlert = (message: string, okPressCallback: () => void) => void;
export type OnConfirm = (message: string, confirmCallback: (value: boolean) => void) => void;

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
    ({ nativeEvent: { message } }: NativeSyntheticEvent<DialogEvent>) => {
      const done = () => nativeRef.current?.sendAlertResult();

      if (onAlert) {
        onAlert(message, done);
      } else {
        Alert.alert(message, undefined, [{ text: 'OK', onPress: done }]);
      }
    },
    [onAlert, nativeRef]
  );

  const handleConfirm = useCallback(
    ({ nativeEvent: { message } }: NativeSyntheticEvent<DialogEvent>) => {
      const done = (value: boolean) => nativeRef.current?.sendConfirmResult(value);

      if (onConfirm) {
        onConfirm(message, done);
      } else {
        Alert.alert(message, undefined, [
          { text: 'OK', onPress: () => done(true) },
          { text: 'Cancel', onPress: () => done(false) },
        ]);
      }
    },
    [onConfirm, nativeRef]
  );

  return { handleAlert, handleConfirm };
}
