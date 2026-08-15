import { StyleSheet, Text, View, Modal, TouchableOpacity, Platform } from 'react-native';
import { colors, typography, radius, spacing } from '@/lib/theme';
import { X } from 'lucide-react-native';

interface ModalBaseProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function ModalBase({ visible, onClose, title, children }: ModalBaseProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <X size={22} color={colors.neutral[500]} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,18,22,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'web' ? spacing.lg : spacing.xxl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
  },
});
