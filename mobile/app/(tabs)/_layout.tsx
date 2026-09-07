import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../lib/auth';
import { warmUp } from '../../lib/api';
import { alpha, colors } from '../../theme/tokens';

export default function TabsLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Kick the Render instance awake while the user reads the first screen.
    void warmUp();
  }, []);

  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.zahiri,
        tabBarInactiveTintColor: colors.chalkFaint,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 1,
          borderTopColor: colors.inkEdge,
          backgroundColor: Platform.OS === 'android' ? colors.inkRaised : 'transparent',
          height: 62,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={{ flex: 1 }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.inkRaised }} />
          ),
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 10.5,
        },
        sceneStyle: { backgroundColor: colors.ink },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="verify"
        options={{
          title: 'Verify',
          tabBarIcon: ({ color, focused }) => (
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: 34,
                height: 34,
                backgroundColor: focused ? alpha(colors.zahiri, 0.18) : 'transparent',
              }}
            >
              <Ionicons name="shield-checkmark" size={20} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="game"
        options={{
          title: 'Hunt',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="game-controller-outline" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="hub"
        options={{
          title: 'Hub',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size - 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
