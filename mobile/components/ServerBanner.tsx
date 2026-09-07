import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { subscribeServerState, type ServerState } from '../lib/serverStatus';
import { alpha, colors } from '../theme/tokens';

/**
 * Explains a Render cold start instead of letting it look like a broken app.
 * The free tier stops an idle instance, so the first request of a session can
 * take the better part of a minute.
 */
export function ServerBanner() {
  const [state, setState] = useState<ServerState>('unknown');

  useEffect(() => subscribeServerState(setState), []);

  if (state !== 'waking' && state !== 'unreachable') return null;

  const waking = state === 'waking';
  const tint = waking ? colors.info : '#FF4757';

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      exiting={FadeOutUp.duration(220)}
      className="flex-row items-center rounded-2xl px-3.5 py-3 mb-4"
      style={{
        backgroundColor: alpha(tint, 0.12),
        borderWidth: 1,
        borderColor: alpha(tint, 0.32),
        gap: 10,
      }}
    >
      {waking ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Ionicons name="cloud-offline-outline" size={17} color={tint} />
      )}

      <View className="flex-1">
        <Text style={{ color: tint, fontFamily: 'Inter_600SemiBold', fontSize: 12.5 }}>
          {waking ? 'Waking Zahiri up' : 'Cannot reach Zahiri'}
        </Text>
        <Text
          className="font-sans text-chalk-soft mt-0.5"
          style={{ fontSize: 11.5, lineHeight: 16 }}
        >
          {waking
            ? 'The server sleeps when it is idle. This first request can take up to a minute.'
            : 'Check your connection. Zahiri will retry automatically.'}
        </Text>
      </View>
    </Animated.View>
  );
}
