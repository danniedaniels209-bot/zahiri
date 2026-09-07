import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, ErrorNote } from '../../components/ui';
import { Field } from '../../components/Field';
import { useAuth } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { colors } from '../../theme/tokens';

export default function SignIn() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign you in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-ink">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1 px-gutter"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} hitSlop={12} className="mb-8" style={{ alignSelf: 'flex-start' }}>
            <Ionicons name="arrow-back" size={22} color={colors.chalkSoft} />
          </Pressable>

          <Text className="font-display text-h1 text-chalk" style={{ letterSpacing: -0.9 }}>
            Welcome back
          </Text>
          <Text className="font-sans text-body text-chalk-soft mt-2 mb-8">
            Sign in to pick up your checks, points, and streak.
          </Text>

          <View style={{ gap: 16 }}>
            <Field
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              icon="lock-closed-outline"
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              secure
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {error ? <ErrorNote message={error} /> : null}

            <View className="mt-2">
              <Button title="Sign in" size="lg" loading={busy} onPress={submit} />
            </View>
          </View>

          <Pressable className="mt-7" onPress={() => router.replace('/(auth)/sign-up')}>
            <Text className="font-sans text-center text-caption text-chalk-soft">
              New to Zahiri? <Text style={{ color: colors.zahiri }}>Create an account</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
