import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, Card, Chip, EmptyState, Screen } from '../components/ui';
import { api } from '../lib/api';
import { colors } from '../theme/tokens';

interface Module {
  _id: string;
  slug: string;
  title: string;
  summary: string;
  level: 'intro' | 'core' | 'advanced';
  durationMins: number;
  content: string;
  tags: string[];
}

const LEVEL_COLOR = {
  intro: colors.zahiri,
  core: colors.info,
  advanced: colors.caution,
} as const;

export default function Learn() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const modules = useQuery({
    queryKey: ['modules'],
    queryFn: () => api<{ count: number; items: Module[] }>('/api/campaigns/modules'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['modules'] });
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
            Learn
          </Text>
          <Text className="font-sans text-caption text-chalk-soft mt-0.5">
            The same material used in school campaigns.
          </Text>
        </View>
      </View>

      {modules.isLoading ? (
        <SkeletonCards />
      ) : modules.isError ? (
        <EmptyState
          icon="book-outline"
          title="Could not load modules"
          body="Check your connection and try again."
          action={
            <Button title="Retry" variant="secondary" onPress={() => modules.refetch()} />
          }
        />
      ) : modules.data!.items.length === 0 ? (
        <EmptyState
          icon="book-outline"
          title="No modules"
          body="Learning modules will appear here. Pull down to refresh."
        />
      ) : (
        <View style={{ gap: 10 }}>
          {modules.data!.items.map((m, i) => {
            const expanded = open === m._id;
            const tint = LEVEL_COLOR[m.level] ?? colors.zahiri;

            return (
              <Pressable
                key={m._id}
                onPress={() => setOpen(expanded ? null : m._id)}
                accessibilityRole="button"
                accessibilityLabel={`${m.title}, ${m.level} level`}
                accessibilityHint={expanded ? 'Collapses the module' : 'Expands the module'}
                accessibilityState={{ expanded }}
              >
                <Card index={i}>
                  <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                    <View className="flex-1">
                      <View className="flex-row items-center mb-2" style={{ gap: 7 }}>
                        <Chip label={m.level} color={tint} active />
                        <Text className="font-sans text-chalk-faint" style={{ fontSize: 11.5 }}>
                          {m.durationMins} min
                        </Text>
                      </View>

                      <Text
                        className="font-display-medium text-chalk"
                        style={{ fontSize: 16, letterSpacing: -0.2 }}
                      >
                        {m.title}
                      </Text>
                      <Text
                        className="font-sans text-chalk-soft mt-1"
                        style={{ fontSize: 13, lineHeight: 19 }}
                      >
                        {m.summary}
                      </Text>
                    </View>

                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={17}
                      color={colors.chalkFaint}
                    />
                  </View>

                  {expanded ? (
                    <Animated.View
                      entering={FadeIn.duration(240)}
                      className="mt-3.5 pt-3.5"
                      style={{ borderTopWidth: 1, borderTopColor: colors.inkEdge }}
                    >
                      <Text
                        className="font-sans text-chalk"
                        style={{ fontSize: 14, lineHeight: 22 }}
                      >
                        {m.content}
                      </Text>

                      {m.tags.length ? (
                        <View className="flex-row flex-wrap mt-3.5" style={{ gap: 6 }}>
                          {m.tags.map((t) => (
                            <Chip key={t} label={t} color={tint} active />
                          ))}
                        </View>
                      ) : null}
                    </Animated.View>
                  ) : null}
                </Card>
              </Pressable>
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
