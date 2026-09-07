import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  type SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { alpha, colors } from '../theme/tokens';

const STAGES = [
  'Reading the content',
  'Checking the source',
  'Looking for manipulation',
  'Weighing the evidence',
];

/**
 * The waiting state for a verification. Two expanding rings plus a rotating
 * sweep, driven entirely on the UI thread by Reanimated so it stays smooth
 * while the request is in flight.
 */
export function ScanPulse({ label }: { label?: string }) {
  const pulse = useSharedValue(0);
  const sweep = useSharedValue(0);
  const stage = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    sweep.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
    stage.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 2200 }),
        withTiming(1, { duration: 2200 }),
        withTiming(2, { duration: 2200 }),
        withTiming(3, { duration: 2200 }),
      ),
      -1,
      false,
    );
  }, [pulse, sweep, stage]);

  const ringOuter = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.85, 1.7]) }],
    opacity: interpolate(pulse.value, [0, 0.6, 1], [0.5, 0.18, 0]),
  }));

  const ringInner = useAnimatedStyle(() => {
    const p = (pulse.value + 0.5) % 1;
    return {
      transform: [{ scale: interpolate(p, [0, 1], [0.85, 1.7]) }],
      opacity: interpolate(p, [0, 0.6, 1], [0.5, 0.18, 0]),
    };
  });

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value * 360}deg` }],
  }));

  return (
    <View className="items-center py-10">
      <View className="items-center justify-center" style={{ width: 140, height: 140 }}>
        {[ringOuter, ringInner].map((style, i) => (
          <Animated.View
            key={i}
            style={[
              {
                position: 'absolute',
                width: 92,
                height: 92,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: colors.zahiri,
              },
              style,
            ]}
          />
        ))}

        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 108,
              height: 108,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: 'transparent',
              borderTopColor: colors.zahiri,
              borderRightColor: alpha(colors.zahiri, 0.35),
            },
            sweepStyle,
          ]}
        />

        <View
          className="items-center justify-center rounded-full"
          style={{
            width: 66,
            height: 66,
            backgroundColor: alpha(colors.zahiri, 0.14),
            borderWidth: 1,
            borderColor: alpha(colors.zahiri, 0.4),
          }}
        >
          <Ionicons name="shield-checkmark" size={28} color={colors.zahiri} />
        </View>
      </View>

      <Text className="font-display-medium text-title text-chalk mt-5">
        {label ?? 'Checking'}
      </Text>
      <StageText stage={stage} />
    </View>
  );
}

/** Cycles the sub-label in step with the animation. */
function StageText({ stage }: { stage: SharedValue<number> }) {
  return (
    <View style={{ height: 20, marginTop: 6, justifyContent: 'center' }}>
      {STAGES.map((text, i) => (
        <StageLine key={text} text={text} index={i} stage={stage} />
      ))}
    </View>
  );
}

/** One line of the cycling label. Each owns its own hook, so the rules hold. */
function StageLine({
  text,
  index,
  stage,
}: {
  text: string;
  index: number;
  stage: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(Math.abs(stage.value - index) < 0.5 ? 1 : 0, { duration: 260 }),
  }));

  return (
    <Animated.Text
      style={[
        {
          position: 'absolute',
          fontFamily: 'Inter_400Regular',
          fontSize: 13,
          color: colors.chalkSoft,
        },
        style,
      ]}
    >
      {text}
    </Animated.Text>
  );
}
