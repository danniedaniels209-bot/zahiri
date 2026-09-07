import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Chip, ErrorNote } from '../../components/ui';
import { Field } from '../../components/Field';
import { useAuth } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { alpha, colors } from '../../theme/tokens';

const ROLES = [
  { value: 'user', label: 'Everyday user', icon: 'person-outline' as const },
  { value: 'journalist', label: 'Journalist', icon: 'newspaper-outline' as const },
  { value: 'ambassador', label: 'Youth ambassador', icon: 'school-outline' as const },
  { value: 'org', label: 'Organisation', icon: 'business-outline' as const },
] as const;

/** Mirrors the server's password policy so the user sees it before submitting. */
function passwordChecks(pw: string) {
  return [
    { label: 'At least 12 characters', ok: pw.length >= 12 },
    { label: 'A lowercase letter', ok: /[a-z]/.test(pw) },
    { label: 'An uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'A number', ok: /\d/.test(pw) },
  ];
}

export default function SignUp() {
  const { signUp } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('user');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const strong = checks.every((c) => c.ok);

  async function submit() {
    setError(null);

    if (name.trim().length < 2) return setError('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!strong) return setError('Your password does not meet all the requirements yet.');

    setBusy(true);
    try {
      await signUp({ name: name.trim(), email, password, role });
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setError(err.details.map((d) => d.message).join('\n'));
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not create your account.');
      }
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
          contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} hitSlop={12} className="mb-6" style={{ alignSelf: 'flex-start' }}>
            <Ionicons name="arrow-back" size={22} color={colors.chalkSoft} />
          </Pressable>

          <Text className="font-display text-h1 text-chalk" style={{ letterSpacing: -0.9 }}>
            Create account
          </Text>
          <Text className="font-sans text-body text-chalk-soft mt-2 mb-7">
            Free, and it takes about a minute.
          </Text>

          <View style={{ gap: 16 }}>
            <Field
              label="Full name"
              icon="person-outline"
              placeholder="Amina Bello"
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
            <Field
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              icon="lock-closed-outline"
              placeholder="Choose a strong password"
              value={password}
              onChangeText={setPassword}
              secure
              autoCapitalize="none"
            />

            {password.length > 0 ? (
              <View
                className="rounded-2xl p-3.5"
                style={{ backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.inkEdge, gap: 7 }}
              >
                {checks.map((c) => (
                  <View key={c.label} className="flex-row items-center" style={{ gap: 8 }}>
                    <Ionicons
                      name={c.ok ? 'checkmark-circle' : 'ellipse-outline'}
                      size={15}
                      color={c.ok ? colors.zahiri : colors.chalkFaint}
                    />
                    <Text
                      className="font-sans"
                      style={{ fontSize: 12.5, color: c.ok ? colors.chalk : colors.chalkFaint }}
                    >
                      {c.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View>
              <Text className="font-medium text-caption text-chalk-soft mb-2.5">
                How will you mostly use Zahiri?
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {ROLES.map((r) => (
                  <Chip
                    key={r.value}
                    label={r.label}
                    icon={r.icon}
                    color={colors.zahiri}
                    active={role === r.value}
                    onPress={() => setRole(r.value)}
                  />
                ))}
              </View>
            </View>

            {error ? <ErrorNote message={error} /> : null}

            <View className="mt-1">
              <Button title="Create account" size="lg" loading={busy} onPress={submit} />
            </View>

            <View
              className="flex-row rounded-2xl p-3"
              style={{
                backgroundColor: alpha(colors.info, 0.1),
                borderWidth: 1,
                borderColor: alpha(colors.info, 0.25),
                gap: 9,
              }}
            >
              <Ionicons name="lock-closed" size={15} color={colors.info} style={{ marginTop: 1 }} />
              <Text className="flex-1 font-sans text-chalk-soft" style={{ fontSize: 11.5, lineHeight: 17 }}>
                Your password is hashed before it is stored, and your session key is kept in
                your device's secure keystore.
              </Text>
            </View>
          </View>

          <Pressable className="mt-6" onPress={() => router.replace('/(auth)/sign-in')}>
            <Text className="font-sans text-center text-caption text-chalk-soft">
              Already registered? <Text style={{ color: colors.zahiri }}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
