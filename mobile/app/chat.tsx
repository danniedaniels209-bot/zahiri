import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { ErrorNote, VerdictBadge } from '../components/ui';
import { ServerBanner } from '../components/ServerBanner';
import { api, ApiError, type VerificationResult } from '../lib/api';
import { useAuth } from '../lib/auth';
import { alpha, colors } from '../theme/tokens';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  verification?: VerificationResult | null;
}

const OPENERS = [
  'Is this message I got true?',
  'How do I spot a deepfake voice note?',
  'Is this website trustworthy?',
];

export default function Chat() {
  const router = useRouter();
  const { user } = useAuth();
  const scroller = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When on, the claim is also put through the verification engine. */
  const [verifyMode, setVerifyMode] = useState(true);

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || busy) return;

    setError(null);
    setDraft('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const history = [...messages, { role: 'user' as const, content }];
    setMessages(history);
    setBusy(true);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);

    try {
      const res = await api<{ reply: string; verification: VerificationResult | null }>(
        '/api/chat',
        {
          method: 'POST',
          body: {
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            verify: verifyMode,
            language: user?.language ?? 'en',
          },
        },
      );

      setMessages((m) => [
        ...m,
        { role: 'assistant', content: res.reply, verification: res.verification },
      ]);

      if (user?.accessibility?.audioReadout) {
        Speech.speak(res.reply, { language: user.language ?? 'en', rate: 0.98 });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Zahiri could not reply. Try again.');
    } finally {
      setBusy(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ink">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View
          className="flex-row items-center px-gutter py-3"
          style={{ borderBottomWidth: 1, borderBottomColor: colors.inkEdge, gap: 12 }}
        >
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.chalkSoft} />
          </Pressable>

          <View
            className="items-center justify-center rounded-full"
            style={{ width: 34, height: 34, backgroundColor: alpha(colors.zahiri, 0.16) }}
          >
            <Ionicons name="shield-checkmark" size={18} color={colors.zahiri} />
          </View>

          <View className="flex-1">
            <Text className="font-display-medium text-chalk" style={{ fontSize: 16 }}>
              Ask Zahiri
            </Text>
            <Text className="font-sans text-chalk-faint" style={{ fontSize: 11.5 }}>
              {busy ? 'Thinking…' : 'Fact-checking assistant'}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setVerifyMode((v) => !v);
            }}
            hitSlop={8}
            className="flex-row items-center rounded-pill px-2.5 py-1.5"
            style={{
              backgroundColor: verifyMode ? alpha(colors.zahiri, 0.16) : colors.inkHigh,
              borderWidth: 1,
              borderColor: verifyMode ? alpha(colors.zahiri, 0.4) : colors.inkEdge,
              gap: 5,
            }}
          >
            <Ionicons
              name={verifyMode ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={verifyMode ? colors.zahiri : colors.chalkFaint}
            />
            <Text
              style={{
                color: verifyMode ? colors.zahiri : colors.chalkSoft,
                fontFamily: 'Inter_500Medium',
                fontSize: 11,
              }}
            >
              Verify
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          className="flex-1 px-gutter"
          contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ServerBanner />

          {messages.length === 0 ? (
            <Animated.View entering={FadeInUp.duration(400)} className="py-6">
              <Text
                className="font-display text-chalk"
                style={{ fontSize: 26, lineHeight: 33, letterSpacing: -0.6 }}
              >
                What would you{'\n'}like checked?
              </Text>
              <Text className="font-sans text-body text-chalk-soft mt-2 mb-6">
                Paste a message, ask a question, or describe what you saw.
              </Text>

              <View style={{ gap: 9 }}>
                {OPENERS.map((o, i) => (
                  <Animated.View key={o} entering={FadeInDown.delay(120 + i * 80).duration(400)}>
                    <Pressable
                      onPress={() => void send(o)}
                      className="flex-row items-center rounded-2xl px-4 py-3.5"
                      style={{
                        backgroundColor: colors.inkRaised,
                        borderWidth: 1,
                        borderColor: colors.inkEdge,
                        gap: 10,
                      }}
                    >
                      <Ionicons name="sparkles-outline" size={15} color={colors.zahiri} />
                      <Text className="flex-1 font-sans text-chalk" style={{ fontSize: 14 }}>
                        {o}
                      </Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.chalkFaint} />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          ) : (
            messages.map((m, i) => <Bubble key={i} message={m} index={i} />)
          )}

          {busy ? <TypingBubble /> : null}
          {error ? <ErrorNote message={error} /> : null}
        </ScrollView>

        {/* Composer */}
        <View
          className="px-gutter py-3"
          style={{ borderTopWidth: 1, borderTopColor: colors.inkEdge }}
        >
          <View
            className="flex-row items-end rounded-3xl px-4 py-2"
            style={{
              backgroundColor: colors.inkRaised,
              borderWidth: 1,
              borderColor: draft ? alpha(colors.zahiri, 0.4) : colors.inkEdge,
              gap: 10,
            }}
          >
            <TextInput
              className="flex-1"
              placeholder="Message Zahiri…"
              placeholderTextColor={colors.chalkFaint}
              selectionColor={colors.zahiri}
              value={draft}
              onChangeText={setDraft}
              multiline
              style={{
                color: colors.chalk,
                fontFamily: 'Inter_400Regular',
                fontSize: 15,
                maxHeight: 120,
                paddingVertical: 8,
              }}
            />
            <Pressable
              onPress={() => void send()}
              disabled={!draft.trim() || busy}
              className="items-center justify-center rounded-full mb-1"
              style={{
                width: 34,
                height: 34,
                backgroundColor: draft.trim() && !busy ? colors.zahiri : colors.inkHigh,
              }}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={draft.trim() && !busy ? colors.inkDeep : colors.chalkFaint}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message, index }: { message: Message; index: number }) {
  const mine = message.role === 'user';

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 4) * 40).duration(320)}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
    >
      <View
        className="rounded-3xl px-4 py-3"
        style={{
          maxWidth: '88%',
          backgroundColor: mine ? alpha(colors.zahiri, 0.16) : colors.inkRaised,
          borderWidth: 1,
          borderColor: mine ? alpha(colors.zahiri, 0.3) : colors.inkEdge,
          borderBottomRightRadius: mine ? 8 : 24,
          borderBottomLeftRadius: mine ? 24 : 8,
        }}
      >
        <Text
          className="font-sans"
          style={{ color: colors.chalk, fontSize: 14.5, lineHeight: 21 }}
        >
          {message.content}
        </Text>
      </View>

      {/* When verify mode was on, the engine's verdict rides alongside the reply. */}
      {message.verification ? (
        <View
          className="rounded-2xl px-3.5 py-3 mt-2"
          style={{
            maxWidth: '88%',
            backgroundColor: colors.inkRaised,
            borderWidth: 1,
            borderColor: colors.inkEdge,
            gap: 8,
          }}
        >
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <VerdictBadge verdict={message.verification.verdict} size="sm" />
            <Text className="font-sans text-chalk-faint" style={{ fontSize: 11 }}>
              {message.verification.confidence}% confidence
            </Text>
          </View>
          <Text className="font-sans text-chalk-soft" style={{ fontSize: 12.5, lineHeight: 18 }}>
            {message.verification.explanation}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function TypingBubble() {
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={{ alignItems: 'flex-start' }}>
      <View
        className="flex-row items-center rounded-3xl px-4 py-3.5"
        style={{
          backgroundColor: colors.inkRaised,
          borderWidth: 1,
          borderColor: colors.inkEdge,
          borderBottomLeftRadius: 8,
          gap: 5,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            entering={FadeInUp.delay(i * 130).duration(400)}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.chalkFaint,
            }}
          />
        ))}
      </View>
    </Animated.View>
  );
}
