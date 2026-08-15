export const colors = {
  primary: {
    50: '#FFF5F0',
    100: '#FFE4D6',
    200: '#FFC7A8',
    300: '#FFA578',
    400: '#FF8550',
    500: '#FF6B35',
    600: '#E5542B',
    700: '#BF3F1F',
    800: '#993018',
    900: '#732212',
  },
  secondary: {
    50: '#F0F7FF',
    100: '#D9ECFF',
    200: '#B3D9FF',
    300: '#7DBEFC',
    400: '#4A9FF0',
    500: '#2185D8',
    600: '#1A6BB0',
    700: '#15548B',
    800: '#103D66',
    900: '#0B2A47',
  },
  accent: {
    50: '#F0FBF7',
    100: '#D5F4E6',
    200: '#AEE8CD',
    300: '#7DD5AE',
    400: '#4DBE8E',
    500: '#2BA873',
    600: '#1F8759',
    700: '#196B47',
    800: '#135237',
    900: '#0D3A26',
  },
  success: {
    50: '#F0FBF7',
    100: '#C9F0DC',
    200: '#92E0B8',
    300: '#5BCA91',
    400: '#33B270',
    500: '#1F9558',
    600: '#177845',
    700: '#135C36',
    800: '#0E4429',
    900: '#0A301D',
  },
  warning: {
    50: '#FFFBF0',
    100: '#FFF3CC',
    200: '#FFE699',
    300: '#FFD266',
    400: '#FFBF3D',
    500: '#F5A623',
    600: '#CC8418',
    700: '#A36814',
    800: '#7A4D10',
    900: '#52340B',
  },
  error: {
    50: '#FFF0F0',
    100: '#FFD6D6',
    200: '#FFADAD',
    300: '#FF7878',
    400: '#F55555',
    500: '#E03232',
    600: '#B52424',
    700: '#8C1B1B',
    800: '#631313',
    900: '#420C0C',
  },
  neutral: {
    0: '#FFFFFF',
    50: '#F8F9FA',
    100: '#F0F2F5',
    200: '#E2E6EC',
    300: '#CDD3DC',
    400: '#A8B2C0',
    500: '#7C8899',
    600: '#5C6776',
    700: '#434C58',
    800: '#2D333B',
    900: '#1A1E24',
    950: '#0F1216',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  fontFamilyRegular: 'Inter-Regular',
  fontFamilyMedium: 'Inter-Medium',
  fontFamilyBold: 'Inter-Bold',
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Inter-Bold',
  },
  subheading: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Inter-Bold',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Inter-Regular',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Inter-Regular',
  },
  small: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter-Regular',
  },
};

export const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  online: { bg: colors.success[50], text: colors.success[700], dot: colors.success[500] },
  away: { bg: colors.warning[50], text: colors.warning[700], dot: colors.warning[500] },
  dnd: { bg: colors.error[50], text: colors.error[700], dot: colors.error[500] },
};

export const statusLabels: Record<string, string> = {
  online: 'Online',
  away: 'Away',
  dnd: 'Do Not Disturb',
};

export const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: colors.error[50], text: colors.error[700], border: colors.error[300] },
  medium: { bg: colors.warning[50], text: colors.warning[700], border: colors.warning[300] },
  low: { bg: colors.accent[50], text: colors.accent[700], border: colors.accent[300] },
};

export const priorityLabels: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
