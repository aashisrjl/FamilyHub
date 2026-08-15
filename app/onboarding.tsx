import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuthStore } from '@/lib/auth-store';
import { useFamilyStore } from '@/lib/family-store';
import { colors, typography, radius, spacing } from '@/lib/theme';
import { Button } from '@/components/Button';
import { Home, Plus, ArrowRight } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile, loading: authLoading } = useAuthStore();
  const { createFamily, joinFamily, loading, error } = useFamilyStore();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async () => {
    setLocalError(null);
    if (!user) return;
    if (mode === 'create') {
      if (!familyName.trim()) {
        setLocalError('Please enter a name for your family.');
        return;
      }
      const { error } = await createFamily(familyName.trim(), user.id);
      if (error) {
        setLocalError(error);
      } else {
        await refreshProfile();
        router.replace('/(tabs)');
      }
    } else {
      if (code.trim().length !== 6) {
        setLocalError('Family code must be 6 characters.');
        return;
      }
      const { error } = await joinFamily(code.trim(), user.id);
      if (error) {
        setLocalError(error);
      } else {
        await refreshProfile();
        router.replace('/(tabs)');
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/auth');
  };

  const displayError = localError || error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoWrap}>
            <Home size={36} color={colors.primary[500]} strokeWidth={2} />
          </View>
          <Text style={styles.title}>Set Up Your Family</Text>
          <Text style={styles.subtitle}>
            Welcome{profile ? `, ${profile.display_name}` : ''}! Create a new family room or join an existing one with a code.
          </Text>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, mode === 'create' && styles.tabActive]}
            onPress={() => setMode('create')}
          >
            <Plus size={18} color={mode === 'create' ? colors.neutral[900] : colors.neutral[400]} strokeWidth={2} />
            <Text style={[styles.tabText, mode === 'create' && styles.tabTextActive]}>Create Family</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'join' && styles.tabActive]}
            onPress={() => setMode('join')}
          >
            <ArrowRight size={18} color={mode === 'join' ? colors.neutral[900] : colors.neutral[400]} strokeWidth={2} />
            <Text style={[styles.tabText, mode === 'join' && styles.tabTextActive]}>Join Family</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {mode === 'create' ? (
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Family Name (e.g. The Smiths)"
                placeholderTextColor={colors.neutral[400]}
                value={familyName}
                onChangeText={setFamilyName}
              />
            </View>
          ) : (
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="ABCDEF"
                placeholderTextColor={colors.neutral[300]}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
              />
            </View>
          )}

          {displayError && <Text style={styles.errorText}>{displayError}</Text>}

          <Button
            label={mode === 'create' ? 'Create Family Room' : 'Join Family'}
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
          />
        </View>

        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.neutral[100],
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.neutral[0],
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[500],
  },
  tabTextActive: {
    color: colors.neutral[900],
    fontFamily: typography.fontFamilyBold,
  },
  form: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  inputWrap: {
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[900],
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 28,
    fontFamily: typography.fontFamilyBold,
    letterSpacing: 8,
  },
  errorText: {
    color: colors.error[600],
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  signOutBtn: {
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.sm,
  },
  signOutText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
  },
});
