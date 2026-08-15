import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Share,
  Platform,
  TextInput,
} from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useFamilyStore } from '@/lib/family-store';
import { supabase } from '@/lib/supabase';
import { colors, typography, radius, spacing, statusColors, statusLabels } from '@/lib/theme';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ModalBase } from '@/components/ModalBase';
import { EmptyState } from '@/components/States';
import type { MemberStatus } from '@/lib/types';
import {
  Bell,
  BellRing,
  Users2,
  Copy,
  LogOut,
  Settings as SettingsIcon,
  User as UserIcon,
  Pencil,
  Check,
  Phone,
  Volume2,
  Shield,
  Share2,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

export default function MembersScreen() {
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuthStore();
  const { family, members, membersReady, subscribe, incomingRing, clearIncomingRing, sendRingAlert } = useFamilyStore();
  const [showRingModal, setShowRingModal] = useState(false);
  const [ringTarget, setRingTarget] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showEditName, setShowEditName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [ringing, setRinging] = useState(false);
  const [showRingAlert, setShowRingAlert] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    if (family) subscribe(family.id);
  }, [family?.id]);

  // Handle incoming ring
  useEffect(() => {
    if (incomingRing && incomingRing.sender_id !== user?.id) {
      setShowRingAlert(true);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
  }, [incomingRing, user?.id]);

  const colorIndexFor = (id: string) => members.findIndex((m) => m.id === id);

  const handleRing = async (targetId: string | null) => {
    if (!family || !user) return;
    setRinging(true);
    await sendRingAlert(targetId, user.id, profile?.display_name ?? 'Family Member');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setTimeout(() => {
      setRinging(false);
      setShowRingModal(false);
    }, 800);
  };

  const handleStatusChange = async (status: MemberStatus) => {
    await updateProfile({ status });
    setShowStatusModal(false);
  };

  const handleEditName = async () => {
    if (!displayName.trim()) return;
    await updateProfile({ display_name: displayName.trim() });
    setShowEditName(false);
  };

  const handleCopyCode = async () => {
    if (!family) return;
    try {
      await Clipboard.setStringAsync(family.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // silent
    }
  };

  const handleShareCode = async () => {
    if (!family) return;
    try {
      await Share.share({
        message: `Join my family on Family Hub! Use code: ${family.code}`,
      });
    } catch {
      // silent
    }
  };

  const handleDismissRingAlert = () => {
    setShowRingAlert(false);
    clearIncomingRing();
  };

  const otherMembers = members.filter((m) => m.id !== user?.id);

  const renderMember = ({ item }: { item: typeof members[0] }) => {
    const idx = colorIndexFor(item.id);
    const sc = statusColors[item.status];
    const isMe = item.id === user?.id;

    return (
      <View style={styles.memberCard}>
        <Avatar name={item.display_name} size={52} status={item.status} colorIndex={idx} />
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>
            {item.display_name} {isMe && '(You)'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
            <Text style={[styles.statusText, { color: sc.text }]}>{statusLabels[item.status]}</Text>
          </View>
        </View>
        {!isMe && (
          <TouchableOpacity
            style={styles.ringBtn}
            onPress={() => handleRing(item.id)}
            disabled={ringing}
          >
            <Bell size={18} color={colors.secondary[600]} strokeWidth={2} />
            <Text style={styles.ringBtnText}>Ring</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const currentStatus = profile?.status ?? 'online';
  const currentSc = statusColors[currentStatus];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.screenTitle}>Family</Text>
            </View>

            {/* Family Code Card */}
            {family && (
              <View style={styles.codeCard}>
                <View style={styles.codeCardTop}>
                  <Users2 size={20} color={colors.primary[600]} strokeWidth={2} />
                  <Text style={styles.codeLabel}>Family Code</Text>
                </View>
                <Text style={styles.codeValue}>{family.code}</Text>
                <Text style={styles.codeHint}>Share this code to invite members</Text>
                <View style={styles.codeActions}>
                  <TouchableOpacity
                    style={[styles.codeActionBtn, styles.codeActionCopy]}
                    onPress={handleCopyCode}
                    activeOpacity={0.8}
                  >
                    {codeCopied ? (
                      <Check size={16} color={colors.success[600]} strokeWidth={2.5} />
                    ) : (
                      <Copy size={16} color={colors.primary[600]} strokeWidth={2} />
                    )}
                    <Text style={[styles.codeActionText, codeCopied && styles.codeActionTextCopied]}>
                      {codeCopied ? 'Copied!' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.codeActionBtn, styles.codeActionShare]}
                    onPress={handleShareCode}
                    activeOpacity={0.8}
                  >
                    <Share2 size={16} color={colors.neutral[0]} strokeWidth={2} />
                    <Text style={styles.codeActionShareText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Ring All Button */}
            {otherMembers.length > 0 && (
              <TouchableOpacity
                style={styles.ringAllBtn}
                onPress={() => handleRing(null)}
                disabled={ringing}
                activeOpacity={0.8}
              >
                <BellRing size={22} color={colors.neutral[0]} strokeWidth={2} />
                <Text style={styles.ringAllText}>Ring All Family Members</Text>
              </TouchableOpacity>
            )}

            {/* My Profile Card */}
            <Text style={styles.sectionTitle}>My Profile</Text>
            <View style={styles.profileCard}>
              <Avatar
                name={profile?.display_name ?? 'User'}
                size={56}
                status={profile?.status ?? 'online'}
                colorIndex={colorIndexFor(user?.id ?? '')}
              />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profile?.display_name}</Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
                <TouchableOpacity
                  style={[styles.statusBadge, { backgroundColor: currentSc.bg, marginTop: spacing.xs }]}
                  onPress={() => setShowStatusModal(true)}
                >
                  <View style={[styles.statusDot, { backgroundColor: currentSc.dot }]} />
                  <Text style={[styles.statusText, { color: currentSc.text }]}>{statusLabels[currentStatus]}</Text>
                  <Pencil size={11} color={currentSc.text} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.editNameBtn} onPress={() => { setDisplayName(profile?.display_name ?? ''); setShowEditName(true); }}>
              <UserIcon size={18} color={colors.primary[600]} strokeWidth={2} />
              <Text style={styles.editNameText}>Edit Display Name</Text>
            </TouchableOpacity>

            {/* Settings Section */}
            <Text style={styles.sectionTitle}>Settings</Text>
            <View style={styles.settingsCard}>
              <View style={styles.settingsRow}>
                <Shield size={20} color={colors.neutral[500]} strokeWidth={2} />
                <Text style={styles.settingsLabel}>Family Hub v1.0.0</Text>
              </View>
              <View style={styles.settingsDivider} />
              <View style={styles.settingsRow}>
                <Volume2 size={20} color={colors.neutral[500]} strokeWidth={2} />
                <Text style={styles.settingsLabel}>Notifications & Sounds</Text>
                <Text style={styles.settingsValue}>On</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
              <LogOut size={20} color={colors.error[500]} strokeWidth={2} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Family Members ({members.length})</Text>
          </View>
        }
        ListEmptyComponent={
          membersReady ? (
            <EmptyState
              icon={<Users2 size={56} color={colors.neutral[300]} strokeWidth={1.5} />}
              title="No family members"
              subtitle="Share your family code to invite members."
            />
          ) : null
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Status Picker Modal */}
      <ModalBase
        visible={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Set Your Status"
      >
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

      {/* Edit Name Modal */}
      <ModalBase
        visible={showEditName}
        onClose={() => setShowEditName(false)}
        title="Edit Display Name"
      >
        <View>
          <TextInput
            style={styles.nameInput}
            placeholder="Display name"
            placeholderTextColor={colors.neutral[400]}
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Button label="Save" onPress={handleEditName} fullWidth size="lg" icon={<Check size={20} color={colors.neutral[0]} strokeWidth={2} />} />
        </View>
      </ModalBase>

      {/* Incoming Ring Alert */}
      <Modal visible={showRingAlert} transparent animationType="fade" onRequestClose={handleDismissRingAlert}>
        <View style={styles.ringAlertOverlay}>
          <View style={styles.ringAlertCard}>
            <View style={styles.ringAlertIcon}>
              <BellRing size={48} color={colors.neutral[0]} strokeWidth={2.5} />
            </View>
            <Text style={styles.ringAlertTitle}>Ring Ring!</Text>
            <Text style={styles.ringAlertBody}>
              {members.find((m) => m.id === incomingRing?.sender_id)?.display_name ?? 'A family member'} is ringing you.
            </Text>
            <Button label="Dismiss" onPress={handleDismissRingAlert} variant="secondary" fullWidth size="lg" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  listContent: {
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
  // Family Code
  codeCard: {
    backgroundColor: colors.primary[50],
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary[200],
    alignItems: 'center',
  },
  codeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  codeLabel: {
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[600],
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeValue: {
    fontSize: 34,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[700],
    letterSpacing: 6,
    marginBottom: spacing.xs,
  },
  codeHint: {
    fontSize: 12,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
    marginBottom: spacing.md,
  },
  codeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  codeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  codeActionCopy: {
    backgroundColor: colors.neutral[0],
    borderWidth: 1.5,
    borderColor: colors.primary[200],
  },
  codeActionShare: {
    backgroundColor: colors.primary[500],
  },
  codeActionText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[600],
  },
  codeActionTextCopied: {
    color: colors.success[600],
  },
  codeActionShareText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },
  // Ring All
  ringAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.secondary[500],
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.secondary[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  ringAllText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },
  // Section
  sectionTitle: {
    fontSize: 17,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[800],
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Profile
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyMedium,
  },
  editNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  editNameText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[600],
  },
  // Settings
  settingsCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[700],
  },
  settingsValue: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[400],
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginVertical: spacing.sm,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error[50],
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  signOutText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.error[500],
  },
  // Member cards
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
    marginBottom: 4,
  },
  ringBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.secondary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.secondary[200],
  },
  ringBtnText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
    color: colors.secondary[600],
  },
  // Status modal
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
  // Name input
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
  // Ring alert
  ringAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(33,133,216,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  ringAlertCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  ringAlertIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.secondary[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  ringAlertTitle: {
    fontSize: 24,
    fontFamily: typography.fontFamilyBold,
    color: colors.secondary[700],
    marginBottom: spacing.sm,
  },
  ringAlertBody: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[600],
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
