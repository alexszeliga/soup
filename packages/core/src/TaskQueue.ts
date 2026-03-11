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
  nextRetryAt?: number; // timestamp when the task can be retried
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
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_RETRY_DELAY_MS = 5000;

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

    const now = Date.now();
    const nextTask = this.tasks.find(t => 
      t.status === 'queued' && (!t.nextRetryAt || t.nextRetryAt <= now)
    );

    if (!nextTask) {
      // If there are tasks waiting for retry, check again soon
      const pendingRetry = this.tasks.find(t => t.status === 'queued' && t.nextRetryAt && t.nextRetryAt > now);
      if (pendingRetry) {
        const delay = Math.max(1000, pendingRetry.nextRetryAt! - now);
        setTimeout(() => this.processNext(), delay);
      }
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    
    try {
      this.updateTaskStatus(nextTask, 'processing');
      console.log(`[Transfer] Started task: ${nextTask.id} (${nextTask.torrentHash})`);
      
      await nextTask.run((progress, currentFile) => {
        this.updateTaskProgress(nextTask, progress, currentFile);
      });

      this.updateTaskStatus(nextTask, 'completed');
      console.log(`[Transfer] Completed task: ${nextTask.id}`);
    } catch (err: unknown) {
      const retries = (nextTask.retries ?? 0) + 1;
      nextTask.retries = retries;

      // Determine if error is terminal (e.g. Permission Denied)
      let isTerminal = false;
      let errorCode = 'UNKNOWN';
      let errorMessage = 'Unknown error';

      if (err instanceof Error) {
        errorMessage = err.message;
        const e = err as unknown as { code?: string };
        if (e.code === 'EPERM' || e.code === 'EACCES') {
          isTerminal = true;
          errorCode = e.code;
        }
      }

      if (!isTerminal && retries < this.MAX_RETRIES) {
        // Exponential backoff: 5s, 10s, 20s, 40s, 80s
        const delay = this.INITIAL_RETRY_DELAY_MS * Math.pow(2, retries - 1);
        nextTask.nextRetryAt = Date.now() + delay;
        
        console.warn(`[Transfer] Task ${nextTask.id} failed (attempt ${retries}), retrying in ${delay/1000}s...`, errorMessage);
        this.updateTaskStatus(nextTask, 'queued');
      } else {
        const reason = isTerminal ? `Terminal Error (${errorCode})` : `Failed after ${retries} attempts`;
        console.error(`[Transfer] Task ${nextTask.id} failed permanently: ${reason}`, err);
        this.updateTaskStatus(nextTask, 'failed', `${reason}: ${errorMessage}`);
      }
    } finally {
      this.isProcessing = false;
      // Use setImmediate to allow other events to process before next task
      setImmediate(() => this.processNext());
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
    
    this.db.update(tasksSchema)
      .set({ progress, updatedAt: Date.now() })
      .where(eq(tasksSchema.id, task.id))
      .run();
  }
}
