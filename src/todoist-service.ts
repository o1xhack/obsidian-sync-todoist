import { requestUrl } from 'obsidian';
import {
  dateOnlyFromDue,
  normalizeTodoistDue,
  todoistDueUpdate,
} from './due';
import {
  TaskOptions,
  TodoistPriority,
  TodoistProject,
  TodoistLabel,
  TodoistTask,
  TodoistApiRawTask,
  TodoistApiRawProject,
  TodoistPaginatedResponse,
  ProjectCache,
  normalizeTask,
} from './types';

const API_BASE = 'https://api.todoist.com/api/v1';
export type TodoistCompletedTaskDateMode = 'due_date' | 'completion_date';

export interface CompletedTaskQueryOptions {
  filterQuery?: string;
  by: TodoistCompletedTaskDateMode;
  since: Date;
  until: Date;
}

export interface TodoistActivityEvent {
  objectId: string;
  v2ObjectId?: string;
  eventDate: string;
  extraData: Record<string, unknown> | null;
}

interface TodoistApiRawActivityEvent {
  object_id: string;
  v2_object_id?: string;
  event_type: string;
  event_date: string;
  extra_data?: Record<string, unknown> | null;
}

interface TodoistApiRawLabel {
  id: string;
  name: string;
}

/**
 * Service class wrapping the Todoist API v1 via Obsidian's requestUrl.
 */
export class TodoistService {
  private apiToken: string | null = null;
  private projectCache: Map<string, string> = new Map();
  private reverseProjectCache: Map<string, string> = new Map();
  private inboxProjectId: string | null = null;

  initialize(apiToken: string): void {
    if (!apiToken) {
      this.apiToken = null;
      return;
    }
    this.apiToken = apiToken;
  }

  isInitialized(): boolean {
    return this.apiToken !== null;
  }

  private headers(): Record<string, string> {
    return { 'Authorization': `Bearer ${this.apiToken}` };
  }

  async verifyToken(): Promise<boolean> {
    if (!this.apiToken) return false;
    try {
      await requestUrl({ url: `${API_BASE}/projects?limit=1`, headers: this.headers() });
      return true;
    } catch (error) {
      console.error('Todoist token verification failed:', error);
      return false;
    }
  }

  async getProjects(): Promise<TodoistProject[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const allProjects: TodoistApiRawProject[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams({ limit: '200' });
        if (cursor) params.set('cursor', cursor);

        const resp = await requestUrl({
          url: `${API_BASE}/projects?${params.toString()}`,
          headers: this.headers(),
        });

        const data = resp.json as TodoistPaginatedResponse<TodoistApiRawProject>;
        allProjects.push(...(data.results ?? []));
        cursor = data.next_cursor ?? null;
      } while (cursor);

      this.projectCache.clear();
      this.reverseProjectCache.clear();
      this.inboxProjectId = null;

      return allProjects.map(p => {
        this.projectCache.set(p.id, p.name);
        this.reverseProjectCache.set(p.name.toLowerCase(), p.id);
        if (p.inbox_project) this.inboxProjectId = p.id;
        return { id: p.id, name: p.name, isInbox: p.inbox_project ?? false };
      });
    } catch (error) {
      console.error('Failed to get projects:', error);
      throw error;
    }
  }

  async getLabels(): Promise<TodoistLabel[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    const labels: TodoistLabel[] = [];
    const seenNames = new Set<string>();

    let personalCursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: '200' });
      if (personalCursor) params.set('cursor', personalCursor);
      const personalResp = await requestUrl({
        url: `${API_BASE}/labels?${params.toString()}`,
        headers: this.headers(),
        throw: false,
      });

      if (personalResp.status !== 200) {
        throw new Error(`Failed to get labels, status ${personalResp.status}`);
      }

      const personalData = personalResp.json as TodoistPaginatedResponse<TodoistApiRawLabel>;
      const personalLabels = personalData.results ?? [];
      for (const label of personalLabels) {
        if (seenNames.has(label.name)) continue;
        seenNames.add(label.name);
        labels.push({ id: label.id, name: label.name, isShared: false });
      }
      personalCursor = personalData.next_cursor ?? null;
    } while (personalCursor);

    let sharedCursor: string | null = null;
    do {
      const params = new URLSearchParams({ limit: '200' });
      if (sharedCursor) params.set('cursor', sharedCursor);
      const sharedResp = await requestUrl({
        url: `${API_BASE}/labels/shared?${params.toString()}`,
        headers: this.headers(),
        throw: false,
      });

      if (sharedResp.status === 404) {
        break;
      }

      if (sharedResp.status !== 200) {
        throw new Error(`Failed to get shared labels, status ${sharedResp.status}`);
      }

      const sharedData = sharedResp.json as TodoistPaginatedResponse<string>;
      const names = sharedData.results ?? [];
      for (const name of names) {
        if (seenNames.has(name)) continue;
        seenNames.add(name);
        labels.push({ id: name, name, isShared: true });
      }
      sharedCursor = sharedData.next_cursor ?? null;
    } while (sharedCursor);

    return labels.sort((a, b) => a.name.localeCompare(b.name));
  }

  getProjectCache(): ProjectCache {
    const cache: ProjectCache = {};
    for (const [id, name] of this.projectCache) {
      cache[id] = name;
    }
    return cache;
  }

  getProjectName(projectId: string): string | undefined {
    return this.projectCache.get(projectId);
  }

  getProjectIdByName(name: string): string | undefined {
    return this.reverseProjectCache.get(name.toLowerCase());
  }

  isInboxProject(projectId: string): boolean {
    return this.inboxProjectId === projectId;
  }

  async ensureProjectCache(): Promise<void> {
    if (this.projectCache.size === 0) {
      await this.getProjects();
    }
  }

  async getTasks(projectId?: string): Promise<TodoistTask[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const allTasks: TodoistTask[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams({ limit: '200' });
        if (projectId) params.set('project_id', projectId);
        if (cursor) params.set('cursor', cursor);

        const resp = await requestUrl({
          url: `${API_BASE}/tasks?${params.toString()}`,
          headers: this.headers(),
        });

        const data = resp.json as TodoistPaginatedResponse<TodoistApiRawTask>;
        for (const raw of data.results ?? []) {
          allTasks.push(normalizeTask(raw));
        }
        cursor = data.next_cursor ?? null;
      } while (cursor);

      console.debug(`Fetched ${allTasks.length} tasks from Todoist`);
      return allTasks;
    } catch (error) {
      console.error('Failed to get tasks:', error);
      throw error;
    }
  }

  async getSubtasks(parentId: string): Promise<TodoistTask[]> {
    const allTasks = await this.getTasks();
    return allTasks.filter(t => t.parentId === parentId);
  }

  async getTask(taskId: string): Promise<TodoistTask | null> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const resp = await requestUrl({
        url: `${API_BASE}/tasks/${taskId}`,
        headers: this.headers(),
      });
      return normalizeTask(resp.json as TodoistApiRawTask);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
        return null;
      }
      console.error('Failed to get task:', error);
      throw error;
    }
  }

  async createTask(content: string, options?: TaskOptions): Promise<TodoistTask> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const body: Record<string, unknown> = { content };
      if (options?.projectId) body.project_id = options.projectId;
      if (options?.parentId) body.parent_id = options.parentId;
      if (options?.priority) body.priority = options.priority;
      const duePayload = options?.due ? todoistDueUpdate(options.due) : { dueDate: options?.dueDate };
      if (duePayload.dueDate) body.due_date = duePayload.dueDate;
      if (duePayload.dueDatetime) body.due_datetime = duePayload.dueDatetime;
      if (options?.labels) body.labels = options.labels;
      if (options?.description) body.description = options.description;

      const resp = await requestUrl({
        url: `${API_BASE}/tasks`,
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      console.debug('Created Todoist task:', content);
      return normalizeTask(resp.json as TodoistApiRawTask);
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  }

  async updateTask(taskId: string, updates: {
    content?: string;
    priority?: TodoistPriority;
    dueString?: string;
    dueDate?: string;
    dueDatetime?: string;
    labels?: string[];
    description?: string;
  }): Promise<TodoistTask> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const body: Record<string, unknown> = {};
      if (updates.content !== undefined) body.content = updates.content;
      if (updates.priority !== undefined) body.priority = updates.priority;
      if (updates.dueString !== undefined) body.due_string = updates.dueString;
      if (updates.dueDate !== undefined) body.due_date = updates.dueDate;
      if (updates.dueDatetime !== undefined) body.due_datetime = updates.dueDatetime;
      if (updates.labels !== undefined) body.labels = updates.labels;
      if (updates.description !== undefined) body.description = updates.description;

      const resp = await requestUrl({
        url: `${API_BASE}/tasks/${taskId}`,
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      console.debug('Updated Todoist task:', taskId);
      return normalizeTask(resp.json as TodoistApiRawTask);
    } catch (error) {
      console.error('Failed to update task:', error);
      throw error;
    }
  }

  async completeTask(taskId: string): Promise<boolean> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      await requestUrl({
        url: `${API_BASE}/tasks/${taskId}/close`,
        method: 'POST',
        headers: this.headers(),
      });
      console.debug('Completed Todoist task:', taskId);
      return true;
    } catch (error) {
      console.error('Failed to complete task:', error);
      throw error;
    }
  }

  async reopenTask(taskId: string): Promise<boolean> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      await requestUrl({
        url: `${API_BASE}/tasks/${taskId}/reopen`,
        method: 'POST',
        headers: this.headers(),
      });
      console.debug('Reopened Todoist task:', taskId);
      return true;
    } catch (error) {
      console.error('Failed to reopen task:', error);
      throw error;
    }
  }

  async deleteTask(taskId: string): Promise<boolean> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      await requestUrl({
        url: `${API_BASE}/tasks/${taskId}`,
        method: 'DELETE',
        headers: this.headers(),
      });
      console.debug('Deleted Todoist task:', taskId);
      return true;
    } catch (error) {
      console.error('Failed to delete task:', error);
      throw error;
    }
  }

  async getFilteredTasks(filter: string): Promise<TodoistTask[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    const allTasks: TodoistTask[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ query: filter, limit: '200' });
      if (cursor) params.set('cursor', cursor);

      const resp = await requestUrl({
        url: `${API_BASE}/tasks/filter?${params.toString()}`,
        headers: this.headers(),
        throw: false,
      });

      if (resp.status === 400) {
        const body = resp.json as { error?: string } | null;
        const detail = body?.error ?? 'invalid filter expression';
        throw new Error(`Invalid filter: ${detail}`);
      }

      if (resp.status !== 200) {
        throw new Error(`Request failed, status ${resp.status}`);
      }

      const data = resp.json as { items?: TodoistApiRawTask[]; results?: TodoistApiRawTask[]; next_cursor?: string };
      const rawItems = data.items ?? data.results ?? [];
      for (const raw of rawItems) {
        allTasks.push(normalizeTask(raw));
      }
      cursor = data.next_cursor ?? null;
    } while (cursor);

    return allTasks;
  }

  async getCompletedTasks(options: CompletedTaskQueryOptions): Promise<TodoistTask[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    const endpoint = options.by === 'due_date'
      ? 'tasks/completed/by_due_date'
      : 'tasks/completed/by_completion_date';
    const allTasks: TodoistTask[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({
        since: options.since.toISOString(),
        until: options.until.toISOString(),
        limit: '200',
      });
      if (options.filterQuery) params.set('filter_query', options.filterQuery);
      if (cursor) params.set('cursor', cursor);

      const resp = await requestUrl({
        url: `${API_BASE}/${endpoint}?${params.toString()}`,
        headers: this.headers(),
        throw: false,
      });

      if (resp.status === 400) {
        const body = resp.json as { error?: string } | null;
        const detail = body?.error ?? 'invalid completed task query';
        throw new Error(`Invalid completed task query: ${detail}`);
      }

      if (resp.status === 403) {
        throw new Error('Completed task archive unavailable for this Todoist account');
      }

      if (resp.status !== 200) {
        throw new Error(`Completed task request failed, status ${resp.status}`);
      }

      const data = resp.json as {
        items?: TodoistApiRawTask[];
        results?: TodoistApiRawTask[];
        next_cursor?: string | null;
      };
      const rawItems = data.items ?? data.results ?? [];
      for (const raw of rawItems) {
        allTasks.push(normalizeTask({ ...raw, checked: raw.checked ?? true }));
      }
      cursor = data.next_cursor ?? null;
    } while (cursor);

    return allTasks;
  }

  async getCompletedTaskActivities(since: Date, until: Date): Promise<TodoistActivityEvent[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    const allActivities: TodoistActivityEvent[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({
        date_from: since.toISOString(),
        date_to: until.toISOString(),
        limit: '100',
      });
      params.append('object_event_types', 'item:completed');
      if (cursor) params.set('cursor', cursor);

      const resp = await requestUrl({
        url: `${API_BASE}/activities?${params.toString()}`,
        headers: this.headers(),
        throw: false,
      });

      if (resp.status !== 200) {
        throw new Error(`Completed activity request failed, status ${resp.status}`);
      }

      const data = resp.json as {
        results?: TodoistApiRawActivityEvent[];
        items?: TodoistApiRawActivityEvent[];
        next_cursor?: string | null;
      };
      const rawItems = data.results ?? data.items ?? [];
      for (const raw of rawItems) {
        if (raw.event_type !== 'completed') continue;
        allActivities.push({
          objectId: raw.object_id,
          v2ObjectId: raw.v2_object_id,
          eventDate: raw.event_date,
          extraData: raw.extra_data ?? null,
        });
      }
      cursor = data.next_cursor ?? null;
    } while (cursor);

    return allActivities;
  }

  static fromTodoistPriority(priority: number): TodoistPriority {
    return priority;
  }

  static formatDueDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  static parseDueDate(task: TodoistTask): string | null {
    return dateOnlyFromDue(normalizeTodoistDue(task.due));
  }
}
