import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

// Configure Expo Notification handler for native devices
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
    // fallback if uninitialized
  }
}

let audioCtx: AudioContext | null = null;
let alarmInterval: any = null;

// Initialize Web Audio Context on user interaction
function getAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Global window listener to unlock Web Audio Context on first interaction
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const unlockAudio = () => {
    getAudioContext();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
}

/** Request system notification permissions for Web and Native mobile */
export async function requestNotificationPermissions(): Promise<boolean> {
  let granted = false;

  // 1. Web Notification Permission
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        granted = true;
      } else if (Notification.permission !== 'denied') {
        const res = await Notification.requestPermission();
        granted = res === 'granted';
      }
    } catch {
      // silent
    }
  }

  // 2. Native Expo Notification Permission & Android Channel Setup
  if (Platform.OS !== 'web') {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      granted = finalStatus === 'granted';

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
    } catch {
      // silent
    }
  }

  return granted;
}

/** Show notification in device notification bar (Status Bar) */
export async function showSystemNotification(title: string, body: string, isAlarm = false) {
  // Web System Notification
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: isAlarm ? 'familyhub-alarm' : 'familyhub-notice',
          requireInteraction: isAlarm,
        });
        notif.onclick = () => {
          if (typeof window !== 'undefined') {
            window.focus();
          }
        };
      }
    } catch {
      // silent
    }
  }

  // Native System Notification in Android/iOS notification drawer
  if (Platform.OS !== 'web') {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: isAlarm
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // show immediately
      });
    } catch {
      // silent
    }
  }
}

/** Play synthesized audio tone */
export function playAudioTone(frequency: number, type: OscillatorType = 'sine', durationSec: number = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch {
    // silent
  }
}

/** Play audio chime & trigger haptics */
export function playChime(type: 'success' | 'alert' | 'ring' | 'info' | 'error') {
  if (Platform.OS === 'web') {
    if (type === 'success') {
      playAudioTone(523.25, 'sine', 0.12); // C5
      setTimeout(() => playAudioTone(659.25, 'sine', 0.2), 120); // E5
    } else if (type === 'alert') {
      playAudioTone(880, 'square', 0.15); // A5
      setTimeout(() => playAudioTone(440, 'square', 0.25), 150); // A4
    } else if (type === 'ring') {
      playAudioTone(800, 'triangle', 0.1);
      setTimeout(() => playAudioTone(1000, 'triangle', 0.1), 100);
      setTimeout(() => playAudioTone(800, 'triangle', 0.1), 200);
      setTimeout(() => playAudioTone(1000, 'triangle', 0.15), 300);
    } else if (type === 'error') {
      playAudioTone(300, 'sawtooth', 0.2);
      setTimeout(() => playAudioTone(200, 'sawtooth', 0.3), 200);
    } else {
      playAudioTone(587.33, 'sine', 0.15); // D5
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'error' || type === 'alert') {
        navigator.vibrate([300, 100, 300]);
      } else {
        navigator.vibrate(100);
      }
    }
  }

  if (Platform.OS !== 'web') {
    if (type === 'error' || type === 'alert') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }
}

/** Speak text via Text-To-Speech */
export function speakNotification(text: string) {
  try {
    Speech.stop();
    Speech.speak(text, { language: 'en', pitch: 1.0, rate: 0.95 });
  } catch {
    // silent
  }
}

/** Start continuous alarm loop with repeating voice, alarm chime, vibration, and status bar alert */
export function startContinuousAlarm(title: string, body: string, voiceMsg: string) {
  stopContinuousAlarm();

  // Show status bar notification immediately
  showSystemNotification(title, body, true);

  const runAlarmStep = () => {
    playChime('error');
    speakNotification(voiceMsg);

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 1000]);
    } else if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  runAlarmStep();
  alarmInterval = setInterval(runAlarmStep, 3500);
}

/** Stop continuous alarm loop */
export function stopContinuousAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  try {
    Speech.stop();
  } catch {
    // silent
  }
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

/** Gate Lock/Unlock Notification */
export function notifyGateToggle(isLocked: boolean, senderName?: string) {
  playChime(isLocked ? 'alert' : 'success');
  const namePart = senderName ? ` by ${senderName}` : '';
  const text = `Gate ${isLocked ? 'locked' : 'unlocked'}${namePart}`;
  speakNotification(text);
  showSystemNotification('Family Gate Status', text);
}

/** Motor Start/Stop Notification */
export function notifyMotorAction(action: 'start' | 'stop' | 'expire', tank?: 'top' | 'down', senderName?: string) {
  if (action === 'start') {
    playChime('info');
    const tankName = tank === 'top' ? 'Top tank' : 'Down tank';
    const text = `${tankName} motor turned on${senderName ? ` by ${senderName}` : ''}`;
    speakNotification(text);
    showSystemNotification('Motor Machine Started', text);
  } else if (action === 'expire') {
    startContinuousAlarm(
      '⚠️ MOTOR EXPIRED: TURN OFF MACHINE!',
      'Water tank motor timer finished. Please turn off the machine!',
      'Attention! Water tank motor timer finished. Please check water tank and turn off machine!'
    );
  } else {
    stopContinuousAlarm();
    playChime('info');
    const text = `Motor turned off${senderName ? ` by ${senderName}` : ''}`;
    speakNotification(text);
    showSystemNotification('Motor Machine Stopped', text);
  }
}

/** Incoming Ring Notification */
export function notifyRingReceived(senderName: string) {
  playChime('ring');
  const text = `Attention! ${senderName} is ringing your device!`;
  speakNotification(text);
  showSystemNotification('Incoming Ring Alert', text, true);
}

/** Emergency SOS Notification */
export function notifySosAlert(senderName: string) {
  startContinuousAlarm(
    '🚨 EMERGENCY SOS ALERT!',
    `${senderName} triggered an emergency SOS alert!`,
    `Emergency SOS alert! ${senderName} needs help!`
  );
}

/** New Message Notification */
export function notifyNewMessage(senderName: string, textSnippet?: string) {
  playChime('success');
  const text = `New message from ${senderName}${textSnippet ? `: "${textSnippet.substring(0, 50)}"` : ''}`;
  speakNotification(`New message from ${senderName}`);
  showSystemNotification(`Message from ${senderName}`, textSnippet || 'Tap to view message');
}

/** Task Operation Notification */
export function notifyTaskAction(action: 'created' | 'completed', title: string, userName?: string) {
  playChime(action === 'completed' ? 'success' : 'info');
  if (action === 'completed') {
    const text = `Task "${title}" was completed by ${userName ?? 'a family member'}`;
    speakNotification(text);
    showSystemNotification('Task Completed', text);
  } else {
    const text = `New task added: ${title}`;
    speakNotification(text);
    showSystemNotification('New Task Added', text);
  }
}
