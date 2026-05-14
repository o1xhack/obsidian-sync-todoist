import { ParsedObsidianTask, TodoistTask } from './types';
import { TodoistService } from './todoist-service';
import { canPushDueToTodoist, dueHash, normalizeTodoistDue } from './due';

export function selectTaskForTodoistSync(
  tasks: ParsedObsidianTask[],
  todoistTask: TodoistTask | undefined
): ParsedObsidianTask {
  const completedGeneratedTask = tasks.find(task =>
    task.isDailyNoteGenerated && task.isCompleted && todoistTask && !todoistTask.isCompleted
  );
  if (completedGeneratedTask) return completedGeneratedTask;

  return tasks.find(task => !task.isDailyNoteGenerated) ?? tasks[0];
}

export function canCompleteTodoistFromGeneratedDailyNote(
  obsidianTask: ParsedObsidianTask,
  todoistTask: TodoistTask
): boolean {
  const todoistDueDate = TodoistService.parseDueDate(todoistTask);
  return !(obsidianTask.dueDate && todoistDueDate && obsidianTask.dueDate !== todoistDueDate);
}

export function shouldPushDueDateToTodoist(
  obsidianTask: ParsedObsidianTask,
  todoistTask: TodoistTask,
  _todoistDueDate: string | null
): boolean {
  if (!obsidianTask.due) return false;

  const todoistDue = normalizeTodoistDue(todoistTask.due);
  if (dueHash(obsidianTask.due) === dueHash(todoistDue)) return false;
  if (todoistDue.kind === 'fixed' || todoistDue.kind === 'recurring' || todoistDue.isRecurring) return false;

  // Date-only Markdown cannot safely replace an existing timed Todoist due:
  // that would silently drop the wall-clock time.
  if (todoistDue.kind === 'floating' && obsidianTask.due.kind === 'date') return false;

  return canPushDueToTodoist(obsidianTask.due);
}
