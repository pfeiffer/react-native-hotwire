import { requireNativeViewManager } from 'expo-modules-core';
import type React from 'react';
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

import type {
  ContentInset,
  ContentProcessDidTerminateEvent,
  DialogEvent,
  ErrorEvent,
  FormSubmissionEvent,
  LoadEvent,
  MessageEvent,
  OpenExternalUrlEvent,
  ProgressViewOffset,
  VisitProposal,
} from './types';

// Must match the View definition in HotwiredModule.swift / HotwiredModule.kt.
export interface NativeVisitableViewProps {
  url: string;
  sessionHandle: string;
  applicationNameForUserAgent?: string;
  pullToRefreshEnabled: boolean;
  scrollEnabled: boolean;
  contentInset?: ContentInset;
  progressViewOffset?: ProgressViewOffset;
  webViewDebuggingEnabled: boolean;
  onLoad?: (e: NativeSyntheticEvent<LoadEvent>) => void;
  onMessage?: (e: NativeSyntheticEvent<MessageEvent>) => void;
  onError?: (e: NativeSyntheticEvent<ErrorEvent>) => void;
  onVisitProposal?: (e: NativeSyntheticEvent<VisitProposal>) => void;
  onWebAlert?: (e: NativeSyntheticEvent<DialogEvent>) => void;
  onWebConfirm?: (e: NativeSyntheticEvent<DialogEvent>) => void;
  onOpenExternalUrl?: (e: NativeSyntheticEvent<OpenExternalUrlEvent>) => void;
  onCrossOriginRedirect?: (e: NativeSyntheticEvent<OpenExternalUrlEvent>) => void;
  onFormSubmissionStarted?: (e: NativeSyntheticEvent<FormSubmissionEvent>) => void;
  onFormSubmissionFinished?: (e: NativeSyntheticEvent<FormSubmissionEvent>) => void;
  onShowLoading?: () => void;
  onHideLoading?: () => void;
  onContentProcessDidTerminate?: (
    e: NativeSyntheticEvent<ContentProcessDidTerminateEvent>
  ) => void;
  style?: StyleProp<ViewStyle>;
}

// View functions declared with AsyncFunction inside the native View definition.
export interface NativeVisitableViewRef {
  injectJavaScript(script: string): Promise<void>;
  reload(): Promise<void>;
  refresh(): Promise<void>;
  sendAlertResult(): Promise<void>;
  sendConfirmResult(result: boolean): Promise<void>;
}

export const NativeVisitableView: React.ComponentType<
  NativeVisitableViewProps & { ref?: React.Ref<NativeVisitableViewRef> }
> = requireNativeViewManager('Hotwire');
