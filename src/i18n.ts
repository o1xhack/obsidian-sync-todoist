import { UiLanguage } from './types';

export type I18nKey =
  | 'tab.general'
  | 'tab.daily'
  | 'general.language.name'
  | 'general.language.desc'
  | 'general.language.en'
  | 'general.language.zh'
  | 'general.apiToken.name'
  | 'general.apiToken.desc'
  | 'general.apiToken.placeholder'
  | 'general.apiToken.verify'
  | 'general.apiToken.verifying'
  | 'general.apiToken.valid'
  | 'general.apiToken.invalid'
  | 'general.apiToken.failed'
  | 'general.syncTag.name'
  | 'general.syncTag.desc'
  | 'general.defaultProject.name'
  | 'general.defaultProject.desc'
  | 'general.defaultProject.inbox'
  | 'general.defaultProject.placeholder'
  | 'general.syncInterval.name'
  | 'general.syncInterval.desc'
  | 'general.conflict.name'
  | 'general.conflict.desc'
  | 'general.conflict.todoist'
  | 'general.conflict.local'
  | 'general.conflict.ask'
  | 'general.notifications'
  | 'general.notifications.manual.name'
  | 'general.notifications.manual.desc'
  | 'general.notifications.auto.name'
  | 'general.notifications.auto.desc'
  | 'general.manualActions'
  | 'general.syncNow.name'
  | 'general.syncNow.desc'
  | 'general.syncNow.button'
  | 'general.syncNow.syncing'
  | 'general.syncNow.noToken'
  | 'general.syncNow.failed'
  | 'general.status'
  | 'general.status.synced'
  | 'general.status.last'
  | 'general.status.never'
  | 'general.status.api'
  | 'general.status.connected'
  | 'general.status.disconnected'
  | 'daily.enable.name'
  | 'daily.enable.desc'
  | 'daily.markerStart.name'
  | 'daily.markerStart.desc'
  | 'daily.markerEnd.name'
  | 'daily.markerEnd.desc'
  | 'daily.warning'
  | 'daily.sort.name'
  | 'daily.sort.desc'
  | 'daily.sort.time'
  | 'daily.sort.priority'
  | 'daily.includeCompleted.name'
  | 'daily.includeCompleted.desc'
  | 'daily.includeCompletedRecurring.name'
  | 'daily.includeCompletedRecurring.desc'
  | 'daily.syncNow.name'
  | 'daily.syncNow.desc'
  | 'daily.syncNow.button'
  | 'daily.syncNow.result'
  | 'daily.filters'
  | 'daily.filters.desc'
  | 'daily.filters.verifyFirst'
  | 'daily.projects'
  | 'daily.projects.all'
  | 'daily.projects.inbox'
  | 'daily.labels'
  | 'daily.labels.all'
  | 'daily.labels.shared'
  | 'daily.priority'
  | 'daily.priority.all'
  | 'priority.urgent'
  | 'priority.high'
  | 'priority.medium'
  | 'priority.normal';

const STRINGS: Record<UiLanguage, Record<I18nKey, string>> = {
  en: {
    'tab.general': 'General',
    'tab.daily': 'Daily Note',
    'general.language.name': 'Interface language',
    'general.language.desc': 'Language used by Sync Todoist settings.',
    'general.language.en': 'English',
    'general.language.zh': 'Simplified Chinese',
    'general.apiToken.name': 'Todoist API token',
    'general.apiToken.desc': 'Your Todoist API token. Find it in Todoist settings -> integrations -> developer.',
    'general.apiToken.placeholder': 'Enter your API token',
    'general.apiToken.verify': 'Verify',
    'general.apiToken.verifying': 'Verifying...',
    'general.apiToken.valid': 'API token is valid.',
    'general.apiToken.invalid': 'API token is invalid. Please check and try again.',
    'general.apiToken.failed': 'Failed to verify token. Please check your internet connection.',
    'general.syncTag.name': 'Sync tag',
    'general.syncTag.desc': 'Tag used to identify tasks for syncing. Include the # symbol.',
    'general.defaultProject.name': 'Default project',
    'general.defaultProject.desc': 'Default Todoist project for new tasks. Leave empty to use Inbox.',
    'general.defaultProject.inbox': 'Inbox (default)',
    'general.defaultProject.placeholder': 'Verify API token to load projects',
    'general.syncInterval.name': 'Sync interval',
    'general.syncInterval.desc': 'How often to sync with Todoist, in minutes. Set to 0 to disable automatic sync.',
    'general.conflict.name': 'Conflict resolution',
    'general.conflict.desc': 'How to handle conflicts when both sides have changes.',
    'general.conflict.todoist': 'Todoist wins',
    'general.conflict.local': 'Local wins',
    'general.conflict.ask': 'Ask me each time',
    'general.notifications': 'Notifications',
    'general.notifications.manual.name': 'Manual sync notices',
    'general.notifications.manual.desc': 'Show a short completion notice after manual sync actions.',
    'general.notifications.auto.name': 'Automatic sync notices',
    'general.notifications.auto.desc': 'Show scheduled sync notices on desktop and mobile. Errors are always shown.',
    'general.manualActions': 'Manual actions',
    'general.syncNow.name': 'Sync now',
    'general.syncNow.desc': 'Manually trigger a sync.',
    'general.syncNow.button': 'Sync now',
    'general.syncNow.syncing': 'Syncing...',
    'general.syncNow.noToken': 'Please configure your API token first.',
    'general.syncNow.failed': 'Sync failed. Check console for details.',
    'general.status': 'Status',
    'general.status.synced': 'Synced tasks: {{count}}',
    'general.status.last': 'Last sync: {{time}}',
    'general.status.never': 'Last sync: never',
    'general.status.api': 'API status: {{status}}',
    'general.status.connected': 'Connected',
    'general.status.disconnected': 'Not connected',
    'daily.enable.name': 'Daily Note',
    'daily.enable.desc': 'Write today\'s matching tasks into the managed marker region of today\'s Daily Note.',
    'daily.markerStart.name': 'Marker start',
    'daily.markerStart.desc': 'Start marker for the managed Daily Note source-mode region.',
    'daily.markerEnd.name': 'Marker end',
    'daily.markerEnd.desc': 'End marker for the managed Daily Note source-mode region.',
    'daily.warning': 'Warning: Sync Todoist fully rewrites everything between these markers during sync. Do not edit inside the marker region; unsynced edits there can be overwritten.',
    'daily.sort.name': 'Primary sort',
    'daily.sort.desc': 'Choose the first Daily Note sort dimension. The secondary sort is the other dimension.',
    'daily.sort.time': 'Time first',
    'daily.sort.priority': 'Priority first',
    'daily.includeCompleted.name': 'Include completed tasks',
    'daily.includeCompleted.desc': 'Keep Todoist tasks completed today in the Daily Note block and sorted in place, regardless of due date.',
    'daily.includeCompletedRecurring.name': 'Include completed recurring tasks',
    'daily.includeCompletedRecurring.desc': 'Also keep recurring tasks completed today. Todoist moves recurring tasks to their next occurrence, so Sync Todoist uses the activity log to keep today\'s completed occurrence.',
    'daily.syncNow.name': 'Sync Daily Note now',
    'daily.syncNow.desc': 'Refresh today\'s Daily Note using the current filter settings.',
    'daily.syncNow.button': 'Sync today',
    'daily.syncNow.result': 'Daily Note result: {{status}}',
    'daily.filters': 'Task filters',
    'daily.filters.desc': 'Each dimension defaults to all. If you select values in multiple dimensions, a task must match every selected dimension.',
    'daily.filters.verifyFirst': 'Verify your Todoist API token in General settings first to load projects and labels.',
    'daily.projects': 'Projects',
    'daily.projects.all': 'All projects',
    'daily.projects.inbox': 'Inbox',
    'daily.labels': 'Labels',
    'daily.labels.all': 'All labels',
    'daily.labels.shared': 'shared',
    'daily.priority': 'Priority',
    'daily.priority.all': 'All priorities',
    'priority.urgent': 'Urgent (p1)',
    'priority.high': 'High (p2)',
    'priority.medium': 'Medium (p3)',
    'priority.normal': 'Normal (p4)',
  },
  'zh-CN': {
    'tab.general': '通用',
    'tab.daily': '每日 Daily Note',
    'general.language.name': '界面语言',
    'general.language.desc': 'Sync Todoist 设置界面使用的语言。',
    'general.language.en': '英语',
    'general.language.zh': '简体中文',
    'general.apiToken.name': 'Todoist API Token',
    'general.apiToken.desc': '你的 Todoist API Token，可在 Todoist 设置 -> Integrations -> Developer 中找到。',
    'general.apiToken.placeholder': '输入 API Token',
    'general.apiToken.verify': '验证',
    'general.apiToken.verifying': '验证中...',
    'general.apiToken.valid': 'API Token 有效。',
    'general.apiToken.invalid': 'API Token 无效，请检查后重试。',
    'general.apiToken.failed': 'Token 验证失败，请检查网络连接。',
    'general.syncTag.name': '同步标签',
    'general.syncTag.desc': '用于识别需要同步任务的标签，请包含 # 符号。',
    'general.defaultProject.name': '默认项目',
    'general.defaultProject.desc': '新任务默认写入的 Todoist 项目。留空则使用 Inbox。',
    'general.defaultProject.inbox': 'Inbox（默认）',
    'general.defaultProject.placeholder': '验证 API Token 后加载项目',
    'general.syncInterval.name': '同步间隔',
    'general.syncInterval.desc': '与 Todoist 同步的频率，单位为分钟。设为 0 可关闭自动同步。',
    'general.conflict.name': '冲突处理',
    'general.conflict.desc': '当两边都有修改时如何处理冲突。',
    'general.conflict.todoist': 'Todoist 优先',
    'general.conflict.local': '本地优先',
    'general.conflict.ask': '每次询问',
    'general.notifications': '通知',
    'general.notifications.manual.name': '手动同步通知',
    'general.notifications.manual.desc': '手动触发同步后显示简短完成通知。',
    'general.notifications.auto.name': '自动同步通知',
    'general.notifications.auto.desc': '在桌面端和移动端显示定时同步通知。错误始终会显示。',
    'general.manualActions': '手动操作',
    'general.syncNow.name': '立即同步',
    'general.syncNow.desc': '手动触发一次同步。',
    'general.syncNow.button': '立即同步',
    'general.syncNow.syncing': '同步中...',
    'general.syncNow.noToken': '请先配置 API Token。',
    'general.syncNow.failed': '同步失败，请查看控制台。',
    'general.status': '状态',
    'general.status.synced': '已同步任务：{{count}}',
    'general.status.last': '上次同步：{{time}}',
    'general.status.never': '上次同步：从未同步',
    'general.status.api': 'API 状态：{{status}}',
    'general.status.connected': '已连接',
    'general.status.disconnected': '未连接',
    'daily.enable.name': '每日 Daily Note',
    'daily.enable.desc': '将今天符合条件的任务写入当天 Daily Note 的受控 Marker 区间。',
    'daily.markerStart.name': '开始 Marker',
    'daily.markerStart.desc': '受控 Daily Note 源代码模式区间的开始标记。',
    'daily.markerEnd.name': '结束 Marker',
    'daily.markerEnd.desc': '受控 Daily Note 源代码模式区间的结束标记。',
    'daily.warning': '注意：Sync Todoist 在同步时会完整重写这两个 Marker 之间的所有内容。不要在 Marker 区间内手动编辑；尚未同步的改动可能会被覆盖。',
    'daily.sort.name': '首要排序',
    'daily.sort.desc': '选择 Daily Note 的第一级排序维度，第二级排序会使用另一个维度。',
    'daily.sort.time': '时间优先',
    'daily.sort.priority': '重要程度优先',
    'daily.includeCompleted.name': '同步已完成任务',
    'daily.includeCompleted.desc': '将今天标记完成的 Todoist 任务保留在 Daily Note 区间中，并按排序规则放在原位置，不要求截止日期是今天。',
    'daily.includeCompletedRecurring.name': '包含已完成的循环任务',
    'daily.includeCompletedRecurring.desc': '同时保留今天完成的循环任务。Todoist 会把循环任务移动到下一次出现，因此 Sync Todoist 会用活动日志保留今天完成的这一轮。',
    'daily.syncNow.name': '立即同步 Daily Note',
    'daily.syncNow.desc': '使用当前筛选设置刷新今天的 Daily Note。',
    'daily.syncNow.button': '同步今天',
    'daily.syncNow.result': 'Daily Note 结果：{{status}}',
    'daily.filters': '任务筛选',
    'daily.filters.desc': '每个维度默认都是全部。多个维度同时选择时，任务必须同时满足每个已选择的维度。',
    'daily.filters.verifyFirst': '请先在通用设置中验证 Todoist API Token，以加载项目和标签。',
    'daily.projects': '项目',
    'daily.projects.all': '所有项目',
    'daily.projects.inbox': 'Inbox',
    'daily.labels': '标签',
    'daily.labels.all': '所有标签',
    'daily.labels.shared': '共享',
    'daily.priority': '优先级',
    'daily.priority.all': '所有优先级',
    'priority.urgent': '紧急 (p1)',
    'priority.high': '高 (p2)',
    'priority.medium': '中 (p3)',
    'priority.normal': '普通 (p4)',
  },
};

export function t(language: UiLanguage, key: I18nKey, values: Record<string, string | number> = {}): string {
  let text = STRINGS[language]?.[key] ?? STRINGS.en[key];
  for (const [name, value] of Object.entries(values)) {
    text = text.replace(new RegExp(`{{${name}}}`, 'g'), String(value));
  }
  return text;
}
