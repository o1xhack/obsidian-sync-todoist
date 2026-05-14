import { ParsedObsidianTask, TodoistTask } from './types';
import { TodoistService } from './todoist-service';

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
  todoistDueDate: string | null
): boolean {
  if (obsidianTask.dueDate === todoistDueDate) return false;
  if (todoistTask.due?.datetime || todoistTask.due?.isRecurring) return false;
  return true;
}
