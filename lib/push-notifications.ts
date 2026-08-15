import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

/** Configure notification handler behavior */
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });
  } catch {
    // silent
  }
}

/** Register device for Expo Push Token and update Supabase profiles table */
export async function registerForPushNotificationsAsync(userId?: string): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'web') {
    // Web push permission fallback check
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          await Notification.requestPermission();
        }
      } catch {
        // silent
      }
    }
    return null;
  }

  try {
    if (!Device.isDevice) {
      console.log('Push notifications require physical device');
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    // Get Expo Push Token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    token = tokenData.data;

    // Set Android high priority channels
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('familyhub-alarms', {
        name: 'Family Hub Emergency & Motor Alarms',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: '#EF4444',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: 'default',
      });
    }

    // Save token to Supabase profiles table if userId is provided
    if (userId && token) {
      await savePushTokenToProfile(userId, token);
    }
  } catch (err) {
    console.error('Error fetching Expo Push Token:', err);
  }

  return token;
}

/** Save push token to user profile in Supabase */
export async function savePushTokenToProfile(userId: string, token: string) {
  try {
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch (err) {
    console.error('Error saving push_token to profile:', err);
  }
}

/** Send Expo Push Notification to a list of Expo push tokens */
export async function sendExpoPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, any> = {}
) {
  const validTokens = tokens.filter((t) => t && t.startsWith('ExponentPushToken'));
  if (validTokens.length === 0) return false;

  const messages = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    channelId: 'familyhub-alarms',
    priority: 'high',
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error sending Expo push notification:', error);
    return false;
  }
}
