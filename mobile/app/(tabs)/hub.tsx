import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Header,
  Loading,
  Screen,
  VerdictBadge,
} from '../../components/ui';
import { ServerBanner } from '../../components/ServerBanner';
import { api, ApiError, type HubPostItem } from '../../lib/api';
import { alpha, colors, topicMeta } from '../../theme/tokens';

const TOPICS = ['all', 'health', 'education', 'civic', 'local', 'election'] as const;

export default function Hub() {
  const qc = useQueryClient();
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('all');
  const [composing, setComposing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const posts = useQuery({
    queryKey: ['hub', topic],
    queryFn: () =>
      api<{ total: number; count: number; items: HubPostItem[] }>(
        `/api/hub/posts?limit=20${topic === 'all' ? '' : `&topic=${topic}`}`,
      ),
  });

  const like = useMutation({
    mutationFn: (id: string) => api<{ likes: number; liked: boolean }>(`/api/hub/posts/${id}/like`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub'] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['hub'] });
    setRefreshing(false);
  }, [qc]);

  return (
    <>
      <Screen
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.zahiri} />
        }
      >
        <Header
          title="The Hub"
          subtitle="Nothing here goes live until it has been checked."
          right={
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setComposing(true);
              }}
              className="items-center justify-center rounded-full"
              style={{
                width: 40,
                height: 40,
                backgroundColor: alpha(colors.zahiri, 0.16),
                borderWidth: 1,
                borderColor: alpha(colors.zahiri, 0.35),
              }}
            >
              <Ionicons name="add" size={22} color={colors.zahiri} />
            </Pressable>
          }
        />

        <ServerBanner />

        <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
          {TOPICS.map((t) => (
            <Chip
              key={t}
              label={t === 'all' ? 'All' : (topicMeta[t]?.label ?? t)}
              color={t === 'all' ? colors.zahiri : (topicMeta[t]?.color ?? colors.zahiri)}
              active={topic === t}
              onPress={() => setTopic(t)}
            />
          ))}
        </View>

        {posts.isLoading ? (
          <Loading label="Loading the hub" />
        ) : posts.isError ? (
          <EmptyState icon="cloud-offline-outline" title="Could not load the hub" body="Pull down to retry." />
        ) : posts.data!.items.length === 0 ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="Nothing published yet"
            body="Be the first to post something that checks out."
            action={<Button title="Write a post" onPress={() => setComposing(true)} />}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {posts.data!.items.map((p, i) => {
              const meta = topicMeta[p.topic] ?? topicMeta.general;
              return (
                <Card key={p._id} index={i}>
                  <View className="flex-row items-center justify-between mb-2.5">
                    <View className="flex-row items-center" style={{ gap: 7 }}>
                      <View
                        className="items-center justify-center rounded-full"
                        style={{ width: 26, height: 26, backgroundColor: colors.inkHigh }}
                      >
                        <Text className="font-semibold text-chalk-soft" style={{ fontSize: 11 }}>
                          {p.author?.name?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <Text className="font-medium text-chalk-soft" style={{ fontSize: 12.5 }}>
                        {p.author?.name ?? 'Unknown'}
                      </Text>
                      {p.author?.tier === 'premium' ? (
                        <Ionicons name="star" size={11} color="#FFB020" />
                      ) : null}
                    </View>
                    {p.verification ? <VerdictBadge verdict={p.verification.verdict} size="sm" /> : null}
                  </View>

                  <Text
                    className="font-display-medium text-chalk"
                    style={{ fontSize: 16, lineHeight: 22, letterSpacing: -0.2 }}
                  >
                    {p.title}
                  </Text>
                  <Text
                    className="font-sans text-chalk-soft mt-1.5"
                    style={{ fontSize: 13.5, lineHeight: 20 }}
                    numberOfLines={4}
                  >
                    {p.body}
                  </Text>

                  <View className="flex-row items-center justify-between mt-3.5">
                    <Chip label={meta.label} color={meta.color} active />
                    <View className="flex-row items-center" style={{ gap: 16 }}>
                      <Pressable
                        onPress={() => {
                          void Haptics.selectionAsync();
                          like.mutate(p._id);
                        }}
                        className="flex-row items-center"
                        style={{ gap: 5 }}
                        hitSlop={8}
                      >
                        <Ionicons name="heart-outline" size={16} color={colors.chalkFaint} />
                        <Text className="font-sans text-chalk-faint" style={{ fontSize: 12 }}>
                          {p.likes}
                        </Text>
                      </Pressable>
                      {p.isResource ? (
                        <View className="flex-row items-center" style={{ gap: 5 }}>
                          <Ionicons name="download-outline" size={16} color={colors.chalkFaint} />
                          <Text className="font-sans text-chalk-faint" style={{ fontSize: 12 }}>
                            {p.downloads}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Screen>

      <ComposeModal visible={composing} onClose={() => setComposing(false)} />
    </>
  );
}

/** Posting runs the submission through the verification engine before it is stored. */
function ComposeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('general');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ status: string; message: string } | null>(null);

  const post = useMutation({
    mutationFn: () =>
      api<{ post: { status: string }; message: string }>('/api/hub/posts', {
        method: 'POST',
        body: { title: title.trim(), body: body.trim(), topic },
      }),
    onSuccess: (data) => {
      setOutcome({ status: data.post.status, message: data.message });
      void qc.invalidateQueries({ queryKey: ['hub'] });
      void Haptics.notificationAsync(
        data.post.status === 'approved'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not submit your post.'),
  });

  function close() {
    setTitle('');
    setBody('');
    setError(null);
    setOutcome(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView className="flex-1 bg-ink">
        <View className="flex-1 px-gutter">
          <View className="flex-row items-center justify-between py-4">
            <Text className="font-display text-title text-chalk">New post</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.chalkSoft} />
            </Pressable>
          </View>

          {outcome ? (
            <View className="flex-1 justify-center">
              <EmptyState
                icon={
                  outcome.status === 'approved'
                    ? 'checkmark-circle-outline'
                    : outcome.status === 'pending'
                      ? 'hourglass-outline'
                      : 'close-circle-outline'
                }
                title={
                  outcome.status === 'approved'
                    ? 'Published'
                    : outcome.status === 'pending'
                      ? 'With a fact-checker'
                      : 'Not published'
                }
                body={outcome.message}
                action={<Button title="Done" onPress={close} />}
              />
            </View>
          ) : post.isPending ? (
            <Loading label="Verifying your post before publishing" />
          ) : (
            <>
              <Text className="font-sans text-caption text-chalk-soft mb-4">
                Zahiri checks every submission before it goes live. A claim that does not hold up
                is not published.
              </Text>

              <View style={{ gap: 14 }}>
                <View
                  className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.inkEdge }}
                >
                  <TextInput
                    placeholder="Title"
                    placeholderTextColor={colors.chalkFaint}
                    selectionColor={colors.zahiri}
                    value={title}
                    onChangeText={setTitle}
                    style={{ color: colors.chalk, fontFamily: 'Inter_600SemiBold', fontSize: 16 }}
                  />
                </View>

                <View
                  className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.inkEdge }}
                >
                  <TextInput
                    placeholder="What do you want to share? Include where the information came from."
                    placeholderTextColor={colors.chalkFaint}
                    selectionColor={colors.zahiri}
                    value={body}
                    onChangeText={setBody}
                    multiline
                    textAlignVertical="top"
                    style={{
                      color: colors.chalk,
                      fontFamily: 'Inter_400Regular',
                      fontSize: 14.5,
                      lineHeight: 21,
                      minHeight: 150,
                    }}
                  />
                </View>

                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {Object.entries(topicMeta).map(([key, meta]) => (
                    <Chip
                      key={key}
                      label={meta.label}
                      color={meta.color}
                      active={topic === key}
                      onPress={() => setTopic(key)}
                    />
                  ))}
                </View>

                {error ? <ErrorNote message={error} /> : null}

                <Button
                  title="Submit for verification"
                  size="lg"
                  disabled={title.trim().length < 5 || body.trim().length < 20}
                  onPress={() => {
                    setError(null);
                    post.mutate();
                  }}
                />
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
