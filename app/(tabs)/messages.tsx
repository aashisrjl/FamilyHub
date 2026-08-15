import { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useFamilyStore } from '@/lib/family-store';
import { supabase } from '@/lib/supabase';
import { colors, typography, radius, spacing } from '@/lib/theme';
import { formatTime, formatDuration } from '@/lib/helpers';
import { Avatar } from '@/components/Avatar';
import { EmptyState, LoadingState } from '@/components/States';
import { useVoiceRecorder, useAudioPlayer } from '@/lib/audio-utils';
import type { Message } from '@/lib/types';
import { notifyNewMessage } from '@/lib/sound-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  Send,
  Mic,
  MicOff,
  Image as ImageIcon,
  FileText,
  Play,
  Pause,
  Radio,
  MessageCircle,
  X,
  Trash2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

type ChatFilter = 'broadcast' | 'direct';

export default function MessagesScreen() {
  const { user, profile } = useAuthStore();
  const { family, members, subscribe } = useFamilyStore();
  const [filter, setFilter] = useState<ChatFilter>('broadcast');
  const [directMemberId, setDirectMemberId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  // Track which chats have been loaded at least once (no spinner on re-visit)
  const hasLoadedRef = useRef<Record<string, boolean>>({});

  const recorder = useVoiceRecorder();
  const player = useAudioPlayer();

  useEffect(() => {
    if (family) subscribe(family.id);
  }, [family?.id]);

  const otherMembers = members.filter((m) => m.id !== user?.id);

  // Determine recipient for direct chat
  const recipientId = filter === 'direct' ? directMemberId : null;
  const recipientProfile = members.find((m) => m.id === recipientId);

  const loadMessages = useCallback(async (background = false) => {
    if (!family || !user) return;
    const cacheKey = `${filter}-${recipientId ?? 'all'}`;
    const isFirstLoad = !hasLoadedRef.current?.[cacheKey];
    if (isFirstLoad && !background) setLoading(true);
    let query = supabase
      .from('messages')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (filter === 'broadcast') {
      query = query.is('recipient_id', null);
    } else if (recipientId) {
      query = query.or(`and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user.id})`);
    } else {
      // No direct member selected yet
      setMessages([]);
      setLoading(false);
      return;
    }

    const { data } = await query;
    setMessages((data as Message[]) ?? []);
    hasLoadedRef.current[cacheKey] = true;
    setLoading(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [family, user, filter, recipientId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Keep a stable ref to the latest loadMessages so the realtime channel
  // doesn't need to be recreated whenever the callback identity changes.
  const loadMessagesRef = useRef(loadMessages);
  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  });

  // Realtime
  useEffect(() => {
    if (!family) return;
    const channel = supabase
      .channel(`messages-${family.id}-${filter}-${recipientId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `family_id=eq.${family.id}` },
        (payload) => {
          if (payload.new && payload.new.sender_id !== user?.id) {
            const sender = members.find((m) => m.id === payload.new.sender_id);
            notifyNewMessage(sender?.display_name ?? 'Family Member', payload.new.text);
          }
          loadMessagesRef.current(true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [family?.id, filter, recipientId, user?.id, members]);

  const getSenderName = (id: string) => {
    if (id === user?.id) return 'You';
    return members.find((m) => m.id === id)?.display_name ?? 'Unknown';
  };

  const colorIndexFor = (id: string) => members.findIndex((m) => m.id === id);

  const handleSendText = async () => {
    if (!inputText.trim() || !family || !user) return;
    const text = inputText.trim();
    setInputText('');

    // Optimistically show message immediately
    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      family_id: family.id,
      sender_id: user.id,
      recipient_id: recipientId,
      text,
      media_url: null,
      media_type: null,
      duration_seconds: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    const { error } = await supabase.from('messages').insert({
      family_id: family.id,
      sender_id: user.id,
      recipient_id: recipientId,
      text,
    });

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else {
      loadMessages(true);
    }
  };

  const handleSendImage = async () => {
    if (!family || !user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const filename = `images/${family.id}/${Date.now()}.jpg`;

    try {
      const file = {
        uri: asset.uri,
        type: 'image/jpeg',
        name: filename,
      } as unknown as File;

      const { error: uploadError } = await supabase.storage
        .from('family-media')
        .upload(filename, file, { contentType: 'image/jpeg' });

      if (uploadError) return;

      await supabase.from('messages').insert({
        family_id: family.id,
        sender_id: user.id,
        recipient_id: recipientId,
        media_url: filename,
        media_type: 'image',
      });
      loadMessages(true);
    } catch {
      // silent
    }
  };

  const handleSendFile = async () => {
    if (!family || !user) return;
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const ext = asset.name?.split('.').pop() ?? 'file';
    const filename = `files/${family.id}/${Date.now()}.${ext}`;

    try {
      const file = {
        uri: asset.uri,
        type: asset.mimeType ?? 'application/octet-stream',
        name: filename,
      } as unknown as File;

      const { error: uploadError } = await supabase.storage
        .from('family-media')
        .upload(filename, file, { contentType: asset.mimeType ?? 'application/octet-stream' });

      if (uploadError) return;

      await supabase.from('messages').insert({
        family_id: family.id,
        sender_id: user.id,
        recipient_id: recipientId,
        media_url: filename,
        media_type: 'file',
        text: asset.name,
      });
      loadMessages(true);
    } catch {
      // silent
    }
  };

  const handleStartRecording = async () => {
    const success = await recorder.startRecording();
    if (success && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleStopAndSendRecording = async () => {
    const result = await recorder.stopRecording();
    if (!result || !family || !user) return;
    const path = await recorder.uploadAudio(result.uri, family.id);
    if (!path) return;
    await supabase.from('messages').insert({
      family_id: family.id,
      sender_id: user.id,
      recipient_id: recipientId,
      media_url: path,
      media_type: 'audio',
      duration_seconds: result.duration,
    });
    loadMessages(true);
  };

  const handleCancelRecording = async () => {
    await recorder.cancelRecording();
  };

  const handleDeleteMessage = async (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    await supabase.from('messages').delete().eq('id', msgId);
    loadMessages(true);
  };

  const handlePlayAudio = async (path: string, msgId: string) => {
    if (player.playingId === msgId) {
      await player.stop();
    } else {
      await player.playFromPath(path, msgId);
    }
  };

  const getMediaUrl = (path: string) => {
    const { data } = supabase.storage.from('family-media').getPublicUrl(path);
    return data.publicUrl;
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === user?.id;
    const senderName = getSenderName(item.sender_id);
    const idx = colorIndexFor(item.sender_id);

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
        {!isMine && filter === 'broadcast' && (
          <Avatar name={senderName} size={32} colorIndex={idx} />
        )}
        <View style={[styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleOther]}>
          {!isMine && filter === 'broadcast' && (
            <Text style={styles.senderName}>{senderName}</Text>
          )}

          {item.text && !item.media_type && (
            <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{item.text}</Text>
          )}

          {item.media_type === 'image' && item.media_url && (
            <TouchableOpacity
              onPress={() => setPreviewImage(getMediaUrl(item.media_url!))}
              activeOpacity={0.9}
            >
              <Image
                source={{ uri: getMediaUrl(item.media_url!) }}
                style={styles.msgImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}

          {item.media_type === 'audio' && item.media_url && (
            <View style={styles.audioRow}>
              <TouchableOpacity
                onPress={() => handlePlayAudio(item.media_url!, item.id)}
                style={styles.audioPlayBtn}
              >
                {player.playingId === item.id ? (
                  <Pause size={20} color={colors.neutral[0]} strokeWidth={2} />
                ) : (
                  <Play size={20} color={colors.neutral[0]} strokeWidth={2} />
                )}
              </TouchableOpacity>
              <View style={styles.audioWaveform}>
                {Array.from({ length: 24 }).map((_, i) => {
                  const filled = player.playingId === item.id
                    ? (i / 24) * 100 < player.progress
                    : false;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: 8 + Math.sin(i * 1.5) * 8 + Math.random() * 6,
                          backgroundColor: isMine
                            ? (filled ? colors.neutral[0] : colors.neutral[0] + '80')
                            : (filled ? colors.secondary[500] : colors.neutral[300]),
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <Text style={[styles.audioDuration, isMine && styles.msgTextMine]}>
                {formatDuration(item.duration_seconds ?? 0)}
              </Text>
            </View>
          )}

          {item.media_type === 'file' && item.media_url && (
            <View style={styles.fileRow}>
              <FileText size={24} color={isMine ? colors.neutral[0] : colors.secondary[500]} strokeWidth={2} />
              <Text style={[styles.fileName, isMine && styles.msgTextMine]} numberOfLines={1}>
                {item.text ?? 'File'}
              </Text>
            </View>
          )}

          <Text style={[styles.msgTime, isMine && styles.msgTimeMine]}>
            {formatTime(item.created_at)}
          </Text>

          {isMine && (
            <TouchableOpacity
              onPress={() => handleDeleteMessage(item.id)}
              style={styles.deleteMsgBtn}
            >
              <Trash2 size={12} color={isMine ? colors.neutral[0] + '80' : colors.neutral[400]} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const headerTitle = filter === 'broadcast' ? 'Family Channel' : recipientProfile?.display_name ?? 'Direct Message';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Messages</Text>
          <Text style={styles.headerSub}>{headerTitle}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, filter === 'broadcast' && styles.tabActive]}
          onPress={() => { setFilter('broadcast'); setDirectMemberId(null); }}
        >
          <Radio size={16} color={filter === 'broadcast' ? colors.neutral[900] : colors.neutral[400]} strokeWidth={2} />
          <Text style={[styles.tabText, filter === 'broadcast' && styles.tabTextActive]}>Broadcast</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, filter === 'direct' && styles.tabActive]}
          onPress={() => { setFilter('direct'); setShowMemberPicker(true); }}
        >
          <MessageCircle size={16} color={filter === 'direct' ? colors.neutral[900] : colors.neutral[400]} strokeWidth={2} />
          <Text style={[styles.tabText, filter === 'direct' && styles.tabTextActive]}>Direct</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <LoadingState label="Loading messages..." />
      ) : filter === 'direct' && !recipientId ? (
        <EmptyState
          icon={<MessageCircle size={56} color={colors.neutral[300]} strokeWidth={1.5} />}
          title="Select a family member"
          subtitle="Choose someone to start a direct conversation."
        />
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={56} color={colors.neutral[300]} strokeWidth={1.5} />}
          title="No messages yet"
          subtitle="Send the first message to your family!"
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.inputBar}>
          <View style={styles.inputActions}>
            <TouchableOpacity onPress={handleSendImage} style={styles.inputActionBtn} hitSlop={8}>
              <ImageIcon size={22} color={colors.neutral[500]} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendFile} style={styles.inputActionBtn} hitSlop={8}>
              <FileText size={22} color={colors.neutral[500]} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.neutral[400]}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />

          {inputText.trim() ? (
            <TouchableOpacity onPress={handleSendText} style={styles.sendBtn}>
              <Send size={20} color={colors.neutral[0]} strokeWidth={2} />
            </TouchableOpacity>
          ) : recorder.recordState === 'recording' ? (
            <View style={styles.recordingRow}>
              <TouchableOpacity onPress={handleCancelRecording} style={styles.cancelRecBtn}>
                <MicOff size={20} color={colors.error[500]} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleStopAndSendRecording} style={styles.sendRecBtn}>
                <Send size={20} color={colors.neutral[0]} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPressIn={handleStartRecording}
              onPressOut={handleStopAndSendRecording}
              style={styles.micBtn}
            >
              <Mic size={22} color={colors.neutral[0]} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        {recorder.recordState === 'recording' && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>
              Recording... {formatDuration(recorder.recordSeconds)}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Member Picker Modal */}
      <Modal visible={showMemberPicker} transparent animationType="slide" onRequestClose={() => setShowMemberPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowMemberPicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Start Direct Chat</Text>
              <TouchableOpacity onPress={() => setShowMemberPicker(false)}>
                <X size={22} color={colors.neutral[500]} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {otherMembers.length === 0 ? (
              <Text style={styles.pickerEmpty}>No other family members yet.</Text>
            ) : (
              otherMembers.map((m) => {
                const idx = colorIndexFor(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.pickerItem}
                    onPress={() => {
                      setDirectMemberId(m.id);
                      setShowMemberPicker(false);
                    }}
                  >
                    <Avatar name={m.display_name} size={44} status={m.status} colorIndex={idx} />
                    <View>
                      <Text style={styles.pickerItemName}>{m.display_name}</Text>
                      <Text style={styles.pickerItemStatus}>{m.status}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Image Preview Modal */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewImage(null)}>
          <Image source={{ uri: previewImage ?? '' }} style={styles.previewImage} resizeMode="contain" />
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewImage(null)}>
            <X size={28} color={colors.neutral[0]} strokeWidth={2} />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  headerSub: {
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.neutral[100],
    borderRadius: radius.md,
    padding: 4,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  tabActive: {
    backgroundColor: colors.neutral[0],
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[500],
  },
  tabTextActive: {
    color: colors.neutral[900],
    fontFamily: typography.fontFamilyBold,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '75%',
    borderRadius: radius.lg,
    padding: spacing.md,
    position: 'relative',
  },
  msgBubbleMine: {
    backgroundColor: colors.primary[500],
    borderBottomRightRadius: radius.sm,
  },
  msgBubbleOther: {
    backgroundColor: colors.neutral[0],
    borderBottomLeftRadius: radius.sm,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  senderName: {
    fontSize: 12,
    fontFamily: typography.fontFamilyBold,
    color: colors.primary[700],
    marginBottom: 4,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[900],
  },
  msgTextMine: {
    color: colors.neutral[0],
  },
  msgTime: {
    fontSize: 10,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  msgTimeMine: {
    color: colors.neutral[0] + 'CC',
  },
  msgImage: {
    width: 220,
    height: 220,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 180,
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 28,
  },
  waveformBar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 4,
  },
  audioDuration: {
    fontSize: 12,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[700],
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fileName: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[900],
    flexShrink: 1,
  },
  deleteMsgBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.neutral[0],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  inputActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  inputActionBtn: {
    padding: spacing.xs,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[900],
    backgroundColor: colors.neutral[50],
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cancelRecBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.error[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendRecBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.success[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error[50],
    paddingVertical: spacing.sm,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error[500],
  },
  recordingText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    color: colors.error[700],
  },
  // Member picker
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,18,22,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  pickerTitle: {
    fontSize: 20,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  pickerEmpty: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  pickerItemName: {
    fontSize: 16,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  pickerItemStatus: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
    textTransform: 'capitalize',
  },
  // Image preview
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '90%',
    height: '70%',
  },
  previewClose: {
    position: 'absolute',
    top: 60,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
