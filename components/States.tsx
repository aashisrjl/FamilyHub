import { StyleSheet, Text, View, ActivityIndicator, Image } from 'react-native';
import { colors, typography, spacing } from '@/lib/theme';

interface EmptyStateProps {
  icon?: React.ReactNode;
  image?: string;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, image, title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.iconWrap}>{icon}</View>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading...' }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary[500]} />
      <Text style={styles.subtitle} testID="loading-text">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    marginBottom: spacing.md,
  },
  image: {
    width: 120,
    height: 120,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[800],
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
