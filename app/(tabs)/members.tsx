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
  Alert,
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
  MapPin,
  Navigation,
  Home,
  Crown,
  UserCheck,
  UserX,
  MoreVertical,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { calculateDistance, formatDistance, getCurrentUserLocation } from '@/lib/location-utils';

export default function MembersScreen() {
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuthStore();
  const {
    family,
    members,
    membersReady,
    subscribe,
    incomingRing,
    clearIncomingRing,
    sendRingAlert,
    myLocation,
    updateMyLocation,
    setHomeLocation,
    promoteToAdmin,
    demoteToMember,
    removeMember,
  } = useFamilyStore();
  const [ringing, setRinging] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (family) subscribe(family.id);
  }, [family?.id]);

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
    }, 800);
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

  const handleUpdateLocation = async () => {
    if (!user) return;
    setLocating(true);
    setLocationStatus('Fetching GPS location...');
    const loc = await updateMyLocation(user.id, profile?.display_name);
    setLocating(false);

    if (loc) {
      const nearby = members.filter((m) => {
        if (m.id === user.id) return false;
        if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
          const dist = calculateDistance(loc.latitude, loc.longitude, m.latitude, m.longitude);
          return dist <= 500;
        }
        return false;
      });

      if (nearby.length > 0) {
        setLocationStatus(`📍 Location updated! ${nearby.length} family member(s) nearby.`);
        for (const n of nearby) {
          sendRingAlert(n.id, user.id, profile?.display_name ?? 'Family Member');
        }
      } else {
        setLocationStatus('📍 Location updated and shared with family!');
      }
    } else {
      setLocationStatus('⚠️ Could not access GPS location. Check permissions.');
    }
  };

  const [selectedMember, setSelectedMember] = useState<typeof members[0] | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);

  const isAmAdmin = profile?.role === 'admin' || family?.created_by === user?.id;

  const handlePromoteAdmin = async (targetId: string) => {
    await promoteToAdmin(targetId);
    setShowAdminModal(false);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleDemoteMember = async (targetId: string) => {
    await demoteToMember(targetId);
    setShowAdminModal(false);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  };

  const handleRemoveMember = async (targetId: string, name: string) => {
    if (Platform.OS === 'web') {
      await removeMember(targetId);
      setShowAdminModal(false);
    } else {
      Alert.alert('Remove Member', `Are you sure you want to remove ${name} from your family?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeMember(targetId);
            setShowAdminModal(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]);
    }
  };

  const handleSetHomeLocation = async () => {
    setLocating(true);
    setLocationStatus('Updating Family Home location...');
    const loc = await getCurrentUserLocation();
    setLocating(false);
    if (loc) {
      const ok = await setHomeLocation(loc.latitude, loc.longitude, 'Family Home');
      if (ok) {
        setLocationStatus('🏠 Family Home location updated successfully!');
      } else {
        setLocationStatus('⚠️ Failed to save home location.');
      }
    } else {
      setLocationStatus('⚠️ GPS unavailable to set home location.');
    }
  };

  const otherMembers = members.filter((m) => m.id !== user?.id);

  const renderMember = ({ item }: { item: typeof members[0] }) => {
    const idx = colorIndexFor(item.id);
    const sc = statusColors[item.status];
    const isMe = item.id === user?.id;
    const isMemberAdmin = item.role === 'admin' || family?.created_by === item.id;

    let distanceStr: string | null = null;
    if (!isMe && myLocation && typeof item.latitude === 'number' && typeof item.longitude === 'number') {
      const meters = calculateDistance(myLocation.latitude, myLocation.longitude, item.latitude, item.longitude);
      distanceStr = formatDistance(meters);
    }

    let homeBadge: { label: string; isHome: boolean } | null = null;
    if (family?.home_latitude && family?.home_longitude && typeof item.latitude === 'number' && typeof item.longitude === 'number') {
      const radius = family.home_radius_meters ?? 200;
      const metersToHome = calculateDistance(item.latitude, item.longitude, family.home_latitude, family.home_longitude);
      if (metersToHome <= radius) {
        homeBadge = { label: '🏠 At Home', isHome: true };
      } else {
        homeBadge = { label: `🚗 Away (${formatDistance(metersToHome)})`, isHome: false };
      }
    }

    return (
      <View style={styles.memberCard}>
        <Avatar name={item.display_name} size={52} status={item.status} colorIndex={idx} />
        <View style={styles.memberInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.memberName}>
              {item.display_name} {isMe && '(You)'}
            </Text>
            {isMemberAdmin && (
              <View style={styles.adminBadge}>
                <Crown size={12} color="#D97706" strokeWidth={2.5} />
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
              <Text style={[styles.statusText, { color: sc.text }]}>{statusLabels[item.status]}</Text>
            </View>

            {homeBadge && (
              <View style={[styles.homeGeofenceBadge, homeBadge.isHome ? styles.homeBadgeAtHome : styles.homeBadgeAway]}>
                <Text style={[styles.homeGeofenceText, homeBadge.isHome ? styles.homeTextAtHome : styles.homeTextAway]}>
                  {homeBadge.label}
                </Text>
              </View>
            )}

            {distanceStr && (
              <View style={styles.distanceBadge}>
                <MapPin size={11} color={colors.primary[600]} strokeWidth={2} />
                <Text style={styles.distanceText}>{distanceStr}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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

          {isAmAdmin && !isMe && (
            <TouchableOpacity
              style={styles.adminMoreBtn}
              onPress={() => {
                setSelectedMember(item);
                setShowAdminModal(true);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MoreVertical size={20} color={colors.neutral[500]} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
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

            {/* Location & Proximity Action Card */}
            <View style={styles.locationCard}>
              <View style={styles.locationHeader}>
                <Navigation size={20} color={colors.primary[600]} strokeWidth={2} />
                <Text style={styles.locationTitle}>Proximity & Location Sync</Text>
              </View>
              <Text style={styles.locationSubtitle}>
                Sync your GPS location with your family. If family members are nearby (within 500m), an automatic proximity notification & ring will be triggered!
              </Text>
              <TouchableOpacity
                style={styles.locationBtn}
                onPress={handleUpdateLocation}
                disabled={locating}
                activeOpacity={0.8}
              >
                <MapPin size={18} color={colors.neutral[0]} strokeWidth={2} />
                <Text style={styles.locationBtnText}>
                  {locating ? 'Updating GPS Location...' : 'Sync Location & Check Nearby'}
                </Text>
              </TouchableOpacity>
              {locationStatus && <Text style={styles.locationStatusText}>{locationStatus}</Text>}
            </View>

            {/* Family Home Location Card */}
            <View style={styles.homeLocationCard}>
              <View style={styles.locationHeader}>
                <Home size={20} color={colors.secondary[600]} strokeWidth={2} />
                <Text style={styles.homeLocationTitle}>Family Home Surrounding</Text>
              </View>
              <Text style={styles.locationSubtitle}>
                {family?.home_latitude && family?.home_longitude
                  ? `Home location recorded (${family.home_address_name || 'Family Home'}). System tracks family members entering/leaving within ${family.home_radius_meters ?? 200}m.`
                  : 'Home location not set. Tap below to establish current GPS location as Family Home for arrival/departure alerts.'}
              </Text>
              <TouchableOpacity
                style={styles.setHomeBtn}
                onPress={handleSetHomeLocation}
                disabled={locating}
                activeOpacity={0.8}
              >
                <Home size={18} color={colors.secondary[700]} strokeWidth={2} />
                <Text style={styles.setHomeBtnText}>Set Current Location as Family Home</Text>
              </TouchableOpacity>
            </View>

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

            {/* Family Members Section */}
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

      {/* Admin Actions Modal */}
      <ModalBase
        visible={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        title={`Manage ${selectedMember?.display_name ?? 'Member'}`}
      >
        {selectedMember && (
          <View style={styles.adminModalContent}>
            {selectedMember.role === 'admin' || family?.created_by === selectedMember.id ? (
              <TouchableOpacity
                style={styles.adminOptionBtn}
                onPress={() => handleDemoteMember(selectedMember.id)}
              >
                <UserX size={20} color={colors.warning[600]} strokeWidth={2} />
                <Text style={styles.adminOptionText}>Demote to Standard Member</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.adminOptionBtn}
                onPress={() => handlePromoteAdmin(selectedMember.id)}
              >
                <UserCheck size={20} color={colors.success[600]} strokeWidth={2} />
                <Text style={styles.adminOptionText}>Make Family Admin</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.adminOptionBtn, styles.adminOptionDanger]}
              onPress={() => handleRemoveMember(selectedMember.id, selectedMember.display_name)}
            >
              <LogOut size={20} color={colors.error[500]} strokeWidth={2} />
              <Text style={styles.adminOptionDangerText}>Remove from Family</Text>
            </TouchableOpacity>
          </View>
        )}
      </ModalBase>
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
  // Location Proximity Card
  locationCard: {
    backgroundColor: colors.primary[50],
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary[200],
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  locationTitle: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[700],
  },
  locationSubtitle: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[600],
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  locationBtnText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[0],
  },
  locationStatusText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[700],
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  distanceText: {
    fontSize: 11,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[700],
  },
  // Family Home Location Card
  homeLocationCard: {
    backgroundColor: colors.secondary[50],
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.secondary[200],
  },
  homeLocationTitle: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.secondary[700],
  },
  setHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.neutral[0],
    paddingVertical: spacing.md - 2,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.secondary[300],
  },
  setHomeBtnText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
    color: colors.secondary[700],
  },
  homeGeofenceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  homeBadgeAtHome: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  homeBadgeAway: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  homeGeofenceText: {
    fontSize: 11,
    fontFamily: typography.fontFamilyBold,
  },
  homeTextAtHome: {
    color: colors.success[700],
  },
  homeTextAway: {
    color: colors.warning[700],
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
  // Admin styles
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
  adminMoreBtn: {
    padding: spacing.xs,
    borderRadius: radius.md,
  },
  adminModalContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  adminOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.neutral[50],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  adminOptionText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[800],
  },
  adminOptionDanger: {
    backgroundColor: colors.error[50],
    borderColor: colors.error[200],
  },
  adminOptionDangerText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyBold,
    color: colors.error[600],
  },
});
