import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Chip, EmptyState, Header, Loading, Screen, SectionTitle, TouchCard, VerdictBadge } from '../../components/ui';
import { ServerBanner } from '../../components/ServerBanner';
import { api, type Alert } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { alpha, colors, topicMeta, verdictOf } from '../../theme/tokens';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Today() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const alerts = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api<{ count: number; items: Alert[]; personalised: boolean }>('/api/alerts?limit=15'),
  });

  const crisis = useQuery({
    queryKey: ['crisis'],
    queryFn: () => api<{ mode: string; count: number; items: Alert[] }>('/api/alerts/crisis'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['alerts'] }),
      qc.invalidateQueries({ queryKey: ['crisis'] }),
    ]);
    setRefreshing(false);
  }, [qc]);

  const crisisActive = crisis.data?.mode === 'active';

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.zahiri} />
      }
    >
      <Header
        title={greeting().split(' ')[1] === 'morning' ? 'Morning' : greeting().replace('Good ', '')}
        subtitle={`${user?.name?.split(' ')[0] ?? 'Welcome'} — here is what is circulating today.`}
      />

      <ServerBanner />

      {/* Quick check entry point */}
      <TouchCard
        onPress={() => router.push('/(tabs)/verify')}
        glow={colors.zahiri}
        className="mb-2"
      >
        <View className="flex-row items-center" style={{ gap: 13 }}>
          <View
            className="items-center justify-center rounded-2xl"
            style={{
              width: 46,
              height: 46,
              backgroundColor: alpha(colors.zahiri, 0.16),
              borderWidth: 1,
              borderColor: alpha(colors.zahiri, 0.35),
            }}
          >
            <Ionicons name="shield-checkmark" size={22} color={colors.zahiri} />
          </View>
          <View className="flex-1">
            <Text className="font-display-medium text-chalk" style={{ fontSize: 16.5 }}>
              Check something now
            </Text>
            <Text className="font-sans text-caption text-chalk-soft mt-0.5">
              A claim, link, image, video, or voice note
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.chalkFaint} />
        </View>
      </TouchCard>

      <TouchCard onPress={() => router.push('/chat')} className="mb-2 mt-2">
        <View className="flex-row items-center" style={{ gap: 13 }}>
          <View
            className="items-center justify-center rounded-2xl"
            style={{
              width: 46,
              height: 46,
              backgroundColor: alpha(colors.info, 0.16),
              borderWidth: 1,
              borderColor: alpha(colors.info, 0.35),
            }}
          >
            <Ionicons name="chatbubbles" size={21} color={colors.info} />
          </View>
          <View className="flex-1">
            <Text className="font-display-medium text-chalk" style={{ fontSize: 16.5 }}>
              Ask Zahiri
            </Text>
            <Text className="font-sans text-caption text-chalk-soft mt-0.5">
              Talk it through with the fact-checking assistant
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.chalkFaint} />
        </View>
      </TouchCard>

      {/* Election & Crisis Rapid-Response Mode */}
      {crisisActive ? (
        <>
          <SectionTitle
            action={
              <Chip label="LIVE" color="#FF4757" active icon="radio-outline" />
            }
          >
            Crisis rapid response
          </SectionTitle>

          <Animated.View entering={FadeInDown.duration(420)}>
            <LinearGradient
              colors={[alpha('#FF4757', 0.14), alpha('#FF4757', 0.02)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: alpha('#FF4757', 0.3),
                padding: 14,
                gap: 12,
              }}
            >
              <Text className="font-sans text-caption text-chalk-soft">
                The false claims spreading fastest right now, with their corrections.
              </Text>

              {crisis.data!.items.slice(0, 4).map((item, i) => (
                <View
                  key={item._id}
                  className="rounded-2xl p-3"
                  style={{ backgroundColor: alpha(colors.ink, 0.55), gap: 8 }}
                >
                  <View className="flex-row items-start justify-between" style={{ gap: 10 }}>
                    <Text
                      className="flex-1 font-semibold text-chalk"
                      style={{ fontSize: 14, lineHeight: 20 }}
                    >
                      {item.title}
                    </Text>
                    <VerdictBadge verdict={item.verdict} size="sm" />
                  </View>

                  <Text className="font-sans text-chalk-soft" style={{ fontSize: 12.5, lineHeight: 18 }}>
                    {item.summary}
                  </Text>

                  {item.correction ? (
                    <View
                      className="flex-row rounded-xl p-2.5"
                      style={{ backgroundColor: alpha(colors.zahiri, 0.1), gap: 7 }}
                    >
                      <Ionicons name="checkmark-circle" size={14} color={colors.zahiri} style={{ marginTop: 1 }} />
                      <Text
                        className="flex-1 font-sans"
                        style={{ fontSize: 12, lineHeight: 17, color: colors.chalk }}
                      >
                        {item.correction}
                      </Text>
                    </View>
                  ) : null}

                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <Ionicons name="trending-up" size={12} color="#FF4757" />
                    <Text className="font-medium" style={{ fontSize: 11, color: '#FF8A94' }}>
                      Circulation {item.circulationScore}/100
                    </Text>
                  </View>
                </View>
              ))}
            </LinearGradient>
          </Animated.View>
        </>
      ) : null}

      {/* Daily updates */}
      <SectionTitle
        action={
          alerts.data?.personalised ? (
            <Chip label="Your topics" color={colors.info} active icon="options-outline" />
          ) : undefined
        }
      >
        Daily updates
      </SectionTitle>

      {alerts.isLoading ? (
        <Loading label="Fetching today's verified updates" />
      ) : alerts.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load updates"
          body="Pull down to try again."
        />
      ) : alerts.data!.items.length === 0 ? (
        <EmptyState
          icon="newspaper-outline"
          title="Nothing new yet"
          body="Verified updates on your topics will appear here."
        />
      ) : (
        <View style={{ gap: 10 }}>
          {alerts.data!.items.map((item, i) => {
            const topic = topicMeta[item.topic] ?? topicMeta.general;
            const v = verdictOf(item.verdict);

            return (
              <Card key={item._id} index={i}>
                <View className="flex-row items-center justify-between mb-2.5">
                  <Chip label={topic.label} color={topic.color} active />
                  <VerdictBadge verdict={item.verdict} size="sm" />
                </View>

                <Text
                  className="font-display-medium text-chalk"
                  style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}
                >
                  {item.title}
                </Text>
                <Text
                  className="font-sans text-chalk-soft mt-1.5"
                  style={{ fontSize: 13.5, lineHeight: 20 }}
                >
                  {item.summary}
                </Text>

                {item.correction ? (
                  <View
                    className="flex-row rounded-xl p-2.5 mt-3"
                    style={{ backgroundColor: alpha(v.color, 0.1), gap: 7 }}
                  >
                    <Ionicons name="information-circle" size={14} color={v.color} style={{ marginTop: 1 }} />
                    <Text className="flex-1 font-sans text-chalk" style={{ fontSize: 12, lineHeight: 17 }}>
                      {item.correction}
                    </Text>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}

      {/* Shortcuts */}
      <SectionTitle>More</SectionTitle>
      <View className="flex-row" style={{ gap: 10 }}>
        {[
          { label: 'Learn', icon: 'book-outline' as const, href: '/learn', color: colors.info },
          { label: 'Radio', icon: 'radio-outline' as const, href: '/radio', color: '#FFB020' },
          { label: 'Schools', icon: 'school-outline' as const, href: '/campaigns', color: '#B388FF' },
        ].map((s) => (
          <View key={s.label} className="flex-1">
            <TouchCard onPress={() => router.push(s.href as never)} className="items-center py-4">
              <Ionicons name={s.icon} size={21} color={s.color} />
              <Text className="font-medium text-caption text-chalk mt-2">{s.label}</Text>
            </TouchCard>
          </View>
        ))}
      </View>
    </Screen>
  );
}
