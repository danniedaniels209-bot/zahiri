import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Button } from '../../components/ui';
import { alpha, colors } from '../../theme/tokens';
import { NARROW_MAX_WIDTH, useResponsive } from '../../theme/responsive';

const PILLARS = [
  {
    icon: 'shield-checkmark' as const,
    color: colors.zahiri,
    title: 'Check anything',
    body: 'A claim, a link, a photo, a voice note from a group chat.',
  },
  {
    icon: 'scan' as const,
    color: '#FF9A3C',
    title: 'Spot deepfakes',
    body: 'Zahiri looks for the signs that media was made or edited by AI.',
  },
  {
    icon: 'game-controller' as const,
    color: '#6C8BFF',
    title: 'Get sharper',
    body: 'Truth Hunters trains you to catch fakes without any help.',
  },
];

export default function Welcome() {
  const router = useRouter();
  const { width, gutter, isDesktop, isWide, fontScale } = useResponsive();

  // Sized from the live viewport, not a value captured at import. The glow is
  // also capped: scaled off a desktop width it washes out the whole page.
  const glowSize = Math.min(width * 1.4, 900);

  return (
    <SafeAreaView className="flex-1 bg-ink">
      <LinearGradient
        colors={[alpha(colors.zahiri, isDesktop ? 0.14 : 0.22), 'transparent']}
        style={{
          position: 'absolute',
          top: -glowSize * 0.45,
          alignSelf: 'center',
          width: glowSize,
          height: glowSize * 0.85,
          borderRadius: glowSize,
        }}
      />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="flex-1 w-full justify-between"
          style={{ maxWidth: NARROW_MAX_WIDTH, paddingHorizontal: gutter, paddingBottom: 24 }}
        >
          <View className="flex-1 justify-center" style={{ paddingTop: isWide ? 48 : 24 }}>
            <Animated.View entering={FadeInDown.duration(600)}>
              <View
                className="items-center justify-center rounded-2xl mb-7"
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: alpha(colors.zahiri, 0.15),
                  borderWidth: 1,
                  borderColor: alpha(colors.zahiri, 0.4),
                }}
              >
                <Ionicons name="shield-checkmark" size={30} color={colors.zahiri} />
              </View>

              <Text
                className="font-display text-chalk"
                style={{
                  fontSize: 46 * fontScale,
                  lineHeight: 50 * fontScale,
                  letterSpacing: -1.6,
                }}
              >
                Zahiri
              </Text>
              <Text
                className="font-display-medium mt-2"
                style={{
                  fontSize: 21 * fontScale,
                  lineHeight: 28 * fontScale,
                  color: colors.zahiri,
                  letterSpacing: -0.3,
                }}
              >
                Verified information,{'\n'}empowered minds.
              </Text>
              <Text
                className="font-sans text-chalk-soft mt-4"
                style={{ fontSize: 15 * fontScale, lineHeight: 23 * fontScale }}
              >
                Before you share it, check it. Zahiri verifies claims, links, images,
                and voice notes — in seconds.
              </Text>
            </Animated.View>

            <View className="mt-10" style={{ gap: 14 }}>
              {PILLARS.map((p, i) => (
                <Animated.View
                  key={p.title}
                  entering={FadeInUp.delay(200 + i * 110).duration(500)}
                  className="flex-row items-start"
                  style={{ gap: 14 }}
                >
                  <View
                    className="items-center justify-center rounded-xl"
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: alpha(p.color, 0.13),
                      borderWidth: 1,
                      borderColor: alpha(p.color, 0.3),
                    }}
                  >
                    <Ionicons name={p.icon} size={19} color={p.color} />
                  </View>
                  <View className="flex-1 pt-0.5">
                    <Text
                      className="font-semibold text-chalk"
                      style={{ fontSize: 15 * fontScale }}
                    >
                      {p.title}
                    </Text>
                    <Text
                      className="font-sans text-chalk-soft mt-0.5"
                      style={{ fontSize: 12.5 * fontScale, lineHeight: 18 * fontScale }}
                    >
                      {p.body}
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </View>

          <Animated.View
            entering={FadeIn.delay(650).duration(500)}
            className="pb-4 pt-8"
            style={{ gap: 12 }}
          >
            <Button
              title="Create an account"
              size="lg"
              onPress={() => router.push('/(auth)/sign-up')}
            />
            <Button
              title="I already have one"
              variant="secondary"
              size="lg"
              onPress={() => router.push('/(auth)/sign-in')}
            />
            <Text className="font-sans text-center text-chalk-faint mt-1" style={{ fontSize: 11.5 }}>
              Team I-SET · Nigeria
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
