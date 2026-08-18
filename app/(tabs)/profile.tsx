import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, Alert, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useFamilyStore } from '@/lib/family-store';
import { colors, typography, radius, spacing } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ModalBase } from '@/components/ModalBase';
import type { MemberStatus } from '@/lib/types';
import {
  User as UserIcon,
  Pencil,
  Check,
  LogOut,
  Shield,
  Settings as SettingsIcon,
  MapPin,
  Circle,
  Bell,
  Heart,
  Crown,
  Phone,
  Volume2,
  Mail,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { getCurrentUserLocation, checkLocationPermissions } from '@/lib/location-utils';
import {
  requestNotificationPermissions,
  checkNotificationPermissions,
  playChime,
  speakNotification,
  showSystemNotification,
} from '@/lib/sound-notifications';


const statusLabels: Record<MemberStatus, string> = {
  online: 'Online',
  away: 'Away',
  dnd: 'Do Not Disturb',
};

const statusColors: Record<MemberStatus, { dot: string; bg: string; text: string }> = {
  online: { dot: colors.success[500], bg: colors.success[50], text: colors.success[700] },
  away: { dot: colors.warning[500], bg: colors.warning[50], text: colors.warning[700] },
  dnd: { dot: colors.error[500], bg: colors.error[50], text: colors.error[700] },
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, signOut, updateProfile } = useAuthStore();
  const { family, members, myLocation, updateMyLocation } = useFamilyStore();

  const [showEditName, setShowEditName] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number ?? '');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locStatus, setLocStatus] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<boolean | null>(null);
  const [locPermission, setLocPermission] = useState<boolean | null>(null);

  // Auto-detect existing system permissions on mount so user isn't prompted repeatedly
  useEffect(() => {
    checkNotificationPermissions().then((granted) => setNotifPermission(granted));
    checkLocationPermissions().then((granted) => setLocPermission(granted));
  }, []);




  const handleEnableNotifications = async () => {
    const ok = await requestNotificationPermissions();
    setNotifPermission(ok);
    if (ok) {
      showSystemNotification('Notification Permission Enabled', 'Sound and alarm notifications are active!');
      playChime('success');
      if (Platform.OS === 'web') {
        alert('Notification & sound permissions turned on successfully!');
      } else {
        Alert.alert('Success', 'Notification & sound permissions turned on successfully!');
      }
    } else {
      if (Platform.OS === 'web') {
        alert('Permission denied or not granted.');
      } else {
        Alert.alert('Permission Denied', 'Please enable notifications in your phone device settings.');
      }
    }
  };

  const handleEnableLocation = async () => {
    setLocating(true);
    const loc = await getCurrentUserLocation();
    setLocating(false);
    if (loc) {
      setLocPermission(true);
      await updateMyLocation(user?.id ?? '', profile?.display_name);
      setLocStatus('📍 Location permission granted & synced!');
      if (Platform.OS === 'web') {
        alert('Location permission granted and GPS position updated!');
      } else {
        Alert.alert('Success', 'Location permission granted and GPS position updated!');
      }
    } else {
      setLocPermission(false);
      setLocStatus('⚠️ Location permission denied.');
      if (Platform.OS === 'web') {
        alert('Could not access GPS location. Please check your location settings.');
      } else {
        Alert.alert('Permission Denied', 'Please grant location permission in phone settings.');
      }
    }
  };

  const handleTestSound = () => {
    playChime('info');
    speakNotification('Family Hub sound and alarm notification test successful.');
    showSystemNotification('Sound & Vibration Test', 'Audio and notification alerts are working!');
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    } else if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const colorIndexFor = (id: string) => members.findIndex((m) => m.id === id);

  const handleStatusChange = async (status: MemberStatus) => {
    await updateProfile({ status });
    setShowStatusModal(false);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    await updateProfile({ display_name: displayName.trim() });
    setShowEditName(false);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSavePhone = async () => {
    const { error } = await updateProfile({ phone_number: phoneNumber.trim() });
    if (error) {
      if (Platform.OS === 'web') {
        alert(`Failed to save phone number: ${error}`);
      } else {
        Alert.alert('Error', error);
      }
      return;
    }
    setShowEditPhone(false);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleUpdateLocation = async () => {
    if (!user) return;
    setLocating(true);
    setLocStatus('Fetching GPS location...');
    const loc = await updateMyLocation(user.id, profile?.display_name);
    setLocating(false);
    if (loc) {
      setLocStatus('📍 Location updated successfully!');
    } else {
      setLocStatus('⚠️ Location access failed. Check permissions.');
    }
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      await signOut();
      router.replace('/auth');
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out of Family Hub?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth');
          },
        },
      ]);
    }
  };

  const currentStatus = profile?.status ?? 'online';
  const currentSc = statusColors[currentStatus];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>My Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Avatar
              name={profile?.display_name ?? 'User'}
              size={72}
              status={profile?.status ?? 'online'}
              colorIndex={colorIndexFor(user?.id ?? '')}
            />
          </View>

          <View style={styles.profileMeta}>
            <View style={styles.nameRow}>
              <Text style={styles.profileName}>{profile?.display_name}</Text>
              <TouchableOpacity
                onPress={() => {
                  setDisplayName(profile?.display_name ?? '');
                  setShowEditName(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Pencil size={18} color={colors.primary[600]} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.profileEmail}>{user?.email}</Text>

            {/* Status Pill */}
            <TouchableOpacity
              style={[styles.statusPill, { backgroundColor: currentSc.bg }]}
              onPress={() => setShowStatusModal(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.statusDot, { backgroundColor: currentSc.dot }]} />
              <Text style={[styles.statusPillText, { color: currentSc.text }]}>
                {statusLabels[currentStatus]}
              </Text>
              <Text style={styles.changeStatusHint}>• Tap to change</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Account & Family Details */}
        <Text style={styles.sectionTitle}>Family & Account</Text>
        <View style={styles.settingsGroup}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Heart size={20} color={colors.primary[600]} strokeWidth={2} />
              <Text style={styles.settingLabel}>Family Name</Text>
            </View>
            <Text style={styles.settingValue}>{family?.name ?? 'Not in a family'}</Text>
          </View>

          <View style={styles.settingsDivider} />

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Crown size={20} color="#D97706" strokeWidth={2} />
              <Text style={styles.settingLabel}>Your Family Role</Text>
            </View>
            <Text style={styles.settingValue}>
              {profile?.role === 'admin' || family?.created_by === user?.id ? '👑 Admin (Creator)' : 'Member'}
            </Text>
          </View>

          <View style={styles.settingsDivider} />

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Phone size={20} color={colors.primary[600]} strokeWidth={2} />
              <Text style={styles.settingLabel}>Mobile Number</Text>
            </View>
            <TouchableOpacity
              style={styles.editPhoneValBtn}
              onPress={() => {
                setPhoneNumber(profile?.phone_number ?? '');
                setShowEditPhone(true);
              }}
            >
              <Text style={profile?.phone_number ? styles.settingValue : styles.settingValuePlaceholder}>
                {profile?.phone_number || 'Add Mobile No.'}
              </Text>
              <Pencil size={14} color={colors.primary[600]} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsDivider} />

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Shield size={20} color={colors.secondary[600]} strokeWidth={2} />
              <Text style={styles.settingLabel}>Account Security</Text>
            </View>
            <Text style={styles.settingValue}>Protected</Text>
          </View>
        </View>

        {/* Section: Mobile Permissions & Sound Controls */}
        <Text style={styles.sectionTitle}>Permissions & Sound Settings</Text>
        <View style={styles.settingsGroup}>
          {/* Notification & Alarm Sound Permission */}
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Bell size={20} color={colors.primary[600]} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Notifications & Alarm Sounds</Text>
                <Text style={styles.permissionSub}>
                  {notifPermission === true
                    ? '🟢 Active (Status bar & ring alerts)'
                    : notifPermission === false
                    ? '🔴 Permission denied'
                    : 'Tap button to enable notification alerts'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.permissionBtn, notifPermission === true && styles.permissionBtnActive]}
              onPress={handleEnableNotifications}
              activeOpacity={0.8}
            >
              <Text style={[styles.permissionBtnText, notifPermission === true && styles.permissionBtnTextActive]}>
                {notifPermission === true ? 'Turned On' : 'Turn On'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingsDivider} />

          {/* Location Permission */}
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MapPin size={20} color={colors.secondary[600]} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>GPS Location Access</Text>
                <Text style={styles.permissionSub}>
                  {locPermission === true
                    ? '🟢 Active (GPS location synced)'
                    : locPermission === false
                    ? '🔴 Permission denied'
                    : 'Tap button to grant GPS permission'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.permissionBtn, locPermission === true && styles.permissionBtnActive]}
              onPress={handleEnableLocation}
              activeOpacity={0.8}
            >
              <Text style={[styles.permissionBtnText, locPermission === true && styles.permissionBtnTextActive]}>
                {locPermission === true ? 'Turned On' : 'Turn On'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingsDivider} />

          {/* Test Sound & Vibration */}
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Volume2 size={20} color={colors.success[600]} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Sound & Alarm Test</Text>
                <Text style={styles.permissionSub}>Test chime sound, speech & vibration</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.permissionBtnSuccess}
              onPress={handleTestSound}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionBtnSuccessText}>Test</Text>
            </TouchableOpacity>
          </View>
        </View>


        {/* Section: GPS & Location Settings */}
        <Text style={styles.sectionTitle}>Location Sync</Text>
        <View style={styles.locationGroup}>
          <View style={styles.locationInfoRow}>
            <MapPin size={22} color={colors.primary[600]} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>GPS Proximity & Location</Text>
              <Text style={styles.locationSub}>
                {myLocation
                  ? `Last set: ${myLocation.latitude.toFixed(4)}, ${myLocation.longitude.toFixed(4)}`
                  : 'Location not updated yet'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.syncLocBtn}
            onPress={handleUpdateLocation}
            disabled={locating}
            activeOpacity={0.8}
          >
            <Text style={styles.syncLocBtnText}>
              {locating ? 'Updating GPS...' : 'Update My Current Location'}
            </Text>
          </TouchableOpacity>
          {locStatus && <Text style={styles.locStatusText}>{locStatus}</Text>}
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <LogOut size={20} color={colors.error[500]} strokeWidth={2} />
          <Text style={styles.signOutText}>Sign Out of Family Hub</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Status Modal */}
      <ModalBase visible={showStatusModal} onClose={() => setShowStatusModal(false)} title="Set Your Status">
        <View style={styles.statusOptions}>
          {(['online', 'away', 'dnd'] as MemberStatus[]).map((s) => {
            const sc = statusColors[s];
            const active = currentStatus === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.statusOption, active && { backgroundColor: sc.bg, borderColor: sc.text }]}
                onPress={() => handleStatusChange(s)}
              >
                <View style={[styles.statusDot, { backgroundColor: sc.dot, width: 14, height: 14 }]} />
                <Text style={[styles.statusOptionText, { color: active ? sc.text : colors.neutral[700] }]}>
                  {statusLabels[s]}
                </Text>
                {active && <Check size={20} color={sc.text} strokeWidth={2} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ModalBase>

      {/* Edit Display Name Modal */}
      <ModalBase visible={showEditName} onClose={() => setShowEditName(false)} title="Edit Display Name">
        <View>
          <TextInput
            style={styles.nameInput}
            placeholder="Display name"
            placeholderTextColor={colors.neutral[400]}
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Button
            label="Save Name"
            onPress={handleSaveName}
            fullWidth
            size="lg"
            icon={<Check size={20} color={colors.neutral[0]} strokeWidth={2} />}
          />
        </View>
      </ModalBase>

      {/* Edit Mobile Number Modal */}
      <ModalBase visible={showEditPhone} onClose={() => setShowEditPhone(false)} title="Edit Mobile Number">
        <View>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g. +977 9800000000"
            placeholderTextColor={colors.neutral[400]}
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
          <Button
            label="Save Mobile Number"
            onPress={handleSavePhone}
            fullWidth
            size="lg"
            icon={<Check size={20} color={colors.neutral[0]} strokeWidth={2} />}
          />
        </View>
      </ModalBase>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + 80,
  },
  header: {
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.md,
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  profileCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrap: {
    marginBottom: spacing.md,
  },
  profileMeta: {
    alignItems: 'center',
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  profileName: {
    fontSize: 20,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    marginBottom: spacing.md,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
  },
  changeStatusHint: {
    fontSize: 11,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  settingsGroup: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[800],
  },
  settingValue: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[600],
  },
  settingValuePlaceholder: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[600],
  },
  editPhoneValBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginVertical: spacing.md,
  },
  locationGroup: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  locationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  locationTitle: {
    fontSize: 15,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  locationSub: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
  },
  syncLocBtn: {
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  syncLocBtnText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },
  locStatusText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[700],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error[50],
    paddingVertical: spacing.md + 4,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.error[200],
  },
  signOutText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.error[600],
  },
  statusOptions: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
  },
  statusOptionText: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
  },
  nameInput: {
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[900],
    marginBottom: spacing.lg,
  },
  permissionSub: {
    fontSize: 11,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[500],
    marginTop: 2,
  },
  permissionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  permissionBtnActive: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[300],
  },
  permissionBtnText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[700],
  },
  permissionBtnTextActive: {
    color: colors.success[700],
  },
  permissionBtnSuccess: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.success[600],
  },
  permissionBtnSuccessText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },
});
