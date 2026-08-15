import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { supabase } from './supabase';

type RecordState = 'idle' | 'recording' | 'stopped';

export function useVoiceRecorder() {
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordingRef = useRef<typeof Audio.Recording.prototype | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Configure audio mode on mount
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          shouldDuckAndroid: true,
        });
      } catch {
        // Web or permission not granted — silent
      }
    })();
    return () => {
      stopTimer();
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        // Web audio recording via MediaRecorder
        return false;
      }
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return false;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setRecordState('recording');
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
      return true;
    } catch {
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{ uri: string; duration: number } | null> => {
    stopTimer();
    if (!recordingRef.current) return null;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const duration = recordSeconds;
      setRecordState('stopped');
      setRecordSeconds(0);
      recordingRef.current = null;
      if (!uri) return null;
      return { uri, duration };
    } catch {
      recordingRef.current = null;
      setRecordState('idle');
      return null;
    }
  }, [recordSeconds]);

  const cancelRecording = useCallback(async () => {
    stopTimer();
    if (!recordingRef.current) {
      setRecordState('idle');
      return;
    }
    try {
      await recordingRef.current.stopAndUnloadAsync();
    } catch {
      // ignore
    }
    recordingRef.current = null;
    setRecordState('idle');
    setRecordSeconds(0);
  }, []);

  const uploadAudio = useCallback(async (uri: string, familyId: string): Promise<string | null> => {
    const filename = `voice/${familyId}/${Date.now()}.m4a`;
    const file = {
      uri: Platform.OS === 'web' ? uri : uri,
      type: 'audio/m4a',
      name: filename,
    } as unknown as File;
    const { data, error } = await supabase.storage
      .from('family-media')
      .upload(filename, file, { contentType: 'audio/m4a' });
    if (error) return null;
    return data.path;
  }, []);

  return {
    recordState,
    recordSeconds,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadAudio,
  };
}

export function useAudioPlayer() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const soundRef = useRef<typeof Audio.Sound.prototype | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playFromPath = useCallback(async (path: string, messageId: string) => {
    try {
      // Get public URL from storage
      const { data } = supabase.storage.from('family-media').getPublicUrl(path);
      if (!data?.publicUrl) return;

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: data.publicUrl },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlayingId(messageId);
      setProgress(0);

      progressTimerRef.current = setInterval(async () => {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          const pct = (status.positionMillis / (status.durationMillis || 1)) * 100;
          setProgress(pct);
          if (status.didJustFinish) {
            clearInterval(progressTimerRef.current!);
            setPlayingId(null);
            setProgress(0);
          }
        }
      }, 100);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          setProgress(0);
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }
        }
      });
    } catch {
      // silent
    }
  }, []);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setPlayingId(null);
    setProgress(0);
  }, []);

  return { playingId, progress, playFromPath, stop };
}
