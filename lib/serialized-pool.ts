import type { PoolLike, QueryExecutor } from './postgres';

/** PGlite has one connection. Reserve it until release, including against
 * standalone pool queries, so no request can join another request's transaction. */
export function serializedPool(executor: QueryExecutor): PoolLike {
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let unlock!: () => void;
    tail = new Promise<void>(resolve => { unlock = resolve; });
    await previous;
    return unlock;
  }
  return {
    storageDialect: executor.storageDialect,
    async query(text, values) {
      const release = await acquire();
      try { return await executor.query(text, values); }
      finally { release(); }
    },
    async connect() {
      const unlock = await acquire();
      let released = false;
      return {
        storageDialect: executor.storageDialect,
        query(text, values) {
          if (released) throw new Error('Database connection already released.');
          return executor.query(text, values);
        },
        release() { if (!released) { released = true; unlock(); } },
      };
    },
  };
}
