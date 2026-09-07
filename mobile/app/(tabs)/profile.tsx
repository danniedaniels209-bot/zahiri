import { useState } from 'react';
import { Alert as RNAlert, Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, Card, EmptyState, Header, Loading, Screen, SectionTitle } from '../../components/ui';
import { ServerBanner } from '../../components/ServerBanner';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { alpha, colors } from '../../theme/tokens';

interface Reward {
  _id: string;
  slug: string;
  title: string;
  description: string;
  costPoints: number;
  affordable: boolean;
  locked: boolean;
}

export default function Profile() {
  const { user, signOut, updateProfile } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const rewards = useQuery({
    queryKey: ['rewards'],
    queryFn: () => api<{ balance: number; tier: string; items: Reward[] }>('/api/rewards/catalogue'),
  });

  const redeem = useMutation({
    mutationFn: (id: string) => api(`/api/rewards/redeem/${id}`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rewards'] });
      RNAlert.alert('Redeemed', 'You will be contacted about fulfilment.');
    },
    onError: (err) => RNAlert.alert('Could not redeem', (err as Error).message),
  });

  async function toggle(key: keyof NonNullable<typeof user>['accessibility'], value: boolean) {
    setBusy(key);
    try {
      await updateProfile({ accessibility: { ...user!.accessibility, [key]: value } } as never);
    } finally {
      setBusy(null);
    }
  }

  if (!user) return <Loading />;

  const balance = rewards.data?.balance ?? user.points;

  return (
    <Screen>
      <Header title="You" subtitle={user.email} />

      <ServerBanner />

      {/* Points card */}
      <LinearGradient
        colors={[alpha(colors.zahiri, 0.2), alpha(colors.info, 0.05)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: alpha(colors.zahiri, 0.28),
          padding: 18,
        }}
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="font-sans text-caption text-chalk-soft">Zahiri points</Text>
            <Text className="font-display text-chalk" style={{ fontSize: 38, letterSpacing: -1.4 }}>
              {balance}
            </Text>
          </View>
          <View
            className="items-center justify-center rounded-2xl"
            style={{
              width: 54,
              height: 54,
              backgroundColor: alpha(colors.zahiri, 0.16),
              borderWidth: 1,
              borderColor: alpha(colors.zahiri, 0.32),
            }}
          >
            <Ionicons name="trophy" size={26} color={colors.zahiri} />
          </View>
        </View>

        <View className="flex-row mt-4" style={{ gap: 8 }}>
          <View
            className="rounded-pill px-3 py-1.5"
            style={{ backgroundColor: alpha(colors.ink, 0.5) }}
          >
            <Text className="font-medium text-chalk-soft" style={{ fontSize: 11.5 }}>
              {user.role}
            </Text>
          </View>
          <View
            className="rounded-pill px-3 py-1.5"
            style={{ backgroundColor: alpha(colors.ink, 0.5) }}
          >
            <Text className="font-medium text-chalk-soft" style={{ fontSize: 11.5 }}>
              {user.tier} tier
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Quick links */}
      <SectionTitle>Your activity</SectionTitle>
      <View style={{ gap: 8 }}>
        <LinkRow icon="time-outline" label="Verification history" onPress={() => router.push('/history')} />
        <LinkRow icon="logo-whatsapp" label="Link WhatsApp number" onPress={() => router.push('/whatsapp')} />
        <LinkRow icon="book-outline" label="Learn to spot fakes" onPress={() => router.push('/learn')} />
        <LinkRow icon="radio-outline" label="Radio partners" onPress={() => router.push('/radio')} />
        <LinkRow icon="school-outline" label="School campaigns" onPress={() => router.push('/campaigns')} />
      </View>

      {/* Accessibility */}
      <SectionTitle>Accessibility</SectionTitle>
      <Card>
        {(
          [
            { key: 'signLanguage', label: 'Sign-language content', hint: 'Show signed video where available' },
            { key: 'largeText', label: 'Larger text', hint: 'Increase text size across the app' },
            { key: 'highContrast', label: 'High contrast', hint: 'Stronger contrast for low vision' },
            { key: 'audioReadout', label: 'Read verdicts aloud', hint: 'Speak the result after each check' },
          ] as const
        ).map((row, i) => (
          <View
            key={row.key}
            className="flex-row items-center py-3"
            style={{
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.inkEdge,
              gap: 12,
            }}
          >
            <View className="flex-1">
              <Text className="font-medium text-chalk" style={{ fontSize: 14 }}>
                {row.label}
              </Text>
              <Text className="font-sans text-chalk-faint mt-0.5" style={{ fontSize: 11.5 }}>
                {row.hint}
              </Text>
            </View>
            <Switch
              value={user.accessibility[row.key]}
              disabled={busy === row.key}
              onValueChange={(v) => void toggle(row.key, v)}
              trackColor={{ false: colors.inkHigh, true: alpha(colors.zahiri, 0.5) }}
              thumbColor={user.accessibility[row.key] ? colors.zahiri : colors.chalkFaint}
            />
          </View>
        ))}
      </Card>

      {/* Rewards */}
      <SectionTitle>Rewards</SectionTitle>
      {rewards.isLoading ? (
        <Loading label="Loading rewards" />
      ) : rewards.isError ? (
        <EmptyState icon="gift-outline" title="Could not load rewards" />
      ) : (
        <View style={{ gap: 9 }}>
          {rewards.data!.items.map((r, i) => (
            <Card key={r._id} index={i}>
              <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
                <View className="flex-1">
                  <Text className="font-medium text-chalk" style={{ fontSize: 14.5 }}>
                    {r.title}
                  </Text>
                  <Text
                    className="font-sans text-chalk-soft mt-1"
                    style={{ fontSize: 12.5, lineHeight: 18 }}
                  >
                    {r.description}
                  </Text>
                </View>
                <View className="items-end" style={{ gap: 6 }}>
                  <Text
                    style={{
                      color: r.affordable ? colors.zahiri : colors.chalkFaint,
                      fontFamily: 'Inter_700Bold',
                      fontSize: 14,
                    }}
                  >
                    {r.costPoints}
                  </Text>
                  <Button
                    title={r.locked ? 'Premium' : 'Redeem'}
                    variant={r.affordable && !r.locked ? 'primary' : 'secondary'}
                    full={false}
                    disabled={!r.affordable || r.locked || redeem.isPending}
                    onPress={() => redeem.mutate(r._id)}
                  />
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      <View className="mt-8 mb-2">
        <Button
          title="Sign out"
          variant="danger"
          icon="log-out-outline"
          onPress={() =>
            RNAlert.alert('Sign out?', 'You will need to sign in again.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ])
          }
        />
      </View>

      <Text className="font-sans text-center text-chalk-faint mt-4" style={{ fontSize: 11 }}>
        Zahiri v1.0.0 · Team I-SET
      </Text>
    </Screen>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-2xl px-4 py-3.5"
      style={{
        backgroundColor: colors.inkRaised,
        borderWidth: 1,
        borderColor: colors.inkEdge,
        gap: 12,
      }}
    >
      <Ionicons name={icon} size={18} color={colors.chalkSoft} />
      <Text className="flex-1 font-medium text-chalk" style={{ fontSize: 14 }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.chalkFaint} />
    </Pressable>
  );
}
