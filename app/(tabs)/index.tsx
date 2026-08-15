import { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, Platform, TextInput, ScrollView, Linking } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Speech from 'expo-speech';
import { useAuthStore } from '@/lib/auth-store';
import { useFamilyStore } from '@/lib/family-store';
import { useMotorTimer, startMotorSession, stopMotorSession } from '@/lib/motor-utils';
import { colors, typography, radius, spacing, statusColors, statusLabels } from '@/lib/theme';
import { formatTimer } from '@/lib/helpers';
import {
  notifyGateToggle,
  notifyMotorAction,
  notifySosAlert,
  playChime,
  speakNotification,
  startContinuousAlarm,
} from '@/lib/sound-notifications';
import { sendExpoPushNotification } from '@/lib/push-notifications';
import { sendEmergencyEmailToFamily } from '@/lib/email-service';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ModalBase } from '@/components/ModalBase';
import { EmptyState } from '@/components/States';
import {
  Droplets,
  Droplet,
  AlertTriangle,
  Clock,
  Power,
  Plus,
  Minus,
  Bell,
  Users,
  Lock,
  Unlock,
  Zap,
  Trash2,
  Edit3,
  Sliders,
  Mail,
  MessageSquare,
  Phone,
  Crown,
  UserCheck,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';

export default function DashboardScreen() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const {
    family,
    members,
    activeMotorSession,
    recentSos,
    clearSos,
    subscribe,
    isGateLocked,
    toggleGate,
    quickActions,
    createQuickAction,
    updateQuickAction,
    deleteQuickAction,
    sendRingAlert,
  } = useFamilyStore();

  const [showTimerModal, setShowTimerModal] = useState(false);
  const [selectedTank, setSelectedTank] = useState<'top' | 'down'>('top');
  const [duration, setDuration] = useState(30);
  const [sosHolding, setSosHolding] = useState(false);
  const [sosProgress, setSosProgress] = useState(0);
  const sosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sosFiredRef = useRef(false);
  const [sosModal, setSosModal] = useState(false);
  const [motorError, setMotorError] = useState<string | null>(null);

  // Custom Alarm state
  const [showCustomAlarmModal, setShowCustomAlarmModal] = useState(false);
  const [customAlarmTitle, setCustomAlarmTitle] = useState('');
  const [customAlarmMinutes, setCustomAlarmMinutes] = useState(15);
  const [activeAlarm, setActiveAlarm] = useState<{ title: string; endMs: number; totalSeconds: number } | null>(null);
  const [alarmRemaining, setAlarmRemaining] = useState(0);

  // Quick Action Admin Modal State
  const isAmAdmin = profile?.role === 'admin' || family?.created_by === user?.id;
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [actionTitle, setActionTitle] = useState('');
  const [actionType, setActionType] = useState<'motor' | 'alarm' | 'custom'>('motor');
  const [actionTank, setActionTank] = useState<'top' | 'down'>('top');
  const [actionDuration, setActionDuration] = useState(30);
  const [actionColor, setActionColor] = useState('#0284C7');
  const [detailMember, setDetailMember] = useState<typeof members[0] | null>(null);

  const openCreateActionModal = () => {
    setEditingActionId(null);
    setActionTitle('');
    setActionType('motor');
    setActionTank('top');
    setActionDuration(30);
    setActionColor('#0284C7');
    setShowActionModal(true);
  };

  const openEditActionModal = (action: typeof quickActions[0]) => {
    setEditingActionId(action.id);
    setActionTitle(action.title);
    setActionType(action.action_type);
    setActionTank(action.tank ?? 'top');
    setActionDuration(action.default_duration_minutes);
    setActionColor(action.color ?? '#0284C7');
    setShowActionModal(true);
  };

  const handleSaveAction = async () => {
    if (!actionTitle.trim()) return;
    const payload = {
      title: actionTitle.trim(),
      action_type: actionType,
      tank: actionType === 'motor' ? actionTank : null,
      default_duration_minutes: actionDuration,
      color: actionColor,
      icon: actionType === 'motor' ? 'droplets' : actionType === 'alarm' ? 'bell' : 'zap',
    };

    if (editingActionId) {
      await updateQuickAction(editingActionId, payload);
    } else {
      await createQuickAction(payload);
    }

    setShowActionModal(false);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleDeleteAction = async (id: string) => {
    await deleteQuickAction(id);
    setShowActionModal(false);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  };

  const triggerQuickAction = (q: typeof quickActions[0]) => {
    if (q.action_type === 'motor') {
      setSelectedTank(q.tank ?? 'top');
      setDuration(q.default_duration_minutes);
      setShowTimerModal(true);
    } else if (q.action_type === 'alarm') {
      setCustomAlarmTitle(q.title);
      setCustomAlarmMinutes(q.default_duration_minutes);
      setShowCustomAlarmModal(true);
    } else {
      setCustomAlarmTitle(q.title);
      setCustomAlarmMinutes(q.default_duration_minutes);
      setShowCustomAlarmModal(true);
    }
  };

  // Voice speech helper
  const speakVoice = (text: string) => {
    try {
      Speech.stop();
      Speech.speak(text, { language: 'en' });
    } catch {
      // silent
    }
  };

  // Subscribe to family realtime on mount
  useEffect(() => {
    if (family) {
      subscribe(family.id);
    }
  }, [family?.id]);

  // Handle motor timer expiry
  const handleMotorExpire = useCallback(async (session: typeof activeMotorSession) => {
    if (!session) return;
    useFamilyStore.getState().broadcastMotorAction('expire', null, session.tank, profile?.display_name);
    await stopMotorSession(session.id, session.family_id, profile?.display_name);
    useFamilyStore.getState().setMotorAlarmActive(true);
    notifyMotorAction('expire');
  }, [profile?.display_name]);

  const { remainingSeconds, isExpired } = useMotorTimer(activeMotorSession, handleMotorExpire);

  // Countdown timer for Custom Alarm
  useEffect(() => {
    if (!activeAlarm) {
      setAlarmRemaining(0);
      return;
    }
    const updateAlarm = () => {
      const remaining = Math.max(0, Math.floor((activeAlarm.endMs - Date.now()) / 1000));
      setAlarmRemaining(remaining);
      if (remaining === 0) {
        startContinuousAlarm(
          `⏰ ALARM FINISHED: ${activeAlarm.title}`,
          `Alarm "${activeAlarm.title}" timer completed!`,
          `Attention! Alarm timer for ${activeAlarm.title} is finished!`
        );
        setActiveAlarm(null);
      }
    };
    updateAlarm();
    const interval = setInterval(updateAlarm, 1000);
    return () => clearInterval(interval);
  }, [activeAlarm]);

  // Gate Lock/Unlock Handler
  const handleToggleGate = () => {
    const nextLocked = toggleGate(profile?.display_name);
    notifyGateToggle(nextLocked);
  };

  // SOS hold logic
  const startSosHold = () => {
    setSosHolding(true);
    setSosProgress(0);
    sosFiredRef.current = false;
    const startTime = Date.now();
    sosTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / 1500) * 100);
      setSosProgress(pct);
      if (pct >= 100 && !sosFiredRef.current) {
        sosFiredRef.current = true;
        fireSos();
      }
    }, 30);
  };

  const cancelSosHold = () => {
    setSosHolding(false);
    setSosProgress(0);
    if (sosTimerRef.current) {
      clearInterval(sosTimerRef.current);
      sosTimerRef.current = null;
    }
  };

  const fireSos = async () => {
    cancelSosHold();
    setSosModal(true);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    if (family && user) {
      await supabase.from('sos_alerts').insert({
        family_id: family.id,
        sent_by: user.id,
      });

      const senderName = profile?.display_name ?? 'Family Member';
      const otherMembers = members.filter((m) => m.id !== user.id);

      // 1. Dispatch Expo Push Notifications
      const pushTokens = otherMembers
        .map((m) => m.push_token)
        .filter((t): t is string => !!t && t.startsWith('ExponentPushToken'));

      if (pushTokens.length > 0) {
        sendExpoPushNotification(
          pushTokens,
          `🚨 Emergency SOS Alert from ${senderName}`,
          `${senderName} triggered an emergency SOS alert on FamilyHub!`,
          { type: 'sos', senderId: user.id }
        );
      }

      // 2. Dispatch Resend Email Notifications
      sendEmergencyEmailToFamily(
        family.id,
        user.id,
        senderName,
        'Emergency SOS Alert',
        `${senderName} pressed Emergency SOS alert on FamilyHub!`
      );
    }
  };

  // SOS received — show alert
  useEffect(() => {
    if (recentSos && recentSos.sent_by !== user?.id) {
      setSosModal(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [recentSos, user?.id]);

  const openTimerModal = (tank: 'top' | 'down') => {
    setSelectedTank(tank);
    setDuration(tank === 'top' ? 30 : 40);
    setShowTimerModal(true);
  };

  const handleStartMotor = async () => {
    if (!family || !user) return;
    setMotorError(null);
    const { error } = await startMotorSession(
      family.id,
      user.id,
      selectedTank,
      duration,
      profile?.display_name
    );
    if (error) {
      setMotorError(error);
    } else {
      setShowTimerModal(false);
      notifyMotorAction('start', selectedTank, profile?.display_name);
    }
  };

  const handleStopMotor = async () => {
    if (!activeMotorSession) return;
    await stopMotorSession(activeMotorSession.id, family?.id, profile?.display_name);
    notifyMotorAction('stop', undefined, profile?.display_name);
  };

  // Custom Alarm Handlers
  const handleStartCustomAlarm = () => {
    const title = customAlarmTitle.trim() || 'Custom Alarm';
    const totalSecs = customAlarmMinutes * 60;
    const endMs = Date.now() + totalSecs * 1000;
    setActiveAlarm({ title, endMs, totalSeconds: totalSecs });
    setShowCustomAlarmModal(false);
    setCustomAlarmTitle('');
    playChime('info');
    speakNotification(`Alarm set for ${title}`);
  };

  const handleStopCustomAlarm = () => {
    if (activeAlarm) {
      playChime('info');
      speakNotification(`Alarm stopped for ${activeAlarm.title}`);
    }
    setActiveAlarm(null);
  };

  const handleAckSos = async () => {
    if (recentSos) {
      await supabase
        .from('sos_alerts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', recentSos.id);
    }
    setSosModal(false);
    clearSos();
  };

  const colorIndexFor = (id: string) => members.findIndex((m) => m.id === id);

  const totalSeconds = activeMotorSession ? activeMotorSession.duration_minutes * 60 : 0;
  const progressPct = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;

  const alarmProgressPct =
    activeAlarm && activeAlarm.totalSeconds > 0
      ? ((activeAlarm.totalSeconds - alarmRemaining) / activeAlarm.totalSeconds) * 100
      : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good day,</Text>
          <Text style={styles.userName}>{profile?.display_name ?? 'Family'}</Text>
        </View>
        <View style={styles.familyBadge}>
          <Users size={16} color={colors.primary[600]} strokeWidth={2} />
          <Text style={styles.familyBadgeText}>{family?.name ?? 'Family'}</Text>
        </View>
      </View>

      {/* Main Gate Control Card */}
      <View style={[styles.gateCard, isGateLocked ? styles.gateCardLocked : styles.gateCardUnlocked]}>
        <View style={styles.gateLeft}>
          <View style={[styles.gateIconWrap, isGateLocked ? styles.gateIconLocked : styles.gateIconUnlocked]}>
            {isGateLocked ? (
              <Lock size={24} color={colors.error[600]} strokeWidth={2.2} />
            ) : (
              <Unlock size={24} color={colors.success[600]} strokeWidth={2.2} />
            )}
          </View>
          <View>
            <Text style={styles.gateTitle}>Main Gate</Text>
            <Text style={styles.gateStatusText}>
              Status:{' '}
              <Text style={isGateLocked ? styles.statusLockedText : styles.statusUnlockedText}>
                {isGateLocked ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}
              </Text>
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.gateBtn, isGateLocked ? styles.gateBtnUnlock : styles.gateBtnLock]}
          onPress={handleToggleGate}
          activeOpacity={0.85}
        >
          <Text style={isGateLocked ? styles.gateBtnTextUnlock : styles.gateBtnTextLock}>
            {isGateLocked ? 'Unlock Gate' : 'Lock Gate'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Motor Timer Card */}
      {activeMotorSession && activeMotorSession.is_active && (
        <View style={styles.activeTimerCard}>
          <View style={styles.activeTimerHeader}>
            <View style={styles.activeTimerLeft}>
              {activeMotorSession.tank === 'top' ? (
                <Droplets size={24} color={colors.secondary[500]} strokeWidth={2} />
              ) : (
                <Droplet size={24} color={colors.secondary[500]} strokeWidth={2} />
              )}
              <View>
                <Text style={styles.activeTimerTitle}>
                  {activeMotorSession.tank === 'top' ? 'Top Tank Motor' : 'Down Tank Motor'}
                </Text>
                <Text style={styles.activeTimerSub}>
                  {isExpired ? 'Time is up!' : 'Running'} — synced live
                </Text>
              </View>
            </View>
            <Text style={styles.timerDisplay}>{formatTimer(remainingSeconds)}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Button
            label="Turn Off Early"
            onPress={handleStopMotor}
            variant="danger"
            icon={<Power size={18} color={colors.neutral[0]} strokeWidth={2} />}
            fullWidth
          />
        </View>
      )}

      {/* Active Custom Alarm Card */}
      {activeAlarm && (
        <View style={styles.activeAlarmCard}>
          <View style={styles.activeTimerHeader}>
            <View style={styles.activeTimerLeft}>
              <Bell size={24} color={colors.primary[600]} strokeWidth={2} />
              <View>
                <Text style={styles.activeTimerTitle}>{activeAlarm.title}</Text>
                <Text style={styles.activeTimerSub}>Custom Alarm Active</Text>
              </View>
            </View>
            <Text style={styles.alarmTimerDisplay}>{formatTimer(alarmRemaining)}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.alarmProgressFill, { width: `${alarmProgressPct}%` }]} />
          </View>
          <Button
            label="Stop Alarm"
            onPress={handleStopCustomAlarm}
            variant="secondary"
            icon={<Bell size={18} color={colors.neutral[700]} strokeWidth={2} />}
            fullWidth
          />
        </View>
      )}

      {/* Quick Actions Header & Grid */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        {isAmAdmin && (
          <TouchableOpacity
            style={styles.addActionHeaderBtn}
            onPress={openCreateActionModal}
            activeOpacity={0.8}
          >
            <Plus size={16} color={colors.primary[600]} strokeWidth={2.5} />
            <Text style={styles.addActionHeaderBtnText}>Add Action</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsRow}>
        {quickActions.map((q) => {
          const cardColor = q.color || '#0284C7';
          return (
            <TouchableOpacity
              key={q.id}
              style={[styles.dynamicActionCard, { borderColor: cardColor + '40' }]}
              onPress={() => triggerQuickAction(q)}
              activeOpacity={0.8}
            >
              {isAmAdmin && (
                <TouchableOpacity
                  style={styles.cardEditBadge}
                  onPress={() => openEditActionModal(q)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Edit3 size={14} color={colors.neutral[600]} strokeWidth={2} />
                </TouchableOpacity>
              )}
              <View style={[styles.actionIconWrap, { backgroundColor: cardColor + '15' }]}>
                {q.action_type === 'motor' ? (
                  <Droplets size={26} color={cardColor} strokeWidth={2} />
                ) : q.action_type === 'alarm' ? (
                  <Bell size={26} color={cardColor} strokeWidth={2} />
                ) : (
                  <Zap size={26} color={cardColor} strokeWidth={2} />
                )}
              </View>
              <Text style={styles.actionTitle} numberOfLines={1}>
                {q.title}
              </Text>
              <Text style={styles.actionSub}>
                {q.action_type === 'motor'
                  ? `${q.tank === 'top' ? 'Top' : 'Down'} Motor`
                  : q.action_type === 'alarm'
                  ? 'Alarm'
                  : 'Quick Task'}
              </Text>
              <View style={[styles.actionDefaultBadge, { backgroundColor: cardColor + '20' }]}>
                <Clock size={10} color={cardColor} strokeWidth={2} />
                <Text style={[styles.actionDefaultText, { color: cardColor }]}>
                  {q.default_duration_minutes} min
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* SOS Button */}
      <View style={styles.sosContainer}>
        <TouchableOpacity
          onPressIn={startSosHold}
          onPressOut={cancelSosHold}
          activeOpacity={0.9}
          style={styles.sosButton}
          delayPressIn={0}
        >
          <View style={styles.sosRing} />
          {sosHolding && (
            <View
              style={[
                styles.sosProgressRing,
                {
                  transform: [{ scale: 1 + (sosProgress / 100) * 0.15 }],
                },
              ]}
            />
          )}
          <View style={styles.sosInner}>
            <AlertTriangle size={32} color={colors.neutral[0]} strokeWidth={2.5} />
            <Text style={styles.sosText}>
              {sosHolding ? 'HOLD...' : 'SOS'}
            </Text>
            <Text style={styles.sosSubText}>
              {sosHolding ? `${Math.round(sosProgress)}%` : 'Hold 1.5s'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Family Members Quick View */}
      <Text style={styles.sectionTitle}>Family Status</Text>
      <View style={styles.membersRow}>
        {members.length === 0 && (
          <Text style={styles.emptyText}>No family members yet.</Text>
        )}
        {members.map((m) => {
          const idx = colorIndexFor(m.id);
          return (
            <TouchableOpacity
              key={m.id}
              style={styles.memberChip}
              onPress={() => setDetailMember(m)}
              activeOpacity={0.8}
            >
              <Avatar name={m.display_name} size={40} status={m.status} colorIndex={idx} />
              <Text style={styles.memberName} numberOfLines={1}>
                {m.id === user?.id ? 'You' : m.display_name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Motor Timer Modal */}
      <ModalBase
        visible={showTimerModal}
        onClose={() => setShowTimerModal(false)}
        title={selectedTank === 'top' ? 'Top Tank Timer' : 'Down Tank Timer'}
      >
        <View style={styles.timerModalContent}>
          <View style={styles.durationDisplay}>
            <Text style={styles.durationValue}>{duration}</Text>
            <Text style={styles.durationUnit}>minutes</Text>
          </View>
          <View style={styles.durationControls}>
            <TouchableOpacity
              style={styles.durationBtn}
              onPress={() => setDuration((d) => Math.max(1, d - 5))}
            >
              <Minus size={24} color={colors.neutral[700]} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.durationPresets}>
              {[15, 20, 30, 40, 60].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetBtn, duration === preset && styles.presetBtnActive]}
                  onPress={() => setDuration(preset)}
                >
                  <Text style={[styles.presetText, duration === preset && styles.presetTextActive]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.durationBtn}
              onPress={() => setDuration((d) => Math.min(180, d + 5))}
            >
              <Plus size={24} color={colors.neutral[700]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          {motorError && <Text style={styles.errorText}>{motorError}</Text>}
          <Button
            label="Start Motor"
            onPress={handleStartMotor}
            fullWidth
            size="lg"
            icon={<Power size={20} color={colors.neutral[0]} strokeWidth={2} />}
          />
        </View>
      </ModalBase>

      {/* Custom Alarm Modal */}
      <ModalBase
        visible={showCustomAlarmModal}
        onClose={() => setShowCustomAlarmModal(false)}
        title="Set Specific Custom Alarm"
      >
        <View style={styles.timerModalContent}>
          <Text style={styles.inputLabel}>Alarm Label / Task Name</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Boil water, Medicine, Study"
              placeholderTextColor={colors.neutral[400]}
              value={customAlarmTitle}
              onChangeText={setCustomAlarmTitle}
            />
          </View>

          <View style={styles.durationDisplay}>
            <Text style={styles.durationValue}>{customAlarmMinutes}</Text>
            <Text style={styles.durationUnit}>minutes</Text>
          </View>
          <View style={styles.durationControls}>
            <TouchableOpacity
              style={styles.durationBtn}
              onPress={() => setCustomAlarmMinutes((m) => Math.max(1, m - 5))}
            >
              <Minus size={24} color={colors.neutral[700]} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.durationPresets}>
              {[1, 5, 10, 15, 30, 45].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetBtn, customAlarmMinutes === preset && styles.presetBtnActive]}
                  onPress={() => setCustomAlarmMinutes(preset)}
                >
                  <Text style={[styles.presetText, customAlarmMinutes === preset && styles.presetTextActive]}>
                    {preset}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.durationBtn}
              onPress={() => setCustomAlarmMinutes((m) => Math.min(180, m + 5))}
            >
              <Plus size={24} color={colors.neutral[700]} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Button
            label="Start Alarm"
            onPress={handleStartCustomAlarm}
            fullWidth
            size="lg"
            icon={<Bell size={20} color={colors.neutral[0]} strokeWidth={2} />}
          />
        </View>
      </ModalBase>

      {/* Admin Quick Action Config Modal */}
      <ModalBase
        visible={showActionModal}
        onClose={() => setShowActionModal(false)}
        title={editingActionId ? 'Edit Quick Action' : 'Create Quick Action'}
      >
        <View style={styles.timerModalContent}>
          <Text style={styles.inputLabel}>Action Title</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Top Tank 30m, Lawn Hose 15m"
              placeholderTextColor={colors.neutral[400]}
              value={actionTitle}
              onChangeText={setActionTitle}
            />
          </View>

          <Text style={styles.inputLabel}>Action Type</Text>
          <View style={styles.typeRow}>
            {(['motor', 'alarm', 'custom'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, actionType === t && styles.typeChipActive]}
                onPress={() => setActionType(t)}
              >
                <Text style={[styles.typeChipText, actionType === t && styles.typeChipTextActive]}>
                  {t === 'motor' ? '💧 Motor' : t === 'alarm' ? '🔔 Alarm' : '⚡ Custom'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {actionType === 'motor' && (
            <>
              <Text style={styles.inputLabel}>Tank Selection</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeChip, actionTank === 'top' && styles.typeChipActive]}
                  onPress={() => setActionTank('top')}
                >
                  <Text style={[styles.typeChipText, actionTank === 'top' && styles.typeChipTextActive]}>
                    Top Tank
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeChip, actionTank === 'down' && styles.typeChipActive]}
                  onPress={() => setActionTank('down')}
                >
                  <Text style={[styles.typeChipText, actionTank === 'down' && styles.typeChipTextActive]}>
                    Down Tank
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={styles.inputLabel}>Default Duration (minutes)</Text>
          <View style={styles.durationInputWrap}>
            <TextInput
              style={styles.durationTextInput}
              keyboardType="number-pad"
              value={String(actionDuration || '')}
              onChangeText={(txt) => {
                const val = parseInt(txt.replace(/[^0-9]/g, ''), 10);
                setActionDuration(isNaN(val) ? 0 : val);
              }}
              placeholder="30"
              placeholderTextColor={colors.neutral[400]}
            />
            <Text style={styles.durationUnit}>minutes</Text>
          </View>
          <View style={styles.durationControls}>
            <TouchableOpacity
              style={styles.durationBtn}
              onPress={() => setActionDuration((d) => Math.max(1, d - 5))}
            >
              <Minus size={24} color={colors.neutral[700]} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.durationPresets}>
              {[10, 15, 30, 45, 60].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetBtn, actionDuration === preset && styles.presetBtnActive]}
                  onPress={() => setActionDuration(preset)}
                >
                  <Text style={[styles.presetText, actionDuration === preset && styles.presetTextActive]}>
                    {preset}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.durationBtn}
              onPress={() => setActionDuration((d) => Math.min(180, d + 5))}
            >
              <Plus size={24} color={colors.neutral[700]} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Button
            label={editingActionId ? 'Save Changes' : 'Create Quick Action'}
            onPress={handleSaveAction}
            fullWidth
            size="lg"
            icon={<Sliders size={20} color={colors.neutral[0]} strokeWidth={2} />}
          />

          {editingActionId && (
            <TouchableOpacity
              style={styles.deleteActionBtn}
              onPress={() => handleDeleteAction(editingActionId)}
            >
              <Trash2 size={18} color={colors.error[500]} strokeWidth={2} />
              <Text style={styles.deleteActionText}>Delete Action</Text>
            </TouchableOpacity>
          )}
        </View>
      </ModalBase>

      {/* SOS Alert Modal */}
      <Modal visible={sosModal} transparent animationType="fade" onRequestClose={handleAckSos}>
        <View style={styles.sosModalOverlay}>
          <View style={styles.sosModalCard}>
            <View style={styles.sosModalIcon}>
              <AlertTriangle size={56} color={colors.neutral[0]} strokeWidth={2.5} />
            </View>
            <Text style={styles.sosModalTitle}>Emergency Alert</Text>
            <Text style={styles.sosModalBody}>
              {recentSos?.sent_by === user?.id
                ? 'Your SOS has been sent to all family members.'
                : 'A family member has triggered an emergency alert. Please check in!'}
            </Text>
            <Button label="Acknowledge" onPress={handleAckSos} variant="danger" fullWidth size="lg" />
          </View>
        </View>
      </Modal>

      {/* Member Detail Profile Dialogue Modal */}
      <ModalBase
        visible={!!detailMember}
        onClose={() => setDetailMember(null)}
        title="Member Profile"
      >
        {detailMember && (() => {
          const idx = colorIndexFor(detailMember.id);
          const sc = statusColors[detailMember.status];
          const isMemberAdmin = detailMember.role === 'admin' || family?.created_by === detailMember.id;
          const isMe = detailMember.id === user?.id;

          return (
            <View style={styles.detailModalContent}>
              <View style={styles.detailHeader}>
                <Avatar name={detailMember.display_name} size={64} status={detailMember.status} colorIndex={idx} />
                <View style={styles.detailHeaderInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.detailName}>{detailMember.display_name}</Text>
                    {isMemberAdmin && (
                      <View style={styles.adminBadge}>
                        <Crown size={12} color="#D97706" strokeWidth={2.5} />
                        <Text style={styles.adminBadgeText}>Admin</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg, marginTop: 4 }]}>
                    <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
                    <Text style={[styles.statusText, { color: sc.text }]}>{statusLabels[detailMember.status]}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailRow}>
                <Mail size={18} color={colors.primary[600]} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>Email Address</Text>
                  <Text style={styles.detailValue}>{detailMember.email || 'Not specified'}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Phone size={18} color={colors.secondary[600]} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>Mobile Number</Text>
                  <Text style={styles.detailValue}>{detailMember.phone_number || 'Not added yet'}</Text>
                </View>
              </View>

              <View style={styles.detailActionsRow}>
                {!isMe && (
                  <TouchableOpacity
                    style={[styles.detailActionBtn, styles.smsBtn]}
                    onPress={() => {
                      const targetId = detailMember.id;
                      setDetailMember(null);
                      router.push({ pathname: '/(tabs)/messages', params: { directMemberId: targetId } });
                    }}
                  >
                    <MessageSquare size={16} color={colors.primary[700]} strokeWidth={2} />
                    <Text style={styles.smsBtnText}>Message</Text>
                  </TouchableOpacity>
                )}

                {detailMember.phone_number ? (
                  <TouchableOpacity
                    style={[styles.detailActionBtn, styles.callBtn]}
                    onPress={() => Linking.openURL(`tel:${detailMember.phone_number}`)}
                  >
                    <Phone size={16} color={colors.neutral[0]} strokeWidth={2} />
                    <Text style={styles.detailActionBtnText}>Call</Text>
                  </TouchableOpacity>
                ) : null}

                {!isMe && (
                  <TouchableOpacity
                    style={[styles.detailActionBtn, styles.ringActionBtn]}
                    onPress={() => {
                      sendRingAlert(detailMember.id, user?.id ?? '', profile?.display_name ?? 'Family Member');
                      setDetailMember(null);
                    }}
                  >
                    <Bell size={16} color={colors.secondary[700]} strokeWidth={2} />
                    <Text style={styles.ringActionBtnText}>Ring</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })()}
      </ModalBase>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.sm,
  },
  greeting: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
  },
  userName: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  familyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  familyBadgeText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[700],
  },

  // Gate Card Styles
  gateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  gateCardLocked: {
    backgroundColor: colors.error[50],
    borderColor: colors.error[200],
  },
  gateCardUnlocked: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  gateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  gateIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateIconLocked: {
    backgroundColor: colors.error[100],
  },
  gateIconUnlocked: {
    backgroundColor: colors.success[100],
  },
  gateTitle: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  gateStatusText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    marginTop: 1,
  },
  statusLockedText: {
    fontFamily: typography.fontFamilyBold,
    color: colors.error[600],
  },
  statusUnlockedText: {
    fontFamily: typography.fontFamilyBold,
    color: colors.success[600],
  },
  gateBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  gateBtnUnlock: {
    backgroundColor: colors.success[600],
  },
  gateBtnLock: {
    backgroundColor: colors.error[600],
  },
  gateBtnTextUnlock: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },
  gateBtnTextLock: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },

  activeTimerCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  activeAlarmCard: {
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary[200],
    shadowColor: colors.primary[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  activeTimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  activeTimerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeTimerTitle: {
    fontSize: 17,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  activeTimerSub: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
  },
  timerDisplay: {
    fontSize: 32,
    fontFamily: typography.fontFamilyBold,
    color: colors.secondary[600],
    fontVariant: ['tabular-nums'],
  },
  alarmTimerDisplay: {
    fontSize: 32,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[600],
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.full,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.secondary[500],
    borderRadius: radius.full,
  },
  alarmProgressFill: {
    height: '100%',
    backgroundColor: colors.primary[500],
    borderRadius: radius.full,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[800],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  addActionHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  addActionHeaderBtnText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[700],
  },
  actionsRow: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
  },
  dynamicActionCard: {
    width: 125,
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    marginRight: spacing.sm,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    position: 'relative',
  },
  cardEditBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.neutral[100],
    padding: 4,
    borderRadius: radius.full,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
    textAlign: 'center',
  },
  actionSub: {
    fontSize: 11,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    marginTop: 2,
  },
  actionDefaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginTop: spacing.xs + 2,
  },
  actionDefaultText: {
    fontSize: 10,
    fontFamily: typography.fontFamilyBold,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  typeChipActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[500],
  },
  typeChipText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[600],
  },
  typeChipTextActive: {
    color: colors.primary[700],
  },
  deleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  deleteActionText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.error[500],
  },
  sosContainer: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sosButton: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.error[500],
    opacity: 0.15,
  },
  sosProgressRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.error[400],
    opacity: 0.25,
  },
  sosInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.error[500],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.error[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  sosText: {
    fontSize: 20,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
    marginTop: 2,
  },
  sosSubText: {
    fontSize: 11,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[0],
    opacity: 0.8,
  },
  membersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  memberChip: {
    alignItems: 'center',
    width: 72,
  },
  memberName: {
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[700],
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
  },
  // Custom Alarm Input
  inputLabel: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[700],
    marginBottom: spacing.xs,
  },
  inputWrap: {
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[900],
  },
  // Timer Modal
  timerModalContent: {
    paddingBottom: spacing.md,
  },
  durationDisplay: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  durationValue: {
    fontSize: 52,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  durationUnit: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
  },
  durationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  durationBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  presetBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral[50],
  },
  presetBtnActive: {
    backgroundColor: colors.primary[500],
  },
  presetText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[600],
  },
  presetTextActive: {
    color: colors.neutral[0],
    fontFamily: typography.fontFamilyBold,
  },
  errorText: {
    color: colors.error[600],
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  // SOS Modal
  sosModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(112,18,18,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  sosModalCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  sosModalIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.error[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  sosModalTitle: {
    fontSize: 24,
    fontFamily: typography.fontFamilyBold,
    color: colors.error[700],
    marginBottom: spacing.sm,
  },
  sosModalBody: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[600],
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 24,
  },
  durationInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: colors.neutral[50],
  },
  durationTextInput: {
    fontSize: 28,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[600],
    minWidth: 50,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  // Detail Profile Dialogue Modal Styles
  detailModalContent: {
    paddingBottom: spacing.md,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  detailHeaderInfo: {
    flex: 1,
  },
  detailName: {
    fontSize: 20,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.neutral[200],
    marginVertical: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.neutral[50],
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[500],
  },
  detailValue: {
    fontSize: 15,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[800],
    marginTop: 2,
  },
  detailActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  callBtn: {
    backgroundColor: colors.success[600],
  },
  detailActionBtnText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },
  smsBtn: {
    backgroundColor: colors.primary[100],
    borderWidth: 1,
    borderColor: colors.primary[300],
  },
  smsBtnText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[700],
  },
  ringActionBtn: {
    backgroundColor: colors.secondary[100],
    borderWidth: 1,
    borderColor: colors.secondary[300],
  },
  ringActionBtnText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.secondary[700],
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  adminBadgeText: {
    fontSize: 10,
    fontFamily: typography.fontFamilyBold,
    color: '#92400E',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: typography.fontFamilyMedium,
  },
});
