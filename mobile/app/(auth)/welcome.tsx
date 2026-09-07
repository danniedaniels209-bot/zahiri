import { View, Text, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Button } from '../../components/ui';
import { alpha, colors } from '../../theme/tokens';

const { width } = Dimensions.get('window');

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

  return (
    <SafeAreaView className="flex-1 bg-ink">
      {/* Ambient glow behind the wordmark */}
      <LinearGradient
        colors={[alpha(colors.zahiri, 0.22), 'transparent']}
        style={{
          position: 'absolute',
          top: -width * 0.5,
          left: -width * 0.2,
          width: width * 1.4,
          height: width * 1.2,
          borderRadius: width,
        }}
      />

      <View className="flex-1 px-gutter justify-between">
        <View className="flex-1 justify-center">
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
              style={{ fontSize: 46, lineHeight: 50, letterSpacing: -1.6 }}
            >
              Zahiri
            </Text>
            <Text
              className="font-display-medium mt-2"
              style={{ fontSize: 21, lineHeight: 28, color: colors.zahiri, letterSpacing: -0.3 }}
            >
              Verified information,{'\n'}empowered minds.
            </Text>
            <Text className="font-sans text-body text-chalk-soft mt-4" style={{ maxWidth: 320 }}>
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
                  <Text className="font-semibold text-chalk" style={{ fontSize: 15 }}>
                    {p.title}
                  </Text>
                  <Text className="font-sans text-caption text-chalk-soft mt-0.5" style={{ lineHeight: 18 }}>
                    {p.body}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>

        <Animated.View entering={FadeIn.delay(650).duration(500)} className="pb-4" style={{ gap: 12 }}>
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
    </SafeAreaView>
  );
}
