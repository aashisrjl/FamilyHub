import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, View } from 'react-native';
import { colors, typography, radius, spacing } from '@/lib/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const variantStyles = {
    primary: { bg: colors.primary[500], text: colors.neutral[0] },
    secondary: { bg: colors.secondary[500], text: colors.neutral[0] },
    danger: { bg: colors.error[500], text: colors.neutral[0] },
    ghost: { bg: 'transparent', text: colors.primary[600] },
    outline: { bg: 'transparent', text: colors.primary[600] },
  };

  const sizeStyles = {
    sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: 14 },
    md: { paddingVertical: spacing.md - 2, paddingHorizontal: spacing.lg, fontSize: 16 },
    lg: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, fontSize: 17 },
  };

  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: v.bg, paddingVertical: s.paddingVertical, paddingHorizontal: s.paddingHorizontal },
        variant === 'outline' && { borderWidth: 2, borderColor: colors.primary[500] },
        fullWidth && { width: '100%' },
        (disabled || loading) && { opacity: 0.5 },
      ]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text style={[styles.label, { color: v.text, fontSize: s.fontSize }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    marginRight: spacing.xs,
  },
  label: {
    fontFamily: typography.fontFamilyBold,
    fontWeight: '600',
  },
});
