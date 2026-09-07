import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { colors } from '../theme/tokens';

/** Decides where a launch lands, once the stored session has been checked. */
export default function Gate() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/(tabs)' : '/(auth)/welcome');
  }, [user, loading, router]);

  return (
    <View className="flex-1 items-center justify-center bg-ink" style={{ gap: 18 }}>
      <Text
        className="font-display text-h1 text-chalk"
        style={{ letterSpacing: -1 }}
      >
        Zahiri
      </Text>
      <ActivityIndicator color={colors.zahiri} />
    </View>
  );
}
