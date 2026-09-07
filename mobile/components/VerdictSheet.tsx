import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ConfidenceMeter, VerdictBadge } from './ui';
import type { VerificationResult } from '../lib/api';
import { alpha, colors, verdictOf } from '../theme/tokens';

/**
 * The full verdict readout. Every signal the engine used is shown, including the
 * ones it could not check, so a user is never left guessing what "verified"
 * actually covered.
 */
export function VerdictSheet({ result }: { result: VerificationResult }) {
  const v = verdictOf(result.verdict);
  const df = result.signals.deepfake;
  const prov = result.signals.provenance;
  const rep = result.signals.sourceReputation;

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()} style={{ gap: 12 }}>
      {/* Headline verdict */}
      <LinearGradient
        colors={[alpha(v.color, 0.2), alpha(v.color, 0.03)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: alpha(v.color, 0.38),
          padding: 18,
        }}
      >
        <View className="flex-row items-center mb-3" style={{ gap: 11 }}>
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 44, height: 44, backgroundColor: alpha(v.color, 0.2) }}
          >
            <Ionicons name={v.icon as never} size={24} color={v.color} />
          </View>
          <View className="flex-1">
            <Text
              className="font-display"
              style={{ fontSize: 24, color: v.color, letterSpacing: -0.5 }}
            >
              {v.label}
            </Text>
            <Text className="font-sans text-chalk-soft" style={{ fontSize: 12 }}>
              {v.blurb}
            </Text>
          </View>
        </View>

        <ConfidenceMeter value={result.confidence} verdict={result.verdict} />

        <Text
          className="font-sans text-chalk mt-4"
          style={{ fontSize: 14.5, lineHeight: 22 }}
        >
          {result.explanation}
        </Text>
      </LinearGradient>

      {/* Human review notice */}
      {result.humanReview.required ? (
        <View
          className="flex-row rounded-2xl p-3.5"
          style={{
            backgroundColor: alpha(colors.info, 0.12),
            borderWidth: 1,
            borderColor: alpha(colors.info, 0.3),
            gap: 10,
          }}
        >
          <Ionicons name="person-circle-outline" size={19} color={colors.info} />
          <View className="flex-1">
            <Text style={{ color: colors.info, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
              Sent to a human fact-checker
            </Text>
            <Text className="font-sans text-chalk-soft mt-0.5" style={{ fontSize: 12, lineHeight: 17 }}>
              This one matters enough that a person is reviewing it. You will be notified.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Deepfake signal */}
      {df.checked ? (
        <SignalCard
          icon="scan-outline"
          title="Synthetic media check"
          tint={
            (df.score ?? 0) >= 70 ? '#FF4757' : (df.score ?? 0) >= 40 ? '#FFB020' : colors.zahiri
          }
        >
          <ConfidenceMeter
            value={df.score ?? 0}
            verdict={(df.score ?? 0) >= 70 ? 'false' : (df.score ?? 0) >= 40 ? 'unverified' : 'verified'}
            label="Likelihood this was made or edited by AI"
          />
          {df.indicators.length > 0 ? (
            <View className="mt-3" style={{ gap: 6 }}>
              {df.indicators.map((ind, i) => (
                <View key={i} className="flex-row" style={{ gap: 7 }}>
                  <Text style={{ color: colors.chalkFaint, fontSize: 12 }}>•</Text>
                  <Text
                    className="flex-1 font-sans text-chalk-soft"
                    style={{ fontSize: 12.5, lineHeight: 18 }}
                  >
                    {ind}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </SignalCard>
      ) : null}

      {/* Provenance signal */}
      {prov.checked ? (
        <SignalCard
          icon="ribbon-outline"
          title="Content Credentials"
          tint={prov.hasCredentials ? colors.zahiri : colors.chalkSoft}
        >
          <Text className="font-sans text-chalk-soft" style={{ fontSize: 12.5, lineHeight: 18 }}>
            {prov.hasCredentials
              ? `This file carries Content Credentials${prov.issuer ? `, naming ${prov.issuer}` : ''}. Zahiri detected the credential but did not validate its signature.`
              : 'No Content Credentials found. Files re-shared through WhatsApp or Facebook normally lose them, so this is not evidence of tampering on its own.'}
          </Text>
        </SignalCard>
      ) : null}

      {/* Source reputation */}
      {rep.checked && rep.domain ? (
        <SignalCard
          icon="globe-outline"
          title="Source reputation"
          tint={
            (rep.score ?? 50) >= 75
              ? colors.zahiri
              : (rep.score ?? 50) >= 45
                ? '#FFB020'
                : '#FF4757'
          }
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-medium text-chalk" style={{ fontSize: 13 }}>
              {rep.domain}
            </Text>
            <Text
              className="font-bold"
              style={{
                fontSize: 13,
                color:
                  (rep.score ?? 50) >= 75
                    ? colors.zahiri
                    : (rep.score ?? 50) >= 45
                      ? '#FFB020'
                      : '#FF4757',
              }}
            >
              {rep.score}/100
            </Text>
          </View>
          {result.reputation ? (
            <Text className="font-sans text-chalk-soft" style={{ fontSize: 12.5, lineHeight: 18 }}>
              {result.reputation.aiContentFarm
                ? 'This domain is on the confirmed AI content-farm watchlist.'
                : result.reputation.known
                  ? result.reputation.note || `Rated "${result.reputation.band}" on past accuracy.`
                  : 'Zahiri has no record for this source yet. Unknown is not the same as trustworthy.'}
            </Text>
          ) : null}
        </SignalCard>
      ) : null}

      {/* Evidence */}
      {result.evidence.length > 0 ? (
        <SignalCard icon="library-outline" title="Evidence" tint={colors.info}>
          <View style={{ gap: 10 }}>
            {result.evidence.map((e, i) => (
              <Pressable
                key={i}
                onPress={() => e.url && Linking.openURL(e.url).catch(() => null)}
                className="rounded-xl p-2.5"
                style={{ backgroundColor: colors.inkHigh }}
              >
                <Text className="font-medium text-chalk" style={{ fontSize: 13, lineHeight: 18 }}>
                  {e.title || e.url}
                </Text>
                {e.publisher ? (
                  <Text className="font-sans text-chalk-faint mt-0.5" style={{ fontSize: 11.5 }}>
                    {e.publisher}
                  </Text>
                ) : null}
                {e.note ? (
                  <Text className="font-sans text-chalk-soft mt-1" style={{ fontSize: 12, lineHeight: 17 }}>
                    {e.note}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </SignalCard>
      ) : null}

      {/* Provenance of the verdict itself */}
      <View className="flex-row items-center justify-center py-2" style={{ gap: 6 }}>
        <Ionicons name="hardware-chip-outline" size={12} color={colors.chalkFaint} />
        <Text className="font-sans text-chalk-faint" style={{ fontSize: 11 }}>
          Checked by {result.aiProvider ?? 'Zahiri'}
          {result.aiModel ? ` · ${result.aiModel.split('/').pop()}` : ''}
        </Text>
      </View>
    </Animated.View>
  );
}

function SignalCard({
  icon,
  title,
  tint,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className="rounded-card p-4"
      style={{ backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.inkEdge }}
    >
      <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
        <View
          className="items-center justify-center rounded-lg"
          style={{ width: 26, height: 26, backgroundColor: alpha(tint, 0.15) }}
        >
          <Ionicons name={icon} size={14} color={tint} />
        </View>
        <Text
          className="font-semibold text-micro text-chalk-soft uppercase"
          style={{ letterSpacing: 1 }}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
