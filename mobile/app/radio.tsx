import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, Loading, Screen } from '../components/ui';
import { api } from '../lib/api';
import { alpha, colors } from '../theme/tokens';

interface Partner {
  _id: string;
  station: string;
  frequency: string;
  state: string;
  languages: string[];
  slots: { day: string; time: string; programme: string }[];
}

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  ha: 'Hausa',
  ig: 'Igbo',
  yo: 'Yoruba',
  pcm: 'Pidgin',
};

export default function Radio() {
  const router = useRouter();

  const partners = useQuery({
    queryKey: ['radio'],
    queryFn: () => api<{ count: number; items: Partner[] }>('/api/campaigns/radio'),
  });

  return (
    <Screen>
      <View className="flex-row items-center pt-2 pb-6" style={{ gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.chalkSoft} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-h2 text-chalk" style={{ letterSpacing: -0.6 }}>
            On the radio
          </Text>
          <Text className="font-sans text-caption text-chalk-soft mt-0.5">
            For communities with limited internet.
          </Text>
        </View>
      </View>

      {partners.isLoading ? (
        <Loading label="Loading stations" />
      ) : partners.isError ? (
        <EmptyState icon="radio-outline" title="Could not load stations" />
      ) : partners.data!.items.length === 0 ? (
        <EmptyState icon="radio-outline" title="No stations listed yet" />
      ) : (
        <View style={{ gap: 10 }}>
          {partners.data!.items.map((p, i) => (
            <Card key={p._id} index={i}>
              <View className="flex-row items-center" style={{ gap: 12 }}>
                <View
                  className="items-center justify-center rounded-2xl"
                  style={{
                    width: 46,
                    height: 46,
                    backgroundColor: alpha('#FFB020', 0.14),
                    borderWidth: 1,
                    borderColor: alpha('#FFB020', 0.3),
                  }}
                >
                  <Ionicons name="radio" size={22} color="#FFB020" />
                </View>

                <View className="flex-1">
                  <Text className="font-display-medium text-chalk" style={{ fontSize: 16 }}>
                    {p.station}
                  </Text>
                  <Text className="font-sans text-chalk-soft" style={{ fontSize: 12.5 }}>
                    {p.frequency} · {p.state}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap mt-3" style={{ gap: 6 }}>
                {p.languages.map((l) => (
                  <View
                    key={l}
                    className="rounded-pill px-2.5 py-1"
                    style={{ backgroundColor: colors.inkHigh }}
                  >
                    <Text className="font-medium text-chalk-soft" style={{ fontSize: 11 }}>
                      {LANGUAGE_NAME[l] ?? l}
                    </Text>
                  </View>
                ))}
              </View>

              {p.slots.length ? (
                <View
                  className="mt-3 pt-3"
                  style={{ borderTopWidth: 1, borderTopColor: colors.inkEdge, gap: 8 }}
                >
                  {p.slots.map((s, j) => (
                    <View key={j} className="flex-row items-center" style={{ gap: 9 }}>
                      <Ionicons name="time-outline" size={14} color={colors.chalkFaint} />
                      <Text className="flex-1 font-sans text-chalk" style={{ fontSize: 13 }}>
                        {s.programme}
                      </Text>
                      <Text className="font-medium text-chalk-soft" style={{ fontSize: 12 }}>
                        {s.day} {s.time}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
