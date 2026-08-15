import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, typography, radius, spacing } from '@/lib/theme';
import { Button } from '@/components/Button';
import { Mail, Lock, User, Home } from 'lucide-react-native';

// Required for expo-auth-session to properly handle redirects on web
WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { session, loading, signInWithEmail, signUpWithEmail, error, init } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  const handleSubmit = async () => {
    setLocalError(null);
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !displayName.trim()) {
      setLocalError('Please enter your name.');
      return;
    }
    setSubmitting(true);
    if (mode === 'signin') {
      const { error } = await signInWithEmail(email.trim(), password);
      if (error) setLocalError(error);
    } else {
      const { error } = await signUpWithEmail(email.trim(), password, displayName.trim());
      if (error) {
        setLocalError(error);
      } else {
        setMode('signin');
        setEmail('');
        setPassword('');
        setDisplayName('');
      }
    }
    setSubmitting(false);
  };

  const handleGoogleSignIn = async () => {
    try {
      setLocalError(null);
      setGoogleLoading(true);

      if (Platform.OS === 'web') {
        const redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://familyhub.aashisrijal.com.np';
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
          },
        });
        if (error) setLocalError(error.message);
        return;
      }

      // Native (Expo Go / Standalone)
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'familyhub',
        path: 'auth/callback',
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        setLocalError(error.message);
        setGoogleLoading(false);
        return;
      }

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (result.type === 'success' && result.url) {
          const hashIndex = result.url.indexOf('#');
          const queryIndex = result.url.indexOf('?');
          const fragmentString =
            hashIndex !== -1
              ? result.url.substring(hashIndex + 1)
              : queryIndex !== -1
              ? result.url.substring(queryIndex + 1)
              : '';

          const params = new URLSearchParams(fragmentString);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error: sessionErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionErr) setLocalError(sessionErr.message);
          }
        }
      }
    } catch (err: any) {
      setLocalError(err?.message ?? 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const displayError = localError || error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Family Hub</Text>
          <Text style={styles.tagline}>Your family, connected in real time.</Text>
        </View>

        {/* Google Sign In */}
        <TouchableOpacity
          style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
          onPress={handleGoogleSignIn}
          activeOpacity={0.85}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <View style={styles.googleIcon}>
              {/* Google "G" SVG-like logo using Text */}
              <Text style={styles.googleG}>G</Text>
            </View>
          )}
          <Text style={styles.googleBtnText}>
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, mode === 'signin' && styles.tabActive]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'signup' && (
            <View style={styles.inputWrap}>
              <User size={20} color={colors.neutral[400]} strokeWidth={2} />
              <TextInput
                style={styles.input}
                placeholder="Display Name"
                placeholderTextColor={colors.neutral[400]}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputWrap}>
            <Mail size={20} color={colors.neutral[400]} strokeWidth={2} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.neutral[400]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrap}>
            <Lock size={20} color={colors.neutral[400]} strokeWidth={2} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.neutral[400]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {displayError && <Text style={styles.errorText}>{displayError}</Text>}

          <Button
            label={mode === 'signin' ? 'Sign In' : 'Create Account'}
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />
        </View>

        <Text style={styles.footer}>
          {mode === 'signin'
            ? "Don't have an account? Tap Create Account above."
            : 'Already have an account? Tap Sign In above.'}
        </Text>
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
  logoImage: {
    width: 96,
    height: 96,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
  },
  appName: {
    fontSize: 32,
    lineHeight: 38,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  tagline: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    marginTop: spacing.xs,
  },
  // Google button
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.neutral[0],
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: spacing.lg,
  },
  googleBtnDisabled: {
    opacity: 0.7,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 18,
    fontFamily: typography.fontFamilyBold,
    color: '#4285F4',
    lineHeight: 22,
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[800],
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.neutral[200],
  },
  dividerText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
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
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.neutral[100],
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[900],
  },
  errorText: {
    color: colors.error[600],
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
    marginTop: spacing.lg,
  },
});
