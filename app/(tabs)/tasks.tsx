import { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { useFamilyStore } from '@/lib/family-store';
import { supabase } from '@/lib/supabase';
import { colors, typography, radius, spacing, priorityColors, priorityLabels } from '@/lib/theme';
import { formatDueDate } from '@/lib/helpers';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ModalBase } from '@/components/ModalBase';
import { EmptyState, LoadingState } from '@/components/States';
import type { Task, Priority } from '@/lib/types';
import { notifyTaskAction } from '@/lib/sound-notifications';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Calendar,
  Flag,
  User as UserIcon,
  Users,
  CheckCircle2,
  PartyPopper,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

type TaskTab = 'shared' | 'personal';

export default function TasksScreen() {
  const { user, profile } = useAuthStore();
  const { family, members, subscribe } = useFamilyStore();
  const [tab, setTab] = useState<TaskTab>('shared');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [celebrating, setCelebrating] = useState<string | null>(null);

  // Track whether we've loaded data for each tab at least once
  const hasLoadedRef = useRef<Record<string, boolean>>({});

  // Add task form state
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Subscribe to family realtime
  useEffect(() => {
    if (family) subscribe(family.id);
  }, [family?.id]);

  // Load tasks
  const loadTasks = useCallback(async (background = false) => {
    if (!user) return;
    const cacheKey = `${tab}-${family?.id ?? 'personal'}`;
    // Only show loading spinner on the very first load for this tab
    const isFirstLoad = !hasLoadedRef.current[cacheKey];
    if (isFirstLoad && !background) setLoading(true);
    if (tab === 'shared') {
      if (!family) {
        setTasks([]);
        setLoading(false);
        hasLoadedRef.current[cacheKey] = true;
        return;
      }
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('family_id', family.id)
        .order('completed', { ascending: true })
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      setTasks((data as Task[]) ?? []);
    } else {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .is('family_id', null)
        .order('completed', { ascending: true })
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      setTasks((data as Task[]) ?? []);
    }
    hasLoadedRef.current[cacheKey] = true;
    setLoading(false);
  }, [tab, user, family]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Keep a stable ref to the latest loadTasks so the realtime channel
  // doesn't need to be recreated whenever the callback identity changes.
  const loadTasksRef = useRef(loadTasks);
  useEffect(() => {
    loadTasksRef.current = loadTasks;
  });

  // Realtime subscription
  useEffect(() => {
    if (!family && tab === 'shared') return;
    const channel = supabase
      .channel(`tasks-${tab}-${family?.id ?? 'personal'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        // Background refresh — no loading flash
        () => loadTasksRef.current(true)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tab, family?.id]);

  const toggleTask = async (task: Task) => {
    const newCompleted = !task.completed;
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : t
      )
    );
    await supabase
      .from('tasks')
      .update({
        completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
      })
      .eq('id', task.id);

    if (newCompleted) {
      setCelebrating(task.id);
      notifyTaskAction('completed', task.title, profile?.display_name);
      setTimeout(() => setCelebrating(null), 2000);
    }
  };

  const deleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await supabase.from('tasks').delete().eq('id', taskId);
  };

  const handleAddTask = async () => {
    setTaskError(null);
    if (!title.trim()) {
      setTaskError('Please enter a task title.');
      return;
    }
    if (!user) return;
    setSubmitting(true);
    const insertData: Record<string, unknown> = {
      user_id: user.id,
      title: title.trim(),
      priority,
      assignee_id: tab === 'shared' ? assigneeId : null,
      family_id: tab === 'shared' ? family?.id : null,
    };
    if (dueDate) {
      insertData.due_at = dueDate.toISOString();
    }
    const { error } = await supabase.from('tasks').insert(insertData);
    if (error) {
      setTaskError(error.message);
    } else {
      setShowAddModal(false);
      notifyTaskAction('created', title.trim(), profile?.display_name);
      setTitle('');
      setPriority('medium');
      setAssigneeId(null);
      setDueDate(null);
      setDateInput('');
      loadTasks();
    }
    setSubmitting(false);
  };

  const handleDateSubmit = () => {
    if (!dateInput.trim()) {
      setDueDate(null);
      setShowDatePicker(false);
      return;
    }
    const parsed = new Date(dateInput.trim());
    if (!isNaN(parsed.getTime())) {
      setDueDate(parsed);
    }
    setShowDatePicker(false);
  };

  const getMemberName = (id: string | null) => {
    if (!id) return 'All';
    const m = members.find((mem) => mem.id === id);
    return m?.display_name ?? 'Unknown';
  };

  const colorIndexFor = (id: string) => members.findIndex((m) => m.id === id);

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  const renderTask = ({ item }: { item: Task }) => {
    const pc = priorityColors[item.priority];
    const isCelebrating = celebrating === item.id;
    return (
      <View style={[styles.taskCard, item.completed && styles.taskCardCompleted]}>
        <TouchableOpacity
          onPress={() => toggleTask(item)}
          style={styles.checkboxWrap}
          hitSlop={8}
        >
          {item.completed ? (
            <CheckCircle2 size={28} color={colors.success[500]} strokeWidth={2} />
          ) : (
            <Square size={28} color={colors.neutral[300]} strokeWidth={2} />
          )}
        </TouchableOpacity>
        <View style={styles.taskBody}>
          <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.taskMeta}>
            <View style={[styles.priorityBadge, { backgroundColor: pc.bg, borderColor: pc.border }]}>
              <Flag size={11} color={pc.text} strokeWidth={2} />
              <Text style={[styles.priorityText, { color: pc.text }]}>{priorityLabels[item.priority]}</Text>
            </View>
            {item.due_at && (
              <View style={styles.metaItem}>
                <Calendar size={12} color={colors.neutral[500]} strokeWidth={2} />
                <Text style={styles.metaText}>{formatDueDate(item.due_at)}</Text>
              </View>
            )}
            {tab === 'shared' && (
              <View style={styles.metaItem}>
                {item.assignee_id ? (
                  <>
                    <Avatar name={getMemberName(item.assignee_id)} size={16} colorIndex={colorIndexFor(item.assignee_id)} />
                    <Text style={styles.metaText}>{getMemberName(item.assignee_id)}</Text>
                  </>
                ) : (
                  <>
                    <Users size={12} color={colors.neutral[500]} strokeWidth={2} />
                    <Text style={styles.metaText}>All</Text>
                  </>
                )}
              </View>
            )}
          </View>
          {isCelebrating && (
            <View style={styles.celebration}>
              <PartyPopper size={16} color={colors.success[600]} strokeWidth={2} />
              <Text style={styles.celebrationText}>Task complete! Great job!</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => deleteTask(item.id)} style={styles.deleteBtn} hitSlop={8}>
          <Trash2 size={18} color={colors.neutral[400]} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Tasks</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Plus size={24} color={colors.neutral[0]} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Progress Summary */}
      {totalCount > 0 && (
        <View style={styles.progressSummary}>
          <Text style={styles.progressText}>
            {completedCount} of {totalCount} completed
          </Text>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(completedCount / totalCount) * 100}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* Segmented Control */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'shared' && styles.tabActive]}
          onPress={() => setTab('shared')}
        >
          <Users size={16} color={tab === 'shared' ? colors.neutral[900] : colors.neutral[400]} strokeWidth={2} />
          <Text style={[styles.tabText, tab === 'shared' && styles.tabTextActive]}>Family Shared</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'personal' && styles.tabActive]}
          onPress={() => setTab('personal')}
        >
          <UserIcon size={16} color={tab === 'personal' ? colors.neutral[900] : colors.neutral[400]} strokeWidth={2} />
          <Text style={[styles.tabText, tab === 'personal' && styles.tabTextActive]}>Personal</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState label="Loading tasks..." />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={56} color={colors.neutral[300]} strokeWidth={1.5} />}
          title={tab === 'shared' ? 'No shared tasks yet' : 'No personal tasks yet'}
          subtitle="Tap the + button to add your first task."
        />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={renderTask}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Task Modal */}
      <ModalBase
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={tab === 'shared' ? 'New Shared Task' : 'New Personal Task'}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Task Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="What needs to be done?"
              placeholderTextColor={colors.neutral[400]}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {(['high', 'medium', 'low'] as Priority[]).map((p) => {
                const pc = priorityColors[p];
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityOption,
                      priority === p && { backgroundColor: pc.bg, borderColor: pc.border },
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Flag size={14} color={priority === p ? pc.text : colors.neutral[500]} strokeWidth={2} />
                    <Text
                      style={[
                        styles.priorityOptionText,
                        { color: priority === p ? pc.text : colors.neutral[500] },
                      ]}
                    >
                      {priorityLabels[p]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {tab === 'shared' && (
              <>
                <Text style={styles.fieldLabel}>Assign To</Text>
                <View style={styles.assigneeRow}>
                  <TouchableOpacity
                    style={[styles.assigneeChip, !assigneeId && styles.assigneeChipActive]}
                    onPress={() => setAssigneeId(null)}
                  >
                    <Users size={16} color={!assigneeId ? colors.primary[600] : colors.neutral[500]} strokeWidth={2} />
                    <Text style={[styles.assigneeText, !assigneeId && styles.assigneeTextActive]}>All</Text>
                  </TouchableOpacity>
                  {members
                    .filter((m) => m.id !== user?.id)
                    .map((m) => {
                      const idx = colorIndexFor(m.id);
                      const selected = assigneeId === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.assigneeChip, selected && styles.assigneeChipActive]}
                          onPress={() => setAssigneeId(m.id)}
                        >
                          <Avatar name={m.display_name} size={20} colorIndex={idx} />
                          <Text style={[styles.assigneeText, selected && styles.assigneeTextActive]} numberOfLines={1}>
                            {m.display_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>Due Date (optional)</Text>
            {dueDate ? (
              <View style={styles.dueDateRow}>
                <Text style={styles.dueDateText}>{formatDueDate(dueDate.toISOString())}</Text>
                <TouchableOpacity onPress={() => { setDueDate(null); setDateInput(''); }}>
                  <Text style={styles.clearDateText}>Clear</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.dateInputBtn} onPress={() => setShowDatePicker(true)}>
                <Calendar size={18} color={colors.neutral[400]} strokeWidth={2} />
                <Text style={styles.dateInputPlaceholder}>Tap to set date & time</Text>
              </TouchableOpacity>
            )}

            {showDatePicker && (
              <View style={styles.datePickerRow}>
                <TextInput
                  style={styles.dateTextInput}
                  placeholder="YYYY-MM-DD HH:MM"
                  placeholderTextColor={colors.neutral[400]}
                  value={dateInput}
                  onChangeText={setDateInput}
                  autoCapitalize="none"
                />
                <Button label="Set" onPress={handleDateSubmit} size="sm" />
              </View>
            )}

            {taskError && <Text style={styles.errorText}>{taskError}</Text>}

            <View style={styles.submitRow}>
              <Button
                label="Add Task"
                onPress={handleAddTask}
                loading={submitting}
                fullWidth
                size="lg"
                icon={<Plus size={20} color={colors.neutral[0]} strokeWidth={2} />}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ModalBase>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.sm,
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[900],
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  progressSummary: {
    marginBottom: spacing.md,
  },
  progressText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[600],
    marginBottom: spacing.xs,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: colors.neutral[200],
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.success[500],
    borderRadius: radius.full,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.neutral[100],
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.md,
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
    paddingBottom: spacing.xxl + 80,
  },
  taskCard: {
    flexDirection: 'row',
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  taskCardCompleted: {
    opacity: 0.7,
  },
  checkboxWrap: {
    paddingTop: 2,
    paddingRight: spacing.sm,
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[900],
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.neutral[400],
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 11,
    fontFamily: typography.fontFamilyBold,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[500],
  },
  celebration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  celebrationText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
    color: colors.success[600],
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  // Modal
  fieldLabel: {
    fontSize: 14,
    fontFamily: typography.fontFamilyBold,
    color: colors.neutral[700],
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[900],
  },
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  priorityOptionText: {
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
  },
  assigneeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
  },
  assigneeChipActive: {
    backgroundColor: colors.primary[50],
    borderWidth: 1.5,
    borderColor: colors.primary[300],
  },
  assigneeText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyMedium,
    color: colors.neutral[600],
    maxWidth: 80,
  },
  assigneeTextActive: {
    color: colors.primary[700],
    fontFamily: typography.fontFamilyBold,
  },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.primary[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary[50],
  },
  dueDateText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.primary[700],
  },
  clearDateText: {
    fontSize: 13,
    fontFamily: typography.fontFamilyBold,
    color: colors.error[500],
  },
  dateInputBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dateInputPlaceholder: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.neutral[400],
  },
  datePickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  dateTextInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.neutral[900],
  },
  errorText: {
    color: colors.error[600],
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  submitRow: {
    marginTop: spacing.lg,
    paddingBottom: spacing.md,
  },
});
