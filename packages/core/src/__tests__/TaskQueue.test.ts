import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue, Task, TaskStatus, TaskJSON } from '../TaskQueue.js';
import { DatabaseInstance } from '@soup/database';

// A simple mock task for testing the queue logic
class MockTask implements Task {
  public id = 'task-1';
  public status: TaskStatus = 'queued';
  public progress = 0;
  public torrentHash = 'h1';
  public currentFile: string | null = null;
  public fileMap = { 's': 'd' };
  public runCount = 0;
  
  constructor(private duration: number = 100, public shouldFail: boolean = false) {}

  async run(onProgress: (p: number, currentFile?: string | null) => void): Promise<void> {
    this.runCount++;
    this.status = 'processing';
    if (this.shouldFail) {
      throw new Error('Task failed');
    }
    
    for (let i = 1; i <= 10; i++) {
      // Use a small timeout to simulate async work
      await new Promise(resolve => setTimeout(resolve, 1));
      this.progress = i * 10;
      onProgress(this.progress, 'test-file.mkv');
    }
    this.status = 'completed';
  }

  toJSON(): TaskJSON {
    return {
      id: this.id,
      torrentHash: this.torrentHash,
      status: this.status,
      progress: this.progress,
      currentFile: this.currentFile,
      fileMap: JSON.stringify(this.fileMap)
    };
  }
}

describe('TaskQueue', () => {
  let queue: TaskQueue;
  let mockDb: any;

  beforeEach(() => {
    vi.useFakeTimers();
    // Setup deep mocks for Drizzle fluent API
    const runMock = vi.fn();
    const whereMock = vi.fn().mockReturnValue({ run: runMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const valuesMock = vi.fn().mockReturnValue({ run: runMock });

    mockDb = {
      insert: vi.fn().mockReturnValue({ values: valuesMock }),
      update: vi.fn().mockReturnValue({ set: setMock }),
      query: { tasks: { findMany: vi.fn().mockResolvedValue([]) } }
    };
    queue = new TaskQueue(mockDb as any as DatabaseInstance);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should persist task to DB when enqueued', () => {
    const task = new MockTask();
    queue.enqueue(task);
    expect(mockDb.insert).toHaveBeenCalled();
    // Verify values was called with correct data
    const valuesMock = mockDb.insert().values;
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      id: task.id,
      torrentHash: task.torrentHash
    }));
  });

  it('should update task status in DB during execution', async () => {
    const task = new MockTask(10);
    queue.enqueue(task);

    // Run until task finishes
    await vi.runAllTimersAsync();
    
    // Status update to 'processing' and then 'completed'
    expect(mockDb.update).toHaveBeenCalled();
    const setMock = mockDb.update().set;
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('should retry a failed task up to 5 times with backoff', async () => {
    const task = new MockTask(10, true); // Fail every time
    queue.enqueue(task);

    // Process initial run + all retries
    // Using a loop to advance timers and run pending tasks until it hits the max retries
    for (let i = 0; i < 10; i++) {
      await vi.runOnlyPendingTimersAsync();
      await vi.advanceTimersByTimeAsync(100000); // Advance plenty of time for backoff
    }

    // Should fail permanently after 5 attempts
    expect(task.status).toBe('failed');
    expect(task.runCount).toBe(5);
  });
});
