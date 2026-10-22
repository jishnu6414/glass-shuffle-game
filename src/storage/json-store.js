'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class JsonStore {
  constructor(filePath, initialStateFactory) {
    this.filePath = filePath;
    this.initialStateFactory = initialStateFactory;
    this.state = null;
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = this.initialStateFactory();
      await this._writeAtomic(this.state);
    }

    if (!this.state || typeof this.state !== 'object') {
      throw new Error('Persistent state must be a JSON object');
    }
    return this;
  }

  async read() {
    await this.queue.catch(() => undefined);
    return clone(this.state);
  }

  async update(mutator) {
    const operation = this.queue.then(async () => {
      if (!this.state) throw new Error('JsonStore.init() must be awaited before use');
      const working = clone(this.state);
      const result = await mutator(working);
      await this._writeAtomic(working);
      this.state = working;
      return clone(result);
    });

    // Keep the queue usable after a failed operation while still returning
    // the original rejection to the caller.
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async _writeAtomic(value) {
    const directory = path.dirname(this.filePath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
    );
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    let handle;

    try {
      handle = await fs.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(temporaryPath, this.filePath);

      // Sync the directory entry where supported so a successful rename is
      // durable across a sudden process or machine restart.
      try {
        const directoryHandle = await fs.open(directory, 'r');
        await directoryHandle.sync();
        await directoryHandle.close();
      } catch (error) {
        if (!['EINVAL', 'ENOTSUP', 'EBADF'].includes(error.code)) throw error;
      }
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

module.exports = {
  JsonStore,
  clone
};
