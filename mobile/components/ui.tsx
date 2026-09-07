import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type RefreshControlProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { alpha, colors, spring, verdictOf } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  className = '',
  refreshControl,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  className?: string;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const Body = (
    <View className={`flex-1 px-gutter ${className}`}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} className="flex-1 bg-ink">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {Body}
        </ScrollView>
      ) : (
        Body
      )}
    </SafeAreaView>
  );
}

/** Page header with the oversized display type the design system leans on. */
export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between pt-2 pb-6">
      <View className="flex-1 pr-3">
        <Text className="font-display text-h1 text-chalk" style={{ letterSpacing: -0.8 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="font-sans text-body text-chalk-soft mt-1.5">{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between mb-3 mt-6">
      <Text
        className="font-semibold text-micro text-chalk-faint uppercase"
        style={{ letterSpacing: 1.2 }}
      >
        {children}
      </Text>
      {action}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

interface CardProps extends ViewProps {
  children: ReactNode;
  /** Index in a list, used to stagger the entrance animation. */
  index?: number;
  glow?: string;
}

export function Card({ children, index = 0, glow, className = '', ...rest }: CardProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(420).springify()}
      className={`bg-ink-raised border border-ink-edge rounded-card p-4 ${className}`}
      style={
        glow
          ? {
              shadowColor: glow,
              shadowOpacity: 0.28,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }
          : undefined
      }
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

/** Card that responds to touch with a spring scale. */
export function TouchCard({
  children,
  onPress,
  index = 0,
  glow,
  className = '',
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  index?: number;
  glow?: string;
  className?: string;
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(420).springify()}>
      <AnimatedPressable
        disabled={disabled}
        onPressIn={() => {
          scale.value = withSpring(0.975, spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, spring);
        }}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        style={[
          style,
          glow
            ? {
                shadowColor: glow,
                shadowOpacity: 0.25,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
                elevation: 5,
              }
            : undefined,
        ]}
        className={`bg-ink-raised border border-ink-edge rounded-card p-4 ${className} ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {children}
      </AnimatedPressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  full?: boolean;
}

export const Button = forwardRef<View, ButtonProps>(function Button(
  { title, variant = 'primary', size = 'md', loading, icon, full = true, disabled, onPress, ...rest },
  ref,
) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const isDisabled = disabled || loading;
  const height = size === 'lg' ? 56 : 48;

  const palette = {
    primary: { bg: colors.zahiri, fg: colors.inkDeep, border: 'transparent' },
    secondary: { bg: colors.inkHigh, fg: colors.chalk, border: colors.inkEdge },
    ghost: { bg: 'transparent', fg: colors.chalkSoft, border: 'transparent' },
    danger: { bg: alpha('#FF4757', 0.16), fg: '#FF4757', border: alpha('#FF4757', 0.4) },
  }[variant];

  return (
    <Animated.View style={[animStyle, full ? undefined : { alignSelf: 'flex-start' }]}>
      <Pressable
        ref={ref}
        disabled={isDisabled}
        onPressIn={() => {
          scale.value = withSpring(0.97, spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, spring);
        }}
        onPress={(e) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress?.(e);
        }}
        style={{
          height,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' || variant === 'danger' ? 1 : 0,
          borderRadius: 999,
          opacity: isDisabled ? 0.55 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 24,
        }}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
            <Text
              style={{
                color: palette.fg,
                fontFamily: 'Inter_600SemiBold',
                fontSize: size === 'lg' ? 16 : 15,
              }}
            >
              {title}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
});

export function Chip({
  label,
  color = colors.chalkSoft,
  active,
  onPress,
  icon,
}: {
  label: string;
  color?: string;
  active?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const body = (
    <View
      className="flex-row items-center rounded-pill px-3 py-1.5"
      style={{
        backgroundColor: active ? alpha(color, 0.18) : colors.inkHigh,
        borderWidth: 1,
        borderColor: active ? alpha(color, 0.5) : colors.inkEdge,
        gap: 5,
      }}
    >
      {icon ? <Ionicons name={icon} size={13} color={active ? color : colors.chalkFaint} /> : null}
      <Text
        style={{
          color: active ? color : colors.chalkSoft,
          fontFamily: 'Inter_500Medium',
          fontSize: 12.5,
        }}
      >
        {label}
      </Text>
    </View>
  );

  return onPress ? (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}

// ---------------------------------------------------------------------------
// Verdict language
// ---------------------------------------------------------------------------

export function VerdictBadge({
  verdict,
  size = 'md',
}: {
  verdict: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const v = verdictOf(verdict);
  const compact = size === 'sm';

  return (
    <View
      className="flex-row items-center rounded-pill"
      style={{
        backgroundColor: alpha(v.color, 0.15),
        borderWidth: 1,
        borderColor: alpha(v.color, 0.45),
        paddingHorizontal: compact ? 8 : 11,
        paddingVertical: compact ? 3 : 5,
        gap: 5,
      }}
    >
      <Ionicons name={v.icon as never} size={compact ? 12 : 15} color={v.color} />
      <Text
        style={{
          color: v.color,
          fontFamily: 'Inter_700Bold',
          fontSize: compact ? 10 : 11.5,
          letterSpacing: 0.7,
        }}
      >
        {v.short}
      </Text>
    </View>
  );
}

/** Horizontal confidence bar, tinted by the verdict it belongs to. */
export function ConfidenceMeter({
  value,
  verdict,
  label = 'Confidence',
}: {
  value: number;
  verdict?: string | null;
  label?: string;
}) {
  const v = verdictOf(verdict);
  const pct = Math.max(0, Math.min(100, value));

  return (
    <View>
      <View className="flex-row justify-between mb-1.5">
        <Text className="font-medium text-caption text-chalk-faint">{label}</Text>
        <Text style={{ color: v.color, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
          {pct}%
        </Text>
      </View>
      <View className="h-1.5 rounded-pill overflow-hidden" style={{ backgroundColor: colors.inkHigh }}>
        <LinearGradient
          colors={[alpha(v.color, 0.55), v.color]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: `${pct}%`, height: '100%', borderRadius: 999 }}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View className="items-center justify-center py-16" style={{ gap: 12 }}>
      <ActivityIndicator color={colors.zahiri} size="large" />
      <Text className="font-sans text-caption text-chalk-faint">{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center justify-center py-14 px-6">
      <View
        className="items-center justify-center rounded-full mb-4"
        style={{ width: 64, height: 64, backgroundColor: colors.inkHigh }}
      >
        <Ionicons name={icon} size={28} color={colors.chalkFaint} />
      </View>
      <Text className="font-display-medium text-title text-chalk text-center">{title}</Text>
      {body ? (
        <Text className="font-sans text-body text-chalk-soft text-center mt-2">{body}</Text>
      ) : null}
      {action ? <View className="mt-5 w-full">{action}</View> : null}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View
      className="flex-row rounded-card p-3.5"
      style={{
        backgroundColor: alpha('#FF4757', 0.12),
        borderWidth: 1,
        borderColor: alpha('#FF4757', 0.35),
        gap: 10,
      }}
    >
      <Ionicons name="alert-circle" size={18} color="#FF4757" style={{ marginTop: 1 }} />
      <Text className="flex-1 font-sans text-caption" style={{ color: '#FFB4BB', lineHeight: 18 }}>
        {message}
      </Text>
    </View>
  );
}
