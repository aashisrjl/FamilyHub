import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import * as Speech from 'expo-speech';
import { colors, typography, radius, spacing } from '@/lib/theme';
import { useAuthStore } from '@/lib/auth-store';
import { useFamilyStore } from '@/lib/family-store';
import { stopMotorSession } from '@/lib/motor-utils';
import { notifyRingReceived, notifySosAlert, requestNotificationPermissions, stopContinuousAlarm } from '@/lib/sound-notifications';
import { Button } from '@/components/Button';
import { Home, CheckSquare, MessageCircle, Users, BellRing, AlertTriangle, Droplets, User } from 'lucide-react-native';

export default function TabLayout() {
  const { user, profile } = useAuthStore();
  const { subscribe, incomingRing, clearIncomingRing, recentSos, members, family, activeMotorSession, motorAlarmActive, silenceMotorAlarm } = useFamilyStore();
  const [activeRingModal, setActiveRingModal] = useState(false);
  const [ringSenderName, setRingSenderName] = useState<string>('A family member');

  // Request system notification permissions on mount
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  useEffect(() => {
    if (profile?.family_id) {
      subscribe(profile.family_id);
    }
  }, [profile?.family_id, subscribe]);

  // Handle incoming ring alert globally across all tab screens
  useEffect(() => {
    if (incomingRing && incomingRing.sender_id !== user?.id) {
      const isTargetedAtMe = !incomingRing.target_id || incomingRing.target_id === user?.id;
      if (isTargetedAtMe) {
        const sender = members.find((m) => m.id === incomingRing.sender_id);
        const senderName = sender?.display_name ?? 'A family member';
        setRingSenderName(senderName);
        setActiveRingModal(true);

        notifyRingReceived(senderName);
      }
    }
  }, [incomingRing, user?.id, members]);

  // Handle incoming SOS alert voice announcement globally
  useEffect(() => {
    if (recentSos && recentSos.sent_by !== user?.id) {
      const sender = members.find((m) => m.id === recentSos.sent_by);
      const senderName = sender?.display_name ?? 'A family member';
      notifySosAlert(senderName);
    }
  }, [recentSos, user?.id, members]);

  const handleDismissRing = () => {
    setActiveRingModal(false);
    clearIncomingRing();
    try {
      Speech.stop();
    } catch {
      // silent
    }
  };

  const handleSilenceMotorAlarm = async () => {
    silenceMotorAlarm();
    if (activeMotorSession && family) {
      await stopMotorSession(activeMotorSession.id, family.id, profile?.display_name);
    }
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary[600],
          tabBarInactiveTintColor: colors.neutral[400],
          tabBarStyle: {
            backgroundColor: colors.neutral[0],
            borderTopColor: colors.neutral[200],
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 88 : 76,
            paddingBottom: Platform.OS === 'ios' ? 28 : 16,
            paddingTop: 10,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: typography.fontFamilyMedium,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ size, color }) => (
              <Home size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ size, color }) => (
              <CheckSquare size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarIcon: ({ size, color }) => (
              <MessageCircle size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'Family',
            tabBarIcon: ({ size, color }) => (
              <Users size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ size, color }) => (
              <User size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
      </Tabs>

      {/* Global Ringing Overlay Modal */}
      <Modal visible={activeRingModal} transparent animationType="fade" onRequestClose={handleDismissRing}>
        <View style={styles.modalOverlay}>
          <View style={styles.ringModalCard}>
            <View style={styles.ringIconWrap}>
              <BellRing size={48} color={colors.neutral[0]} strokeWidth={2} />
            </View>
            <Text style={styles.ringModalTitle}>Incoming Ring Alert</Text>
            <Text style={styles.ringModalBody}>
              <Text style={styles.ringSenderBold}>{ringSenderName}</Text> is ringing your device!
            </Text>
            <Button label="Silence / Dismiss" onPress={handleDismissRing} variant="primary" fullWidth size="lg" />
          </View>
        </View>
      </Modal>

      {/* Global Motor Alarm Alert Modal */}
      <Modal visible={motorAlarmActive} transparent animationType="slide" onRequestClose={handleSilenceMotorAlarm}>
        <View style={styles.modalOverlay}>
          <View style={styles.alarmModalCard}>
            <View style={styles.alarmIconWrap}>
              <Droplets size={52} color={colors.neutral[0]} strokeWidth={2.5} />
            </View>
            <Text style={styles.alarmModalTitle}>⚠️ MOTOR ALARM EXPIRED!</Text>
            <Text style={styles.alarmModalBody}>
              Water tank motor timer completed. Turn off the machine now to prevent overflow!
            </Text>
            <Button
              label="Turn Off Machine & Silence Alarm"
              onPress={handleSilenceMotorAlarm}
              variant="danger"
              fullWidth
              size="lg"
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  ringModalCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  ringIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.secondary[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  ringModalTitle: {
    fontSize: 22,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
    marginBottom: spacing.xs,
  },
  ringModalBody: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[600],
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  ringSenderBold: {
    fontFamily: typography.fontFamilyBold,
    color: colors.secondary[700],
  },
  alarmModalCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    borderColor: colors.error[500],
    borderWidth: 2,
    shadowColor: colors.error[600],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  alarmIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.error[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  alarmModalTitle: {
    fontSize: 22,
    fontFamily: typography.fontFamilyBold,
    color: colors.error[700],
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  alarmModalBody: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[700],
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
});
