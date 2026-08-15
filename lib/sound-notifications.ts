import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

// Web Audio API tone generator helper
function playAudioTone(frequency: number, type: OscillatorType = 'sine', durationSec: number = 0.15) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch {
    // silent fallback
  }
}

/** Play a dual-tone notification chime */
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

/** Gate Lock/Unlock Notification */
export function notifyGateToggle(isLocked: boolean, senderName?: string) {
  playChime(isLocked ? 'alert' : 'success');
  const namePart = senderName ? ` by ${senderName}` : '';
  speakNotification(`Gate ${isLocked ? 'locked' : 'unlocked'}${namePart}`);
}

/** Motor Start/Stop Notification */
export function notifyMotorAction(action: 'start' | 'stop' | 'expire', tank?: 'top' | 'down', senderName?: string) {
  if (action === 'start') {
    playChime('info');
    const tankName = tank === 'top' ? 'Top tank' : 'Down tank';
    speakNotification(`${tankName} motor turned on${senderName ? ` by ${senderName}` : ''}`);
  } else if (action === 'expire') {
    playChime('alert');
    speakNotification('Motor timer finished. Motor turned off.');
  } else {
    playChime('info');
    speakNotification(`Motor turned off${senderName ? ` by ${senderName}` : ''}`);
  }
}

/** Incoming Ring Notification */
export function notifyRingReceived(senderName: string) {
  playChime('ring');
  speakNotification(`Attention! ${senderName} is ringing your device!`);
}

/** Emergency SOS Notification */
export function notifySosAlert(senderName: string) {
  playChime('error');
  speakNotification(`Emergency SOS alert! ${senderName} needs help!`);
}

/** New Message Notification */
export function notifyNewMessage(senderName: string, textSnippet?: string) {
  playChime('success');
  speakNotification(`New message from ${senderName}`);
}

/** Task Operation Notification */
export function notifyTaskAction(action: 'created' | 'completed', title: string, userName?: string) {
  playChime(action === 'completed' ? 'success' : 'info');
  if (action === 'completed') {
    speakNotification(`Task "${title}" was completed by ${userName ?? 'a family member'}`);
  } else {
    speakNotification(`New task added: ${title}`);
  }
}
