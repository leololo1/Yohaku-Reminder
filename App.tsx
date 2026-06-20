import 'expo-sqlite/localStorage/install';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

type ViewMode = 'list' | 'form';
type FormMode = 'add' | 'edit';
type NotificationOption = 'none' | 'atTime' | 'before5' | 'before10' | 'before30' | 'before60' | 'dayBefore';

type Reminder = {
  id: string;
  title: string;
  date: string;
  time: string;
  notification: NotificationOption;
  note?: string;
  completedAt?: string;
};

type ReminderDraft = {
  title: string;
  date: string;
  time: string;
  notification: NotificationOption;
  note: string;
};

type ReminderGroup = {
  key: string;
  title: string;
  reminders: Reminder[];
  completed?: boolean;
};

const pickerColumnHeight = 224;
const pickerItemHeight = 38;
const reminderStorageKey = 'yohaku-reminder-items';
const millisecondsPerDay = 24 * 60 * 60 * 1000;

const notificationOptions: { value: NotificationOption; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'atTime', label: '時刻' },
  { value: 'before5', label: '5分前' },
  { value: 'before10', label: '10分前' },
  { value: 'before30', label: '30分前' },
  { value: 'before60', label: '1時間前' },
  { value: 'dayBefore', label: '前日' },
];

const pad = (value: number) => value.toString().padStart(2, '0');

const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatFullDate = (dateKey: string) => {
  const date = parseDateKey(dateKey);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
};

const formatShortDate = (dateKey: string) => {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}.${date.getDate()}`;
};

const formatRelativeDate = (dateKey: string) => {
  const date = startOfDay(parseDateKey(dateKey));
  const today = startOfDay(new Date());
  const difference = Math.round((date.getTime() - today.getTime()) / millisecondsPerDay);

  if (difference === 0) {
    return '今日';
  }

  if (difference === 1) {
    return '明日';
  }

  if (difference === -1) {
    return '昨日';
  }

  return formatShortDate(dateKey);
};

const isDateKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const date = parseDateKey(dateKey);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === dateKey;
};

const parseValidDateKey = (dateKey: string, fallback: Date) => (isDateKey(dateKey) ? parseDateKey(dateKey) : fallback);

const minutesFromTime = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }

  return hour * 60 + minute;
};

const isTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

const nearestMinuteStep = (minute: number) => Math.min(50, Math.max(0, Math.round(minute / 10) * 10));

const notificationLabel = (value: NotificationOption) =>
  notificationOptions.find((option) => option.value === value)?.label ?? 'なし';

const sortReminders = (items: Reminder[]) =>
  [...items].sort((first, second) => {
    const firstCompleted = Boolean(first.completedAt);
    const secondCompleted = Boolean(second.completedAt);

    if (firstCompleted !== secondCompleted) {
      return firstCompleted ? 1 : -1;
    }

    if (firstCompleted && secondCompleted) {
      return (second.completedAt ?? '').localeCompare(first.completedAt ?? '');
    }

    const dateComparison = first.date.localeCompare(second.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return minutesFromTime(first.time) - minutesFromTime(second.time);
  });

const createInitialReminders = (): Reminder[] => {
  const today = new Date();
  const tomorrow = addDays(today, 1);

  return [
    {
      id: 'water-plants',
      title: '植物に水をやる',
      date: toDateKey(today),
      time: '09:00',
      notification: 'atTime',
    },
    {
      id: 'return-book',
      title: '本を返す',
      date: toDateKey(today),
      time: '17:30',
      notification: 'before30',
      note: '駅前の返却ポスト',
    },
    {
      id: 'write-note',
      title: '短いメモを書く',
      date: toDateKey(tomorrow),
      time: '20:00',
      notification: 'before10',
    },
  ];
};

const emptyDraft = (): ReminderDraft => ({
  title: '',
  date: toDateKey(new Date()),
  time: '09:00',
  notification: 'atTime',
  note: '',
});

const draftFromReminder = (reminder: Reminder): ReminderDraft => ({
  title: reminder.title,
  date: reminder.date,
  time: reminder.time,
  notification: reminder.notification,
  note: reminder.note ?? '',
});

const groupReminders = (items: Reminder[]): ReminderGroup[] => {
  const openReminders = items.filter((reminder) => !reminder.completedAt);
  const completedReminders = items.filter((reminder) => reminder.completedAt);
  const openGroups = new Map<string, Reminder[]>();

  openReminders.forEach((reminder) => {
    openGroups.set(reminder.date, [...(openGroups.get(reminder.date) ?? []), reminder]);
  });

  const groups: ReminderGroup[] = Array.from(openGroups.entries())
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, reminders]) => ({
      key: date,
      title: formatRelativeDate(date),
      reminders: reminders.sort((first, second) => minutesFromTime(first.time) - minutesFromTime(second.time)),
    }));

  if (completedReminders.length > 0) {
    groups.push({
      key: 'completed',
      title: '完了',
      reminders: completedReminders,
      completed: true,
    });
  }

  return groups;
};

export default function App() {
  const [mode, setMode] = useState<ViewMode>('list');
  const [formMode, setFormMode] = useState<FormMode>('add');
  const [reminders, setReminders] = useState<Reminder[]>(createInitialReminders);
  const [selectedReminderId, setSelectedReminderId] = useState('');
  const [draft, setDraft] = useState<ReminderDraft>(emptyDraft);
  const [storageReady, setStorageReady] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [notificationPickerVisible, setNotificationPickerVisible] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < 380;

  useEffect(() => {
    const savedReminders = localStorage.getItem(reminderStorageKey);

    if (savedReminders) {
      try {
        const parsedReminders = JSON.parse(savedReminders) as Reminder[];
        if (Array.isArray(parsedReminders)) {
          setReminders(sortReminders(parsedReminders));
        }
      } catch {
        localStorage.removeItem(reminderStorageKey);
      }
    }

    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    localStorage.setItem(reminderStorageKey, JSON.stringify(reminders));
  }, [reminders, storageReady]);

  const groups = useMemo(() => groupReminders(sortReminders(reminders)), [reminders]);
  const openReminderCount = useMemo(() => reminders.filter((reminder) => !reminder.completedAt).length, [reminders]);

  const openAddForm = () => {
    setFormMode('add');
    setSelectedReminderId('');
    setDraft(emptyDraft());
    setMode('form');
  };

  const openEditForm = (reminder: Reminder) => {
    setFormMode('edit');
    setSelectedReminderId(reminder.id);
    setDraft(draftFromReminder(reminder));
    setMode('form');
  };

  const back = () => {
    setMode('list');
  };

  const saveReminder = () => {
    const title = draft.title.trim();
    const note = draft.note.trim();

    if (!title) {
      Alert.alert('タイトルを入力してください');
      return;
    }

    if (!isDateKey(draft.date)) {
      Alert.alert('日付を選んでください');
      return;
    }

    if (!isTime(draft.time)) {
      Alert.alert('時刻を選んでください');
      return;
    }

    const savedReminder: Reminder = {
      id: formMode === 'add' ? `reminder-${Date.now()}` : selectedReminderId,
      title,
      date: draft.date,
      time: draft.time,
      notification: draft.notification,
      note: note || undefined,
      completedAt: reminders.find((reminder) => reminder.id === selectedReminderId)?.completedAt,
    };

    setReminders((current) => {
      if (formMode === 'add') {
        return sortReminders([...current, savedReminder]);
      }

      return sortReminders(current.map((reminder) => (reminder.id === selectedReminderId ? savedReminder : reminder)));
    });
    setSelectedReminderId(savedReminder.id);
    setMode('list');
  };

  const toggleReminder = (id: string) => {
    setReminders((current) =>
      sortReminders(
        current.map((reminder) =>
          reminder.id === id
            ? {
                ...reminder,
                completedAt: reminder.completedAt ? undefined : new Date().toISOString(),
              }
            : reminder,
        ),
      ),
    );
  };

  const deleteReminder = () => {
    if (formMode !== 'edit') {
      return;
    }

    Alert.alert('削除しますか', 'このリマインダーを消します。', [
      { text: '戻る', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          setReminders((current) => current.filter((reminder) => reminder.id !== selectedReminderId));
          setMode('list');
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.page, compact && styles.pageCompact]}>
        <Header
          title={mode === 'list' ? 'Yohaku Reminder' : formMode === 'add' ? '新しいリマインダー' : '編集'}
          canGoBack={mode === 'form'}
          showSaveAction={mode === 'form'}
          onBack={back}
          onSave={saveReminder}
        />

        <FadeOnChange watchKey={`${mode}-${formMode}-${selectedReminderId}`} style={styles.screenLayer}>
          {mode === 'list' ? (
            <ReminderList
              groups={groups}
              openReminderCount={openReminderCount}
              onOpenReminder={openEditForm}
              onToggleReminder={toggleReminder}
            />
          ) : (
            <ReminderForm
              draft={draft}
              formMode={formMode}
              onChange={setDraft}
              onOpenDatePicker={() => setDatePickerVisible(true)}
              onOpenTimePicker={() => setTimePickerVisible(true)}
              onOpenNotificationPicker={() => setNotificationPickerVisible(true)}
              onDelete={deleteReminder}
            />
          )}
        </FadeOnChange>

        {mode === 'list' && (
          <Pressable accessibilityRole="button" onPress={openAddForm} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <PlusIcon />
          </Pressable>
        )}

        <DatePicker
          visible={datePickerVisible}
          value={parseValidDateKey(draft.date, new Date())}
          onClose={() => setDatePickerVisible(false)}
          onSelect={(date) => {
            setDraft((current) => ({ ...current, date: toDateKey(date) }));
            setDatePickerVisible(false);
          }}
        />

        <TimePicker
          visible={timePickerVisible}
          value={draft.time}
          onClose={() => setTimePickerVisible(false)}
          onSelect={(time) => {
            setDraft((current) => ({ ...current, time }));
            setTimePickerVisible(false);
          }}
        />

        <NotificationPicker
          visible={notificationPickerVisible}
          value={draft.notification}
          onClose={() => setNotificationPickerVisible(false)}
          onSelect={(notification) => {
            setDraft((current) => ({ ...current, notification }));
            setNotificationPickerVisible(false);
          }}
        />
      </View>
    </View>
  );
}

function Header({
  title,
  canGoBack,
  showSaveAction,
  onBack,
  onSave,
}: {
  title: string;
  canGoBack: boolean;
  showSaveAction: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.header}>
      {canGoBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={18} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
          <BackIcon />
        </Pressable>
      ) : (
        <View style={styles.headerSide} />
      )}

      <Text style={styles.headerTitle}>{title}</Text>

      {showSaveAction ? (
        <Pressable accessibilityRole="button" onPress={onSave} hitSlop={18} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
          <CheckIcon />
        </Pressable>
      ) : (
        <View style={styles.headerSide} />
      )}
    </View>
  );
}

function ReminderList({
  groups,
  openReminderCount,
  onOpenReminder,
  onToggleReminder,
}: {
  groups: ReminderGroup[];
  openReminderCount: number;
  onOpenReminder: (reminder: Reminder) => void;
  onToggleReminder: (id: string) => void;
}) {
  return (
    <ScrollView style={styles.listScreen} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {groups.length === 0 || openReminderCount === 0 ? (
        <Text style={styles.emptyText}>静かです</Text>
      ) : null}

      {groups.map((group) => (
        <View key={group.key} style={styles.reminderGroup}>
          <Text style={[styles.groupTitle, group.completed && styles.groupTitleCompleted]}>{group.title}</Text>
          <View style={styles.reminderRows}>
            {group.reminders.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                completedGroup={Boolean(group.completed)}
                onPress={() => onOpenReminder(reminder)}
                onToggle={() => onToggleReminder(reminder.id)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ReminderRow({
  reminder,
  completedGroup,
  onPress,
  onToggle,
}: {
  reminder: Reminder;
  completedGroup: boolean;
  onPress: () => void;
  onToggle: () => void;
}) {
  const completed = Boolean(reminder.completedAt);
  const sideLabel = completedGroup ? formatShortDate(reminder.date) : reminder.time;
  const detail = completedGroup ? reminder.time : notificationLabel(reminder.notification);

  return (
    <View style={[styles.reminderRow, completed && styles.reminderRowCompleted]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: completed }} onPress={onToggle} hitSlop={12} style={({ pressed }) => [styles.completionButton, pressed && styles.pressed]}>
        <CompletionMark completed={completed} />
      </Pressable>

      <Pressable onPress={onPress} style={({ pressed }) => [styles.reminderBody, pressed && styles.pressed]}>
        <View style={styles.reminderSide}>
          <Text style={[styles.reminderTime, completed && styles.completedText]}>{sideLabel}</Text>
          <Text style={[styles.reminderNotification, completed && styles.completedText]}>{detail}</Text>
        </View>

        <View style={styles.reminderMain}>
          <Text style={[styles.reminderTitle, completed && styles.reminderTitleCompleted]} numberOfLines={2}>
            {reminder.title}
          </Text>
          {reminder.note ? (
            <Text style={[styles.reminderNote, completed && styles.completedText]} numberOfLines={1}>
              {reminder.note}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function ReminderForm({
  draft,
  formMode,
  onChange,
  onOpenDatePicker,
  onOpenTimePicker,
  onOpenNotificationPicker,
  onDelete,
}: {
  draft: ReminderDraft;
  formMode: FormMode;
  onChange: (draft: ReminderDraft) => void;
  onOpenDatePicker: () => void;
  onOpenTimePicker: () => void;
  onOpenNotificationPicker: () => void;
  onDelete: () => void;
}) {
  const updateText = (key: 'title' | 'note', value: string) => onChange({ ...draft, [key]: value });

  return (
    <KeyboardAvoidingView style={styles.formScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FormField label="タイトル" value={draft.title} onChangeText={(value) => updateText('title', value)} autoFocus />
        <DateFormField label="日付" value={formatFullDate(draft.date)} onPress={onOpenDatePicker} />
        <DateFormField label="時刻" value={draft.time} onPress={onOpenTimePicker} />
        <DateFormField label="通知" value={notificationLabel(draft.notification)} onPress={onOpenNotificationPicker} />
        <FormField label="メモ" value={draft.note} onChangeText={(value) => updateText('note', value)} multiline />

        {formMode === 'edit' ? (
          <Pressable onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
            <Text style={styles.deleteButtonText}>削除</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  autoFocus,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={tokens.disabledText}
        style={[styles.formInput, multiline && styles.formInputMultiline]}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function DateFormField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.formField, pressed && styles.pressed]}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.formValueRow}>
        <Text style={styles.formValueText}>{value}</Text>
        <DownChevron />
      </View>
    </Pressable>
  );
}

function DatePicker({
  visible,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onSelect: (date: Date) => void;
}) {
  const [year, setYear] = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());
  const [day, setDay] = useState(value.getDate());
  const yearScrollRef = useRef<ScrollView | null>(null);
  const monthScrollRef = useRef<ScrollView | null>(null);
  const dayScrollRef = useRef<ScrollView | null>(null);
  const yearScrollY = useRef(new Animated.Value(0)).current;
  const monthScrollY = useRef(new Animated.Value(0)).current;
  const dayScrollY = useRef(new Animated.Value(0)).current;
  const firstYear = value.getFullYear() - 20;
  const years = useMemo(() => Array.from({ length: 61 }, (_, index) => firstYear + index), [firstYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => index), []);
  const days = useMemo(() => Array.from({ length: daysInMonth(new Date(year, month, 1)) }, (_, index) => index + 1), [month, year]);
  const clampIndex = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));
  const scrollToSelected = (animated: boolean) => {
    const yearOffset = (value.getFullYear() - firstYear) * pickerItemHeight;
    const monthOffset = value.getMonth() * pickerItemHeight;
    const dayOffset = (value.getDate() - 1) * pickerItemHeight;
    yearScrollY.setValue(yearOffset);
    monthScrollY.setValue(monthOffset);
    dayScrollY.setValue(dayOffset);
    yearScrollRef.current?.scrollTo({ y: yearOffset, animated });
    monthScrollRef.current?.scrollTo({ y: monthOffset, animated });
    dayScrollRef.current?.scrollTo({ y: dayOffset, animated });
  };
  const updateYearFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = clampIndex(Math.round(event.nativeEvent.contentOffset.y / pickerItemHeight), years.length);
    setYear(years[index]);
  };
  const updateMonthFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = clampIndex(Math.round(event.nativeEvent.contentOffset.y / pickerItemHeight), months.length);
    setMonth(months[index]);
  };
  const updateDayFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = clampIndex(Math.round(event.nativeEvent.contentOffset.y / pickerItemHeight), days.length);
    setDay(days[index]);
  };

  useEffect(() => {
    const maxDay = days[days.length - 1] ?? 1;
    if (day <= maxDay) {
      return;
    }

    setDay(maxDay);
    const dayOffset = (maxDay - 1) * pickerItemHeight;
    dayScrollY.setValue(dayOffset);
    dayScrollRef.current?.scrollTo({ y: dayOffset, animated: true });
  }, [day, dayScrollY, days]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setYear(value.getFullYear());
    setMonth(value.getMonth());
    setDay(value.getDate());
    requestAnimationFrame(() => scrollToSelected(false));
  }, [firstYear, value, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <Pressable style={styles.pickerBackdropPress} onPress={onClose} />
        <View style={styles.pickerSheet}>
          <PickerHeader title="日付" onClose={onClose} onDone={() => onSelect(new Date(year, month, Math.min(day, daysInMonth(new Date(year, month, 1)))))} />

          <View style={styles.datePickerColumns}>
            <PickerColumn
              items={years}
              scrollRef={yearScrollRef}
              scrollY={yearScrollY}
              visible={visible}
              onScrollEnd={updateYearFromScroll}
              onLayout={() => requestAnimationFrame(() => scrollToSelected(false))}
              renderItem={(item) => `${item}年`}
            />
            <PickerColumn
              items={months}
              scrollRef={monthScrollRef}
              scrollY={monthScrollY}
              visible={visible}
              onScrollEnd={updateMonthFromScroll}
              onLayout={() => requestAnimationFrame(() => scrollToSelected(false))}
              renderItem={(item) => `${item + 1}月`}
            />
            <PickerColumn
              items={days}
              scrollRef={dayScrollRef}
              scrollY={dayScrollY}
              visible={visible}
              onScrollEnd={updateDayFromScroll}
              onLayout={() => requestAnimationFrame(() => scrollToSelected(false))}
              renderItem={(item) => `${item}日`}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TimePicker({
  visible,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (time: string) => void;
}) {
  const [hour, setHour] = useState(Math.floor(minutesFromTime(value) / 60));
  const [minute, setMinute] = useState(minutesFromTime(value) % 60);
  const hourScrollRef = useRef<ScrollView | null>(null);
  const minuteScrollRef = useRef<ScrollView | null>(null);
  const hourScrollY = useRef(new Animated.Value(0)).current;
  const minuteScrollY = useRef(new Animated.Value(0)).current;
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minutes = useMemo(() => Array.from({ length: 6 }, (_, index) => index * 10), []);
  const clampIndex = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));
  const scrollToSelected = (animated: boolean) => {
    const valueMinutes = minutesFromTime(value);
    const hourOffset = Math.floor(valueMinutes / 60) * pickerItemHeight;
    const minuteOffset = (nearestMinuteStep(valueMinutes % 60) / 10) * pickerItemHeight;
    hourScrollY.setValue(hourOffset);
    minuteScrollY.setValue(minuteOffset);
    hourScrollRef.current?.scrollTo({ y: hourOffset, animated });
    minuteScrollRef.current?.scrollTo({ y: minuteOffset, animated });
  };
  const updateHourFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = clampIndex(Math.round(event.nativeEvent.contentOffset.y / pickerItemHeight), hours.length);
    setHour(hours[index]);
  };
  const updateMinuteFromScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = clampIndex(Math.round(event.nativeEvent.contentOffset.y / pickerItemHeight), minutes.length);
    setMinute(minutes[index]);
  };

  useEffect(() => {
    if (!visible) {
      return;
    }

    const valueMinutes = minutesFromTime(value);
    setHour(Math.floor(valueMinutes / 60));
    setMinute(nearestMinuteStep(valueMinutes % 60));
    requestAnimationFrame(() => scrollToSelected(false));
  }, [value, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <Pressable style={styles.pickerBackdropPress} onPress={onClose} />
        <View style={styles.pickerSheet}>
          <PickerHeader title="時刻" onClose={onClose} onDone={() => onSelect(`${pad(hour)}:${pad(minute)}`)} />

          <View style={styles.pickerColumns}>
            <PickerColumn
              items={hours}
              scrollRef={hourScrollRef}
              scrollY={hourScrollY}
              visible={visible}
              onScrollEnd={updateHourFromScroll}
              onLayout={() => requestAnimationFrame(() => scrollToSelected(false))}
              renderItem={(item) => `${item}時`}
            />
            <PickerColumn
              items={minutes}
              scrollRef={minuteScrollRef}
              scrollY={minuteScrollY}
              visible={visible}
              onScrollEnd={updateMinuteFromScroll}
              onLayout={() => requestAnimationFrame(() => scrollToSelected(false))}
              renderItem={(item) => `${pad(item)}分`}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NotificationPicker({
  visible,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  value: NotificationOption;
  onClose: () => void;
  onSelect: (notification: NotificationOption) => void;
}) {
  const [selectedValue, setSelectedValue] = useState<NotificationOption>(value);

  useEffect(() => {
    if (visible) {
      setSelectedValue(value);
    }
  }, [value, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <Pressable style={styles.pickerBackdropPress} onPress={onClose} />
        <View style={styles.notificationSheet}>
          <PickerHeader title="通知" onClose={onClose} onDone={() => onSelect(selectedValue)} />

          <View style={styles.notificationOptions}>
            {notificationOptions.map((option) => {
              const selected = selectedValue === option.value;

              return (
                <Pressable key={option.value} onPress={() => setSelectedValue(option.value)} style={({ pressed }) => [styles.notificationOption, pressed && styles.pressed]}>
                  <View style={styles.notificationCheck}>{selected ? <CheckIcon small /> : null}</View>
                  <Text style={styles.notificationOptionText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PickerHeader({ title, onClose, onDone }: { title: string; onClose: () => void; onDone: () => void }) {
  return (
    <View style={styles.pickerHeader}>
      <Pressable accessibilityRole="button" onPress={onClose} hitSlop={14} style={({ pressed }) => [styles.pickerIconButton, pressed && styles.pressed]}>
        <CloseIcon />
      </Pressable>
      <Text style={styles.pickerTitle}>{title}</Text>
      <Pressable accessibilityRole="button" onPress={onDone} hitSlop={14} style={({ pressed }) => [styles.pickerIconButton, pressed && styles.pressed]}>
        <CheckIcon />
      </Pressable>
    </View>
  );
}

function PickerColumn<T extends string | number>({
  items,
  scrollRef,
  scrollY,
  visible,
  onScrollEnd,
  onLayout,
  renderItem,
}: {
  items: T[];
  scrollRef: React.MutableRefObject<ScrollView | null>;
  scrollY: Animated.Value;
  visible: boolean;
  onScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: () => void;
  renderItem: (item: T) => string;
}) {
  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={styles.pickerColumn}
      contentContainerStyle={styles.pickerColumnContent}
      showsVerticalScrollIndicator={false}
      snapToInterval={pickerItemHeight}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      onMomentumScrollEnd={onScrollEnd}
      onScrollEndDrag={onScrollEnd}
      onLayout={() => visible && onLayout()}
    >
      {items.map((item, index) => (
        <View key={String(item)} style={styles.pickerItem}>
          <PickerItemText scrollY={scrollY} index={index}>
            {renderItem(item)}
          </PickerItemText>
        </View>
      ))}
    </Animated.ScrollView>
  );
}

function PickerItemText({ scrollY, index, children }: { scrollY: Animated.Value; index: number; children: ReactNode }) {
  const itemOffset = index * pickerItemHeight;
  const scale = scrollY.interpolate({
    inputRange: [itemOffset - pickerItemHeight, itemOffset, itemOffset + pickerItemHeight],
    outputRange: [1, 1.12, 1],
    extrapolate: 'clamp',
  });
  const opacity = scrollY.interpolate({
    inputRange: [itemOffset - pickerItemHeight * 2, itemOffset, itemOffset + pickerItemHeight * 2],
    outputRange: [0.28, 1, 0.28],
    extrapolate: 'clamp',
  });

  return <Animated.Text style={[styles.pickerItemText, { opacity, transform: [{ scale }] }]}>{children}</Animated.Text>;
}

function FadeOnChange({ watchKey, style, children }: { watchKey: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const previousWatchKey = useRef(watchKey);

  useEffect(() => {
    if (previousWatchKey.current === watchKey) {
      return;
    }

    previousWatchKey.current = watchKey;
    opacity.stopAnimation();
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 170,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [opacity, watchKey]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

function CompletionMark({ completed }: { completed: boolean }) {
  return <View style={[styles.completionMark, completed && styles.completionMarkDone]}>{completed ? <CheckIcon small /> : null}</View>;
}

function PlusIcon() {
  return (
    <View style={styles.plusIcon}>
      <View style={styles.plusHorizontal} />
      <View style={styles.plusVertical} />
    </View>
  );
}

function CloseIcon() {
  return (
    <View style={styles.closeIcon}>
      <View style={styles.closeLineOne} />
      <View style={styles.closeLineTwo} />
    </View>
  );
}

function CheckIcon({ small }: { small?: boolean }) {
  return (
    <View style={[styles.checkIcon, small && styles.checkIconSmall]}>
      <View style={[styles.checkShort, small && styles.checkShortSmall]} />
      <View style={[styles.checkLong, small && styles.checkLongSmall]} />
    </View>
  );
}

function BackIcon() {
  return (
    <View style={styles.backIcon}>
      <View style={styles.backLineTop} />
      <View style={styles.backLineBottom} />
    </View>
  );
}

function DownChevron() {
  return (
    <View style={styles.downChevronIcon}>
      <View style={styles.downChevronLineLeft} />
      <View style={styles.downChevronLineRight} />
    </View>
  );
}

const tokens = {
  background: '#FAFAF8',
  surface: '#FFFFFF',
  subtleSurface: '#F7F7F5',
  text: '#222222',
  secondaryText: '#777777',
  tertiaryText: '#AAAAAA',
  disabledText: '#CFCFCB',
  hairline: '#EEEEEA',
  divider: '#E6E6E2',
  selected: '#EFEFED',
  dot: '#8E8E89',
  destructive: '#B85C5C',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.background,
  },
  page: {
    flex: 1,
    backgroundColor: tokens.surface,
    paddingTop: 66,
  },
  pageCompact: {
    paddingTop: 56,
  },
  screenLayer: {
    flex: 1,
  },
  header: {
    height: 58,
    paddingHorizontal: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSide: {
    width: 42,
  },
  headerTitle: {
    color: tokens.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
    textAlign: 'center',
  },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listScreen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 30,
    paddingTop: 32,
    paddingBottom: 104,
  },
  reminderGroup: {
    marginBottom: 38,
  },
  groupTitle: {
    color: tokens.secondaryText,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
    marginBottom: 12,
  },
  groupTitleCompleted: {
    color: tokens.tertiaryText,
  },
  reminderRows: {
    borderTopWidth: 1,
    borderTopColor: tokens.hairline,
  },
  reminderRow: {
    minHeight: 76,
    borderBottomWidth: 1,
    borderBottomColor: tokens.hairline,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderRowCompleted: {
    opacity: 0.68,
  },
  completionButton: {
    width: 42,
    height: 56,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  completionMark: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.divider,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.surface,
  },
  completionMarkDone: {
    backgroundColor: tokens.selected,
    borderColor: tokens.selected,
  },
  reminderBody: {
    flex: 1,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 14,
  },
  reminderSide: {
    width: 56,
    gap: 4,
  },
  reminderTime: {
    color: tokens.secondaryText,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  reminderNotification: {
    color: tokens.tertiaryText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  reminderMain: {
    flex: 1,
    gap: 5,
  },
  reminderTitle: {
    color: tokens.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  reminderTitleCompleted: {
    color: tokens.tertiaryText,
    textDecorationLine: 'line-through',
  },
  reminderNote: {
    color: tokens.secondaryText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  completedText: {
    color: tokens.tertiaryText,
  },
  emptyText: {
    color: tokens.tertiaryText,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '400',
    paddingTop: 18,
    marginBottom: 32,
  },
  addButton: {
    position: 'absolute',
    right: 28,
    bottom: 34,
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: tokens.surface,
    borderColor: tokens.hairline,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  formScreen: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: 32,
    paddingTop: 34,
    paddingBottom: 70,
    gap: 20,
  },
  formField: {
    gap: 8,
  },
  formLabel: {
    color: tokens.tertiaryText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  formInput: {
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: tokens.hairline,
    color: tokens.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  formInputMultiline: {
    minHeight: 96,
    lineHeight: 22,
  },
  formValueRow: {
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: tokens.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  formValueText: {
    color: tokens.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 30,
    paddingVertical: 10,
  },
  deleteButtonText: {
    color: tokens.destructive,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(250, 250, 248, 0.72)',
    justifyContent: 'flex-end',
  },
  pickerBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerSheet: {
    backgroundColor: tokens.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: tokens.hairline,
    borderWidth: 1,
    paddingBottom: 34,
  },
  notificationSheet: {
    backgroundColor: tokens.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: tokens.hairline,
    borderWidth: 1,
    paddingBottom: 28,
  },
  pickerHeader: {
    height: 54,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomColor: tokens.hairline,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    color: tokens.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
  },
  pickerIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerColumns: {
    height: pickerColumnHeight,
    flexDirection: 'row',
    paddingHorizontal: 58,
    paddingTop: 16,
    gap: 34,
  },
  datePickerColumns: {
    height: pickerColumnHeight,
    flexDirection: 'row',
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: 16,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerColumnContent: {
    paddingVertical: (pickerColumnHeight - pickerItemHeight) / 2,
  },
  pickerItem: {
    height: pickerItemHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemText: {
    color: tokens.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  notificationOptions: {
    paddingHorizontal: 30,
    paddingTop: 10,
  },
  notificationOption: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  notificationCheck: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationOptionText: {
    color: tokens.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
  },
  plusIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusHorizontal: {
    position: 'absolute',
    width: 20,
    height: 1.4,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
  },
  plusVertical: {
    position: 'absolute',
    width: 1.4,
    height: 20,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
  },
  closeIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLineOne: {
    position: 'absolute',
    width: 19,
    height: 1.3,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '45deg' }],
  },
  closeLineTwo: {
    position: 'absolute',
    width: 19,
    height: 1.3,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '-45deg' }],
  },
  checkIcon: {
    width: 22,
    height: 22,
  },
  checkIconSmall: {
    width: 14,
    height: 14,
  },
  checkShort: {
    position: 'absolute',
    left: 4,
    top: 11,
    width: 7,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '45deg' }],
  },
  checkShortSmall: {
    left: 2,
    top: 7,
    width: 5,
    height: 1.2,
  },
  checkLong: {
    position: 'absolute',
    left: 9,
    top: 9,
    width: 12,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '-45deg' }],
  },
  checkLongSmall: {
    left: 5,
    top: 6,
    width: 8,
    height: 1.2,
  },
  backIcon: {
    width: 22,
    height: 22,
    position: 'relative',
  },
  backLineTop: {
    position: 'absolute',
    left: 5,
    top: 6,
    width: 12,
    height: 1.4,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '-45deg' }],
  },
  backLineBottom: {
    position: 'absolute',
    left: 5,
    top: 14,
    width: 12,
    height: 1.4,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '45deg' }],
  },
  downChevronIcon: {
    width: 12,
    height: 24,
    position: 'relative',
    marginTop: 3,
  },
  downChevronLineLeft: {
    position: 'absolute',
    left: 2,
    top: 10,
    width: 6,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '45deg' }],
  },
  downChevronLineRight: {
    position: 'absolute',
    right: 1.5,
    top: 10,
    width: 6,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: tokens.secondaryText,
    transform: [{ rotate: '-45deg' }],
  },
  pressed: {
    opacity: 0.58,
  },
});
