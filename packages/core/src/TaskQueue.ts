import { eq, or } from 'drizzle-orm';
import { DatabaseInstance } from '@soup/database';
import { tasks as tasksSchema } from '@soup/database/schema.js';

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Serializable representation of a Task for database persistence.
 */
export interface TaskJSON {
  id: string;
  torrentHash: string;
  status: TaskStatus;
  progress: number;
  currentFile: string | null;
  fileMap: string; // JSON-serialized mapping
  [key: string]: unknown; // Allow for extra metadata
}

/**
 * Interface representing a generic unit of work that can be queued.
 */
export interface Task {
  id: string;
  torrentHash: string;
  status: TaskStatus;
  progress: number;
  currentFile: string | null;
  retries?: number; // Internal tracking for retry logic
  run(onProgress: (p: number, currentFile?: string | null) => void): Promise<void>;
  /** Must return a DB-serializable representation of the task. */
  toJSON(): TaskJSON;
}

/**
 * A serial task queue that executes tasks one by one and persists state to DB.
 */
export class TaskQueue {
  private tasks: Task[] = [];
  private isProcessing = false;
  private readonly MAX_RETRIES = 3;

  /**
   * Creates an instance of TaskQueue.
   * 
   * @param db - The database instance for persistence.
   */
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * Adds a new task to the queue and persists it to the database.
   * 
   * @param task - The task to enqueue.
   */
  public enqueue(task: Task): void {
    task.retries = 0;
    this.tasks.push(task);
    
    // Persist to DB
    const data = task.toJSON();
    this.db.insert(tasksSchema).values({
      id: task.id,
      torrentHash: task.torrentHash,
      type: 'copy', // Default for now
      status: task.status,
      progress: task.progress,
      fileMap: data.fileMap || '{}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run();

    this.processNext();
  }

  /**
   * Returns a list of all tasks currently in the queue.
   * 
   * @returns Array of tasks.
   */
  public getTasks(): Task[] {
    return [...this.tasks];
  }

  /**
   * Removes all completed and failed tasks from both the database and memory.
   */
  public async clearFinished(): Promise<void> {
    // 1. Delete from DB
    this.db.delete(tasksSchema)
      .where(or(eq(tasksSchema.status, 'completed'), eq(tasksSchema.status, 'failed')))
      .run();

    // 2. Remove from memory
    this.tasks = this.tasks.filter(t => t.status === 'queued' || t.status === 'processing');
  }

  /**
   * Internal orchestrator that picks the next queued task and runs it.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const nextTask = this.tasks.find(t => t.status === 'queued');
    if (!nextTask) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    
    try {
      this.updateTaskStatus(nextTask, 'processing');
      
      await nextTask.run((progress, currentFile) => {
        this.updateTaskProgress(nextTask, progress, currentFile);
      });

      this.updateTaskStatus(nextTask, 'completed');
    } catch (err) {
      const retries = (nextTask.retries ?? 0) + 1;
      nextTask.retries = retries;

      if (retries < this.MAX_RETRIES) {
        console.warn(`Task ${nextTask.id} failed (attempt ${retries}), retrying...`, err);
        this.updateTaskStatus(nextTask, 'queued'); // Put back in queue
      } else {
        console.error(`Task ${nextTask.id} failed after ${retries} attempts:`, err);
        this.updateTaskStatus(nextTask, 'failed', (err as Error).message);
      }
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }

  private updateTaskStatus(task: Task, status: TaskStatus, error?: string): void {
    task.status = status;
    this.db.update(tasksSchema)
      .set({ status, errorMessage: error, updatedAt: Date.now() })
      .where(eq(tasksSchema.id, task.id))
      .run();
  }

  private updateTaskProgress(task: Task, progress: number, currentFile?: string | null): void {
    task.progress = progress;
    if (currentFile !== undefined) {
      task.currentFile = currentFile;
    }
    
    // Note: We're not persisting currentFile to DB yet as schema doesn't have it,
    // but it's available in memory for the API /getTasks.
    this.db.update(tasksSchema)
      .set({ progress, updatedAt: Date.now() })
      .where(eq(tasksSchema.id, task.id))
      .run();
  }
}
