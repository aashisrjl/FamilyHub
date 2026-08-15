import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { colors, typography, radius, spacing } from '@/lib/theme';
import { getInitials } from '@/lib/helpers';
import type { MemberStatus } from '@/lib/types';
import { statusColors } from '@/lib/theme';

interface AvatarProps {
  name: string;
  size?: number;
  status?: MemberStatus | null;
  colorIndex?: number;
}

const avatarColors = [
  colors.primary[400],
  colors.secondary[400],
  colors.accent[400],
  colors.warning[400],
  colors.success[400],
  colors.secondary[300],
  colors.primary[300],
  colors.accent[300],
];

export function Avatar({ name, size = 44, status = null, colorIndex = 0 }: AvatarProps) {
  const bg = avatarColors[colorIndex % avatarColors.length];
  const initials = getInitials(name);
  const fontSize = size * 0.38;
  const sc = status ? statusColors[status] : null;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        ]}
      >
        <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
      </View>
      {sc && (
        <View
          style={[
            styles.statusDot,
            {
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: (size * 0.28) / 2,
              backgroundColor: sc.dot,
              borderColor: colors.neutral[0],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.neutral[0],
    fontFamily: typography.fontFamilyBold,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
  },
});
