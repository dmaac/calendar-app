/**
 * feedback.service.ts — In-app feedback submission
 *
 * Allows users to submit bug reports, feature requests, complaints, and praise
 * directly from the app. Device info is collected automatically.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { api } from './api';

export type FeedbackType = 'bug' | 'feature' | 'complaint' | 'praise';

export interface FeedbackPayload {
  type: FeedbackType;
  message: string;
  screen?: string;
}

export interface FeedbackResponse {
  id: number;
  user_id: number;
  type: FeedbackType;
  message: string;
  screen: string | null;
  app_version: string | null;
  device_model: string | null;
  device_os: string | null;
  device_os_version: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Submit in-app feedback. Automatically attaches device info and app version.
 *
 * @param payload - type, message, and optional screen name
 * @returns The created feedback entry from the server
 */
export const submitFeedback = async (
  payload: FeedbackPayload,
): Promise<FeedbackResponse> => {
  const body = {
    type: payload.type,
    message: payload.message,
    screen: payload.screen ?? null,
    app_version: Constants.expoConfig?.version ?? null,
    device_model: Device.modelName ?? null,
    device_os: Platform.OS ?? null,
    device_os_version: Platform.Version ? String(Platform.Version) : null,
  };

  const res = await api.post('/api/feedback', body);
  return res.data;
};
