import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Button, Card, ErrorNote, Screen, SectionTitle } from '../components/ui';
import { Field } from '../components/Field';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { alpha, colors } from '../theme/tokens';

const WHATSAPP_GREEN = '#25D366';

const STEPS = [
  'Save the Zahiri number to your contacts.',
  'Forward any suspicious message, image, video, or voice note to it.',
  'Zahiri replies with a verdict in the same chat, in seconds.',
];

export default function WhatsAppLink() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [number, setNumber] = useState(user?.whatsappNumber ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function link() {
    setError(null);
    const digits = number.replace(/\D/g, '');

    if (digits.length < 10 || digits.length > 15) {
      setError('Enter your number with the country code, digits only. For Nigeria: 234...');
      return;
    }

    setBusy(true);
    try {
      await api('/api/plugins/whatsapp/link', { method: 'POST', body: { number: digits } });
      await refresh();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not link that number.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="flex-row items-center pt-2 pb-6" style={{ gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.chalkSoft} />
        </Pressable>
        <Text className="font-display text-h2 text-chalk" style={{ letterSpacing: -0.6 }}>
          WhatsApp
        </Text>
      </View>

      <LinearGradient
        colors={[alpha(WHATSAPP_GREEN, 0.16), alpha(WHATSAPP_GREEN, 0.03)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: alpha(WHATSAPP_GREEN, 0.3),
          padding: 18,
        }}
      >
        <View className="flex-row items-center mb-3" style={{ gap: 11 }}>
          <View
            className="items-center justify-center rounded-2xl"
            style={{ width: 44, height: 44, backgroundColor: alpha(WHATSAPP_GREEN, 0.18) }}
          >
            <Ionicons name="logo-whatsapp" size={24} color={WHATSAPP_GREEN} />
          </View>
          <View className="flex-1">
            <Text className="font-display-medium text-chalk" style={{ fontSize: 17 }}>
              Check without leaving WhatsApp
            </Text>
            <Text className="font-sans text-chalk-soft mt-0.5" style={{ fontSize: 12.5 }}>
              Forward it. Get a verdict back.
            </Text>
          </View>
        </View>

        <View style={{ gap: 10 }} className="mt-2">
          {STEPS.map((s, i) => (
            <View key={i} className="flex-row" style={{ gap: 10 }}>
              <View
                className="items-center justify-center rounded-full"
                style={{ width: 20, height: 20, backgroundColor: alpha(WHATSAPP_GREEN, 0.2) }}
              >
                <Text style={{ color: WHATSAPP_GREEN, fontFamily: 'Inter_700Bold', fontSize: 10.5 }}>
                  {i + 1}
                </Text>
              </View>
              <Text
                className="flex-1 font-sans text-chalk-soft"
                style={{ fontSize: 13, lineHeight: 19 }}
              >
                {s}
              </Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <SectionTitle>Link your number</SectionTitle>

      <Card>
        <Text className="font-sans text-chalk-soft mb-4" style={{ fontSize: 12.5, lineHeight: 18 }}>
          Linking your number means checks you do on WhatsApp also appear in your history here,
          and earn you points.
        </Text>

        {done ? (
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <Ionicons name="checkmark-circle" size={22} color={colors.zahiri} />
            <View className="flex-1">
              <Text className="font-medium text-chalk" style={{ fontSize: 14 }}>
                Number linked
              </Text>
              <Text className="font-sans text-chalk-soft" style={{ fontSize: 12 }}>
                {user?.whatsappNumber}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Field
              label="WhatsApp number"
              icon="call-outline"
              placeholder="2348012345678"
              value={number}
              onChangeText={setNumber}
              keyboardType="phone-pad"
              hint="Include your country code. No spaces or symbols."
            />
            {error ? <ErrorNote message={error} /> : null}
            <Button title="Link this number" loading={busy} onPress={link} />
          </View>
        )}
      </Card>

      <View
        className="flex-row rounded-2xl p-3.5 mt-4"
        style={{
          backgroundColor: alpha(colors.info, 0.1),
          borderWidth: 1,
          borderColor: alpha(colors.info, 0.25),
          gap: 10,
        }}
      >
        <Ionicons name="lock-closed" size={16} color={colors.info} style={{ marginTop: 1 }} />
        <Text className="flex-1 font-sans text-chalk-soft" style={{ fontSize: 11.5, lineHeight: 17 }}>
          Zahiri only sees messages you deliberately forward to it. It cannot read your chats,
          and inbound webhook traffic is signature-verified before it is processed.
        </Text>
      </View>
    </Screen>
  );
}
