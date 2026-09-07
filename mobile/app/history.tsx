import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, Loading, Screen, VerdictBadge } from '../components/ui';
import { api, type VerificationResult } from '../lib/api';
import { colors } from '../theme/tokens';

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  text: 'text-outline',
  link: 'link-outline',
  image: 'image-outline',
  video: 'videocam-outline',
  audio: 'mic-outline',
};

function timeAgo(iso?: string) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function History() {
  const router = useRouter();

  const history = useQuery({
    queryKey: ['history'],
    queryFn: () => api<{ count: number; items: VerificationResult[] }>('/api/verify/history?limit=50'),
  });

  return (
    <Screen>
      <View className="flex-row items-center pt-2 pb-6" style={{ gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.chalkSoft} />
        </Pressable>
        <Text className="font-display text-h2 text-chalk" style={{ letterSpacing: -0.6 }}>
          Your checks
        </Text>
      </View>

      {history.isLoading ? (
        <Loading label="Loading your history" />
      ) : history.isError ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load your history" />
      ) : history.data!.items.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="Nothing checked yet"
          body="Everything you verify will be listed here."
        />
      ) : (
        <View style={{ gap: 9 }}>
          {history.data!.items.map((v, i) => (
            <Card key={v.id ?? i} index={i}>
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center" style={{ gap: 7 }}>
                  <Ionicons
                    name={TYPE_ICON[v.inputType] ?? 'document-outline'}
                    size={14}
                    color={colors.chalkFaint}
                  />
                  <Text className="font-sans text-chalk-faint" style={{ fontSize: 11.5 }}>
                    {v.inputType} · {timeAgo(v.createdAt)}
                  </Text>
                </View>
                <VerdictBadge verdict={v.verdict} size="sm" />
              </View>

              <Text
                className="font-medium text-chalk"
                style={{ fontSize: 14, lineHeight: 20 }}
                numberOfLines={2}
              >
                {v.claim || v.sourceUrl || 'Media check'}
              </Text>
              <Text
                className="font-sans text-chalk-soft mt-1.5"
                style={{ fontSize: 12.5, lineHeight: 18 }}
                numberOfLines={3}
              >
                {v.explanation}
              </Text>

              {v.humanReview?.required ? (
                <View className="flex-row items-center mt-2.5" style={{ gap: 6 }}>
                  <Ionicons name="person-circle-outline" size={13} color={colors.info} />
                  <Text style={{ color: colors.info, fontFamily: 'Inter_500Medium', fontSize: 11.5 }}>
                    With a human fact-checker
                  </Text>
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
