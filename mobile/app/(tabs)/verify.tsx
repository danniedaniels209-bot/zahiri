import { useState } from 'react';
import { useRouter } from 'expo-router';
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
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Chip, ErrorNote, SectionTitle } from '../../components/ui';
import { ScanPulse } from '../../components/ScanPulse';
import { VerdictSheet } from '../../components/VerdictSheet';
import { ServerBanner } from '../../components/ServerBanner';
import { api, apiUpload, ApiError, type VerificationResult } from '../../lib/api';
import { alpha, colors } from '../../theme/tokens';

type Mode = 'text' | 'media';

const EXAMPLES = [
  'Salt water cures malaria',
  'JAMB extended registration',
  'This voice note from my group',
];

export default function Verify() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('text');
  const [claim, setClaim] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setResult(null);
    setError(null);
    setClaim('');
    setFile(null);
    setNote('');
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Zahiri needs access to your photos to check an image or video.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const a = picked.assets[0];
    setFile({
      uri: a.uri,
      name: a.fileName ?? `upload.${a.uri.split('.').pop() ?? 'jpg'}`,
      type: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    });
    setError(null);
  }

  async function pickAudio() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['audio/*', 'video/*', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const a = picked.assets[0];
    setFile({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' });
    setError(null);
  }

  async function submit() {
    setError(null);
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res =
        mode === 'text'
          ? await api<VerificationResult>('/api/verify/claim', {
              method: 'POST',
              body: { claim: claim.trim() },
            })
          : await apiUpload<VerificationResult>('/api/verify/media', file!, {
              description: note.trim(),
            });

      setResult(res);
      void Haptics.notificationAsync(
        res.verdict === 'verified'
          ? Haptics.NotificationFeedbackType.Success
          : res.verdict === 'false'
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = mode === 'text' ? claim.trim().length >= 3 : Boolean(file);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ink">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1 px-gutter"
          contentContainerStyle={{ paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center justify-between pt-2 pb-5">
            <Text className="font-display text-h1 text-chalk" style={{ letterSpacing: -0.8 }}>
              Verify
            </Text>
            {!result ? (
              <Pressable onPress={() => router.push('/chat')} hitSlop={10}>
                <View className="flex-row items-center" style={{ gap: 5 }}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.info} />
                  <Text style={{ color: colors.info, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
                    Ask Zahiri
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable onPress={reset} hitSlop={10}>
                <View className="flex-row items-center" style={{ gap: 5 }}>
                  <Ionicons name="refresh" size={15} color={colors.zahiri} />
                  <Text style={{ color: colors.zahiri, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
                    New check
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          <ServerBanner />

          {busy ? (
            <ScanPulse label={mode === 'media' ? 'Analysing media' : 'Checking claim'} />
          ) : result ? (
            <VerdictSheet result={result} />
          ) : (
            <Animated.View entering={FadeIn.duration(300)}>
              {/* Mode switch */}
              <View
                className="flex-row rounded-pill p-1 mb-5"
                style={{ backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.inkEdge }}
              >
                {(
                  [
                    { key: 'text', label: 'Claim or link', icon: 'text-outline' },
                    { key: 'media', label: 'Image, video, audio', icon: 'images-outline' },
                  ] as const
                ).map((m) => {
                  const active = mode === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      className="flex-1 flex-row items-center justify-center rounded-pill py-2.5"
                      style={{
                        backgroundColor: active ? alpha(colors.zahiri, 0.16) : 'transparent',
                        gap: 6,
                      }}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setMode(m.key);
                        setError(null);
                      }}
                    >
                      <Ionicons
                        name={m.icon}
                        size={15}
                        color={active ? colors.zahiri : colors.chalkFaint}
                      />
                      <Text
                        style={{
                          color: active ? colors.zahiri : colors.chalkSoft,
                          fontFamily: 'Inter_500Medium',
                          fontSize: 12.5,
                        }}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {mode === 'text' ? (
                <>
                  <View
                    className="rounded-card p-4"
                    style={{
                      backgroundColor: colors.inkRaised,
                      borderWidth: 1,
                      borderColor: claim ? alpha(colors.zahiri, 0.4) : colors.inkEdge,
                    }}
                  >
                    <TextInput
                      placeholder="Paste the message, claim, or link you want checked…"
                      placeholderTextColor={colors.chalkFaint}
                      selectionColor={colors.zahiri}
                      value={claim}
                      onChangeText={setClaim}
                      multiline
                      textAlignVertical="top"
                      style={{
                        color: colors.chalk,
                        fontFamily: 'Inter_400Regular',
                        fontSize: 15,
                        lineHeight: 22,
                        minHeight: 130,
                      }}
                    />
                    <View className="flex-row items-center justify-between mt-2">
                      <Text className="font-sans text-chalk-faint" style={{ fontSize: 11 }}>
                        {claim.length}/4000
                      </Text>
                      {claim.length > 0 ? (
                        <Pressable onPress={() => setClaim('')} hitSlop={8}>
                          <Ionicons name="close-circle" size={17} color={colors.chalkFaint} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <SectionTitle>Try one</SectionTitle>
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {EXAMPLES.map((ex) => (
                      <Chip key={ex} label={ex} onPress={() => setClaim(ex)} />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  {file ? (
                    <Animated.View
                      entering={FadeInDown.duration(300)}
                      className="rounded-card p-4"
                      style={{
                        backgroundColor: colors.inkRaised,
                        borderWidth: 1,
                        borderColor: alpha(colors.zahiri, 0.4),
                      }}
                    >
                      <View className="flex-row items-center" style={{ gap: 12 }}>
                        <View
                          className="items-center justify-center rounded-xl"
                          style={{ width: 42, height: 42, backgroundColor: alpha(colors.zahiri, 0.14) }}
                        >
                          <Ionicons
                            name={
                              file.type.startsWith('image')
                                ? 'image-outline'
                                : file.type.startsWith('video')
                                  ? 'videocam-outline'
                                  : 'mic-outline'
                            }
                            size={20}
                            color={colors.zahiri}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="font-medium text-chalk"
                            style={{ fontSize: 13.5 }}
                            numberOfLines={1}
                          >
                            {file.name}
                          </Text>
                          <Text className="font-sans text-chalk-faint" style={{ fontSize: 11.5 }}>
                            {file.type}
                          </Text>
                        </View>
                        <Pressable onPress={() => setFile(null)} hitSlop={10}>
                          <Ionicons name="close-circle" size={20} color={colors.chalkFaint} />
                        </Pressable>
                      </View>
                    </Animated.View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <PickerTile
                        icon="images-outline"
                        title="Photo or video"
                        body="Check an image or clip for AI manipulation"
                        onPress={pickImage}
                      />
                      <PickerTile
                        icon="mic-outline"
                        title="Voice note or file"
                        body="Check a forwarded voice note or any media file"
                        onPress={pickAudio}
                      />
                    </View>
                  )}

                  <SectionTitle>Context (optional)</SectionTitle>
                  <View
                    className="rounded-card p-3.5"
                    style={{ backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.inkEdge }}
                  >
                    <TextInput
                      placeholder="Where did you get this? What does it claim?"
                      placeholderTextColor={colors.chalkFaint}
                      selectionColor={colors.zahiri}
                      value={note}
                      onChangeText={setNote}
                      multiline
                      textAlignVertical="top"
                      style={{
                        color: colors.chalk,
                        fontFamily: 'Inter_400Regular',
                        fontSize: 14,
                        lineHeight: 20,
                        minHeight: 62,
                      }}
                    />
                  </View>
                </>
              )}

              {error ? (
                <View className="mt-4">
                  <ErrorNote message={error} />
                </View>
              ) : null}

              <View className="mt-6">
                <Button
                  title={mode === 'text' ? 'Check this claim' : 'Analyse this file'}
                  size="lg"
                  icon="shield-checkmark"
                  disabled={!canSubmit}
                  onPress={submit}
                />
              </View>

              <View
                className="flex-row rounded-2xl p-3 mt-4"
                style={{
                  backgroundColor: alpha(colors.info, 0.09),
                  borderWidth: 1,
                  borderColor: alpha(colors.info, 0.22),
                  gap: 9,
                }}
              >
                <Ionicons name="information-circle-outline" size={15} color={colors.info} style={{ marginTop: 1 }} />
                <Text className="flex-1 font-sans text-chalk-soft" style={{ fontSize: 11.5, lineHeight: 17 }}>
                  Zahiri tells you what it could not check, not just what it could. A verdict of
                  "unverified" means treat the claim with care, not that it is false.
                </Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PickerTile({
  icon,
  title,
  body,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-row items-center rounded-card p-4"
      style={{
        backgroundColor: colors.inkRaised,
        borderWidth: 1,
        borderColor: colors.inkEdge,
        borderStyle: 'dashed',
        gap: 13,
      }}
    >
      <View
        className="items-center justify-center rounded-xl"
        style={{ width: 42, height: 42, backgroundColor: colors.inkHigh }}
      >
        <Ionicons name={icon} size={20} color={colors.chalkSoft} />
      </View>
      <View className="flex-1">
        <Text className="font-medium text-chalk" style={{ fontSize: 14.5 }}>
          {title}
        </Text>
        <Text className="font-sans text-chalk-soft mt-0.5" style={{ fontSize: 12, lineHeight: 17 }}>
          {body}
        </Text>
      </View>
      <Ionicons name="add-circle-outline" size={20} color={colors.chalkFaint} />
    </Pressable>
  );
}
