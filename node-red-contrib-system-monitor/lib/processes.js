"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const Sampler = require("./sampler");

const PROC_PATH = "/proc";
const PASSWD_PATH = "/etc/passwd";
const PAGE_SIZE_BYTES = 4096;

const DEFAULT_OPTIONS = {
  userRefreshMs: 5 * 60 * 1000,
  readConcurrency: 48,
};

function parseTotalCpuTicks(raw) {
  const firstLine = raw.split("\n", 1)[0] || "";
  const parts = firstLine.trim().split(/\s+/);
  if (!parts.length || parts[0] !== "cpu") {
    return null;
  }

  let total = 0;
  for (let i = 1; i < parts.length; i += 1) {
    const value = Number.parseInt(parts[i], 10);
    if (!Number.isFinite(value)) {
      continue;
    }
    total += value;
  }
  return total;
}

function parseProcStat(raw) {
  const openParen = raw.indexOf("(");
  const closeParen = raw.lastIndexOf(")");
  if (openParen < 0 || closeParen <= openParen) {
    return null;
  }

  const comm = raw.slice(openParen + 1, closeParen);
  const fields = raw
    .slice(closeParen + 1)
    .trim()
    .split(/\s+/);

  if (fields.length < 22) {
    return null;
  }

  const state = fields[0] || "-";
  const utime = Number.parseInt(fields[11], 10);
  const stime = Number.parseInt(fields[12], 10);
  const vsizeBytes = Number.parseInt(fields[20], 10);

  if (!Number.isFinite(utime) || !Number.isFinite(stime)) {
    return null;
  }

  return {
    comm,
    state,
    cpuTicks: utime + stime,
    vsizeBytes: Number.isFinite(vsizeBytes) && vsizeBytes >= 0 ? vsizeBytes : null,
  };
}

function parseProcStatm(raw) {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 3) {
    return null;
  }

  const residentPages = Number.parseInt(parts[1], 10);
  const sharedPages = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(residentPages) || !Number.isFinite(sharedPages)) {
    return null;
  }

  return {
    resBytes: Math.max(0, residentPages * PAGE_SIZE_BYTES),
    shrBytes: Math.max(0, sharedPages * PAGE_SIZE_BYTES),
  };
}

function parseCmdline(raw, fallbackComm) {
  if (!raw) {
    return fallbackComm ? `[${fallbackComm}]` : "-";
  }

  const command = raw.replace(/\u0000/g, " ").trim();
  if (command) {
    return command;
  }
  return fallbackComm ? `[${fallbackComm}]` : "-";
}

function parsePasswd(raw) {
  const map = new Map();
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const fields = line.split(":");
    if (fields.length < 3) {
      continue;
    }

    const username = fields[0];
    const uid = Number.parseInt(fields[2], 10);
    if (!username || !Number.isFinite(uid)) {
      continue;
    }

    map.set(uid, username);
  }
  return map;
}

async function mapLimit(items, limit, iteratee) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await iteratee(items[currentIndex]);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

class ProcessSampler extends Sampler {
  constructor(options = {}) {
    super();
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.cpuCount = Math.max(1, os.cpus().length);
    this.uidToUser = new Map();
    this.lastUserRefresh = 0;
    this.prevProcessTicks = new Map();
    this.prevTotalTicks = null;
  }

  async refreshUsers(now) {
    if (
      this.uidToUser.size > 0 &&
      now - this.lastUserRefresh < this.options.userRefreshMs
    ) {
      return;
    }

    try {
      const raw = await fs.readFile(PASSWD_PATH, "utf8");
      this.uidToUser = parsePasswd(raw);
      this.lastUserRefresh = now;
    } catch (_err) {
      this.lastUserRefresh = now;
    }
  }

  resolveUser(uid) {
    if (!Number.isFinite(uid)) {
      return "-";
    }
    return this.uidToUser.get(uid) || String(uid);
  }

  async readProcess(pid) {
    const procPath = path.join(PROC_PATH, String(pid));

    try {
      const [statRaw, statmRaw, cmdlineRaw, procStat] = await Promise.all([
        fs.readFile(path.join(procPath, "stat"), "utf8"),
        fs.readFile(path.join(procPath, "statm"), "utf8"),
        fs.readFile(path.join(procPath, "cmdline"), "utf8"),
        fs.stat(procPath),
      ]);

      const stat = parseProcStat(statRaw);
      const statm = parseProcStatm(statmRaw);
      if (!stat || !statm) {
        return null;
      }

      return {
        pid,
        user: this.resolveUser(procStat.uid),
        virtBytes: stat.vsizeBytes,
        resBytes: statm.resBytes,
        shrBytes: statm.shrBytes,
        cpuTicks: stat.cpuTicks,
        type: stat.state,
        command: parseCmdline(cmdlineRaw, stat.comm),
      };
    } catch (_err) {
      return null;
    }
  }

  async getMetrics() {
    const timestamp = Date.now();
    const [procStatRaw, procEntries] = await Promise.all([
      fs.readFile(path.join(PROC_PATH, "stat"), "utf8"),
      fs.readdir(PROC_PATH, { withFileTypes: true }),
      this.refreshUsers(timestamp),
    ]);

    const totalTicks = parseTotalCpuTicks(procStatRaw);
    const pids = procEntries
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => Number.parseInt(entry.name, 10))
      .filter((pid) => Number.isFinite(pid));

    const snapshots = await mapLimit(
      pids,
      this.options.readConcurrency,
      async (pid) => this.readProcess(pid)
    );

    const totalDelta =
      Number.isFinite(this.prevTotalTicks) &&
      Number.isFinite(totalTicks) &&
      totalTicks > this.prevTotalTicks
        ? totalTicks - this.prevTotalTicks
        : null;

    const items = [];
    const nextProcessTicks = new Map();
    for (let i = 0; i < snapshots.length; i += 1) {
      const snapshot = snapshots[i];
      if (!snapshot) {
        continue;
      }

      nextProcessTicks.set(snapshot.pid, snapshot.cpuTicks);

      let cpuPercent = null;
      if (Number.isFinite(totalDelta)) {
        const prevTicks = this.prevProcessTicks.get(snapshot.pid);
        if (Number.isFinite(prevTicks) && snapshot.cpuTicks >= prevTicks) {
          const tickDelta = snapshot.cpuTicks - prevTicks;
          cpuPercent = (tickDelta / totalDelta) * this.cpuCount * 100;
          if (cpuPercent < 0) {
            cpuPercent = 0;
          }
        }
      }

      items.push({
        pid: snapshot.pid,
        user: snapshot.user,
        virtBytes: snapshot.virtBytes,
        resBytes: snapshot.resBytes,
        shrBytes: snapshot.shrBytes,
        cpuPercent,
        type: snapshot.type,
        command: snapshot.command,
      });
    }

    this.prevTotalTicks = Number.isFinite(totalTicks) ? totalTicks : this.prevTotalTicks;
    this.prevProcessTicks = nextProcessTicks;

    return {
      timestamp,
      summary: {
        processes: items.length,
      },
      items,
    };
  }
}

module.exports = {
  ProcessSampler,
};
