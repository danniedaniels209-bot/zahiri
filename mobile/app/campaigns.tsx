import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, Card, Chip, EmptyState, Screen, SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { alpha, colors } from '../theme/tokens';

interface Campaign {
  _id: string;
  school: string;
  state: string;
  city: string;
  scheduledFor: string;
  status: 'planned' | 'confirmed' | 'completed' | 'cancelled';
  ambassadors: { _id: string; name: string }[];
  studentsReached: number;
  teachersTrained: number;
}

const STATUS_COLOR = {
  planned: colors.chalkSoft,
  confirmed: colors.zahiri,
  completed: colors.info,
  cancelled: colors.danger,
} as const;

const violet: string = colors.violet;

export default function Campaigns() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const impact = useQuery({
    queryKey: ['impact'],
    queryFn: () =>
      api<{ campaigns: number; studentsReached: number; teachersTrained: number; schoolCount: number }>(
        '/api/campaigns/impact',
      ),
  });

  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<{ count: number; items: Campaign[] }>('/api/campaigns?limit=40'),
  });

  const join = useMutation({
    mutationFn: (id: string) => api(`/api/campaigns/${id}/join`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['impact'] }),
      qc.invalidateQueries({ queryKey: ['campaigns'] }),
    ]);
    setRefreshing(false);
  }, [qc]);

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.zahiri} />
      }
    >
      <View className="flex-row items-center pt-2 pb-6" style={{ gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.chalkSoft} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-h2 text-chalk" style={{ letterSpacing: -0.6 }}>
            School campaigns
          </Text>
          <Text className="font-sans text-caption text-chalk-soft mt-0.5">
            Youth ambassadors training teachers and students.
          </Text>
        </View>
      </View>

      <LinearGradient
        colors={[alpha(violet, 0.16), alpha(violet, 0.03)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: alpha(violet, 0.28),
          padding: 18,
        }}
      >
        <Text
          className="font-semibold text-micro text-chalk-soft uppercase mb-3"
          style={{ letterSpacing: 1.2 }}
        >
          Impact so far
        </Text>
        <View className="flex-row flex-wrap" style={{ gap: 20 }}>
          <Metric value={impact.data?.studentsReached ?? 0} label="Students reached" />
          <Metric value={impact.data?.teachersTrained ?? 0} label="Teachers trained" />
          <Metric value={impact.data?.schoolCount ?? 0} label="Schools" />
        </View>
      </LinearGradient>

      <SectionTitle>All campaigns</SectionTitle>

      {campaigns.isLoading ? (
        <SkeletonCards />
      ) : campaigns.isError ? (
        <EmptyState
          icon="school-outline"
          title="Could not load campaigns"
          body="Check your connection and try again."
          action={
            <Button title="Retry" variant="secondary" onPress={() => campaigns.refetch()} />
          }
        />
      ) : campaigns.data!.items.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="No campaigns"
          body="No school campaigns are scheduled yet. Pull down to refresh."
        />
      ) : (
        <View style={{ gap: 10 }}>
          {campaigns.data!.items.map((c, i) => {
            const tint = STATUS_COLOR[c.status];
            const upcoming = c.status === 'planned' || c.status === 'confirmed';

            return (
              <Card key={c._id} index={i}>
                <View className="flex-row items-start justify-between mb-2" style={{ gap: 10 }}>
                  <View className="flex-1">
                    <Text className="font-display-medium text-chalk" style={{ fontSize: 16 }}>
                      {c.school}
                    </Text>
                    <Text className="font-sans text-chalk-soft mt-0.5" style={{ fontSize: 12.5 }}>
                      {[c.city, c.state].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <Chip label={c.status.toUpperCase()} color={tint} active />
                </View>

                <View className="flex-row items-center" style={{ gap: 7 }}>
                  <Ionicons name="calendar-outline" size={13} color={colors.chalkFaint} />
                  <Text className="font-sans text-chalk-faint" style={{ fontSize: 12 }}>
                    {new Date(c.scheduledFor).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text className="font-sans text-chalk-faint" style={{ fontSize: 12 }}>
                    · {c.ambassadors?.length ?? 0} ambassador
                    {(c.ambassadors?.length ?? 0) === 1 ? '' : 's'}
                  </Text>
                </View>

                {c.status === 'completed' ? (
                  <View
                    className="flex-row mt-3 pt-3"
                    style={{ borderTopWidth: 1, borderTopColor: colors.inkEdge, gap: 20 }}
                  >
                    <Metric value={c.studentsReached} label="Students" small />
                    <Metric value={c.teachersTrained} label="Teachers" small />
                  </View>
                ) : upcoming ? (
                  <View className="mt-3">
                    <Button
                      title={join.isPending ? 'Joining…' : 'Join this campaign'}
                      variant="secondary"
                      disabled={join.isPending}
                      onPress={() => join.mutate(c._id)}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function SkeletonCards() {
  return (
    <View style={{ gap: 10 }}>
      {[0, 1].map((i) => (
        <View
          key={i}
          style={{
            borderRadius: 20,
            height: 132,
            backgroundColor: colors.inkHigh,
            borderWidth: 1,
            borderColor: colors.inkEdge,
            opacity: 0.7,
          }}
        />
      ))}
    </View>
  );
}

function Metric({ value, label, small }: { value: number; label: string; small?: boolean }) {
  return (
    <View>
      <Text
        className="font-display text-chalk"
        style={{ fontSize: small ? 18 : 26, letterSpacing: -0.8 }}
      >
        {value.toLocaleString()}
      </Text>
      <Text className="font-sans text-chalk-soft" style={{ fontSize: small ? 11 : 12 }}>
        {label}
      </Text>
    </View>
  );
}
