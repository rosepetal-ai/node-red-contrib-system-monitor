"use strict";

const fs = require("fs/promises");
const Sampler = require("./sampler");

const MOUNTINFO_PATH = "/proc/self/mountinfo";
const DISKSTATS_PATH = "/proc/diskstats";
const SECTOR_SIZE_BYTES = 512;

const DEFAULT_OPTIONS = {
  mountRefreshMs: 15000,
  usageRefreshMs: 5000,
};

const PSEUDO_FS_TYPES = new Set([
  "autofs",
  "bpf",
  "cgroup",
  "cgroup2",
  "configfs",
  "debugfs",
  "devpts",
  "devtmpfs",
  "fusectl",
  "hugetlbfs",
  "mqueue",
  "nsfs",
  "overlay",
  "proc",
  "pstore",
  "ramfs",
  "rpc_pipefs",
  "securityfs",
  "squashfs",
  "sysfs",
  "tmpfs",
  "tracefs",
]);

function decodeMountField(value) {
  return value.replace(/\\([0-7]{3})/g, (_match, octal) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  );
}

function parseMountInfo(raw) {
  const lines = raw.split("\n");
  const mounts = [];
  const seenMountPoints = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const parts = line.split(" - ");
    if (parts.length !== 2) {
      continue;
    }

    const left = parts[0].split(" ");
    const right = parts[1].split(" ");
    if (left.length < 6 || right.length < 3) {
      continue;
    }

    const dev = left[2];
    const mountPoint = decodeMountField(left[4]);
    const fsType = right[0];
    const source = decodeMountField(right[1]);

    if (!mountPoint || seenMountPoints.has(mountPoint)) {
      continue;
    }

    if (PSEUDO_FS_TYPES.has(fsType)) {
      continue;
    }

    if (mountPoint.startsWith("/snap/") || source.startsWith("/dev/loop")) {
      continue;
    }

    if (!source.startsWith("/dev/")) {
      continue;
    }

    seenMountPoints.add(mountPoint);
    mounts.push({
      id: `${dev}:${mountPoint}`,
      dev,
      mountPoint,
      fsType,
      source,
    });
  }

  return mounts;
}

function parseDiskStats(raw) {
  const entries = new Map();
  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const fields = line.split(/\s+/);
    if (fields.length < 14) {
      continue;
    }

    const major = fields[0];
    const minor = fields[1];
    const readSectors = Number.parseInt(fields[5], 10);
    const writeSectors = Number.parseInt(fields[9], 10);
    if (Number.isNaN(readSectors) || Number.isNaN(writeSectors)) {
      continue;
    }

    entries.set(`${major}:${minor}`, {
      readSectors,
      writeSectors,
    });
  }

  return entries;
}

function toSafeNumber(value) {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function statFsToUsage(statFs) {
  const bsize = toSafeNumber(statFs.bsize);
  const blocks = toSafeNumber(statFs.blocks);
  const bavail = toSafeNumber(statFs.bavail);

  if (
    bsize === null ||
    blocks === null ||
    bavail === null ||
    bsize < 0 ||
    blocks < 0 ||
    bavail < 0
  ) {
    return null;
  }

  const totalBytes = Math.max(0, blocks * bsize);
  const freeBytes = Math.max(0, bavail * bsize);
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
  };
}

function getHealth(usedPercent) {
  if (typeof usedPercent !== "number" || Number.isNaN(usedPercent)) {
    return "unknown";
  }
  if (usedPercent >= 95) {
    return "critical";
  }
  if (usedPercent >= 85) {
    return "warning";
  }
  return "normal";
}

class DiskSampler extends Sampler {
  constructor(options = {}) {
    super();
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.mounts = [];
    this.lastMountRefresh = 0;
    this.lastUsageRefresh = 0;
    this.usageByMountId = new Map();
    this.prevDiskStats = new Map();
  }

  async refreshMounts(now) {
    if (
      this.mounts.length > 0 &&
      now - this.lastMountRefresh < this.options.mountRefreshMs
    ) {
      return;
    }

    const mountInfoRaw = await fs.readFile(MOUNTINFO_PATH, "utf8");
    this.mounts = parseMountInfo(mountInfoRaw);
    this.lastMountRefresh = now;
  }

  async refreshUsage(now) {
    if (
      this.usageByMountId.size > 0 &&
      now - this.lastUsageRefresh < this.options.usageRefreshMs
    ) {
      return;
    }

    const usageEntries = await Promise.all(
      this.mounts.map(async (mount) => {
        try {
          const statFs = await fs.statfs(mount.mountPoint, { bigint: true });
          return [mount.id, statFsToUsage(statFs)];
        } catch (_err) {
          return [mount.id, null];
        }
      })
    );

    this.usageByMountId = new Map(usageEntries);
    this.lastUsageRefresh = now;
  }

  async getMetrics() {
    const now = Date.now();
    await this.refreshMounts(now);
    await this.refreshUsage(now);

    const diskStatsRaw = await fs.readFile(DISKSTATS_PATH, "utf8");
    const diskStats = parseDiskStats(diskStatsRaw);

    const prevStats = this.prevDiskStats;
    const nextPrevStats = new Map();
    for (const [dev, values] of diskStats.entries()) {
      nextPrevStats.set(dev, {
        ...values,
        timestamp: now,
      });
    }
    this.prevDiskStats = nextPrevStats;

    const items = [];
    let totalBytes = 0;
    let usedBytes = 0;
    let freeBytes = 0;
    let readBpsSum = 0;
    let writeBpsSum = 0;

    const seenRateDevices = new Set();
    for (let i = 0; i < this.mounts.length; i += 1) {
      const mount = this.mounts[i];
      const usage = this.usageByMountId.get(mount.id) || null;
      const currentStats = diskStats.get(mount.dev) || null;
      const previous = prevStats.get(mount.dev) || null;

      let readBps = null;
      let writeBps = null;
      if (currentStats && previous && previous.timestamp < now) {
        const elapsedSec = (now - previous.timestamp) / 1000;
        const readDelta = currentStats.readSectors - previous.readSectors;
        const writeDelta = currentStats.writeSectors - previous.writeSectors;

        if (elapsedSec > 0 && readDelta >= 0 && writeDelta >= 0) {
          readBps = (readDelta * SECTOR_SIZE_BYTES) / elapsedSec;
          writeBps = (writeDelta * SECTOR_SIZE_BYTES) / elapsedSec;
        }
      }

      if (usage) {
        totalBytes += usage.totalBytes;
        usedBytes += usage.usedBytes;
        freeBytes += usage.freeBytes;
      }

      if (!seenRateDevices.has(mount.dev)) {
        seenRateDevices.add(mount.dev);
        if (typeof readBps === "number" && !Number.isNaN(readBps)) {
          readBpsSum += readBps;
        }
        if (typeof writeBps === "number" && !Number.isNaN(writeBps)) {
          writeBpsSum += writeBps;
        }
      }

      items.push({
        id: mount.id,
        mountPoint: mount.mountPoint,
        source: mount.source,
        fsType: mount.fsType,
        totalBytes: usage?.totalBytes ?? null,
        usedBytes: usage?.usedBytes ?? null,
        freeBytes: usage?.freeBytes ?? null,
        usedPercent: usage?.usedPercent ?? null,
        readBps,
        writeBps,
        health: getHealth(usage?.usedPercent ?? null),
      });
    }

    items.sort((a, b) => {
      const aPercent = typeof a.usedPercent === "number" ? a.usedPercent : -1;
      const bPercent = typeof b.usedPercent === "number" ? b.usedPercent : -1;
      if (bPercent !== aPercent) {
        return bPercent - aPercent;
      }
      return a.mountPoint.localeCompare(b.mountPoint);
    });

    const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    return {
      timestamp: now,
      summary: {
        mounts: items.length,
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercent: Math.max(0, Math.min(100, usedPercent)),
        readBps: readBpsSum,
        writeBps: writeBpsSum,
      },
      items,
    };
  }
}

module.exports = {
  DiskSampler,
};
