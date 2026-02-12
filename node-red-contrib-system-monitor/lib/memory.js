"use strict";

const fs = require("fs/promises");
const Sampler = require("./sampler");

const MEMINFO_PATH = "/proc/meminfo";

function parseLine(line) {
  const match = /^([A-Za-z_]+):\s+(\d+)\s*kB$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    key: match[1],
    valueBytes: Number.parseInt(match[2], 10) * 1024,
  };
}

function parseMemInfo(raw) {
  const values = {};
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseLine(lines[i]);
    if (!parsed) {
      continue;
    }
    values[parsed.key] = parsed.valueBytes;
  }
  return values;
}

function toMemoryMetric(totalBytes, freeBytes) {
  if (
    !Number.isFinite(totalBytes) ||
    !Number.isFinite(freeBytes) ||
    totalBytes < 0 ||
    freeBytes < 0
  ) {
    return null;
  }

  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
  };
}

class MemorySampler extends Sampler {
  async getMetrics() {
    const raw = await fs.readFile(MEMINFO_PATH, "utf8");
    const parsed = parseMemInfo(raw);

    const ramTotal = parsed.MemTotal;
    const ramAvailable =
      parsed.MemAvailable !== undefined ? parsed.MemAvailable : parsed.MemFree;
    const swapTotal = parsed.SwapTotal;
    const swapFree = parsed.SwapFree;

    return {
      timestamp: Date.now(),
      ram: toMemoryMetric(ramTotal, ramAvailable),
      swap: toMemoryMetric(swapTotal, swapFree),
    };
  }
}

module.exports = {
  MemorySampler,
};
