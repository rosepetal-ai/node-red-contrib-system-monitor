"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");
const Sampler = require("./sampler");

const execFileAsync = promisify(execFile);
const NVIDIA_SMI_BIN = "nvidia-smi";

const GPU_FIELDS = [
  "index",
  "uuid",
  "name",
  "utilization.gpu",
  "memory.used",
  "memory.total",
  "temperature.gpu",
  "power.draw",
  "power.limit",
  "fan.speed",
  "pstate",
];

const PROCESS_FIELDS = [
  "pid",
  "gpu_uuid",
  "used_memory",
  "process_name",
];

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  values.push(current.trim());
  return values;
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value) {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "N/A" || trimmed === "[N/A]") {
    return null;
  }
  return trimmed;
}

async function queryNvidiaSmi(scope, fields) {
  const args = [
    `--query-${scope}=${fields.join(",")}`,
    "--format=csv,noheader,nounits",
  ];
  const { stdout } = await execFileAsync(NVIDIA_SMI_BIN, args, {
    timeout: 2500,
    maxBuffer: 1024 * 1024,
  });
  return stdout || "";
}

function parseGpuRows(raw) {
  const lines = raw.split("\n");
  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const fields = parseCsvLine(line);
    if (fields.length < GPU_FIELDS.length) {
      continue;
    }

    const index = parseInteger(fields[0]);
    const uuid = normalizeText(fields[1]);
    const name = normalizeText(fields[2]) || `GPU${index ?? "?"}`;
    const utilizationGpuPercent = parseNumber(fields[3]);
    const memoryUsedMiB = parseNumber(fields[4]);
    const memoryTotalMiB = parseNumber(fields[5]);
    const temperatureC = parseNumber(fields[6]);
    const powerDrawW = parseNumber(fields[7]);
    const powerLimitW = parseNumber(fields[8]);
    const fanPercent = parseNumber(fields[9]);
    const pstate = normalizeText(fields[10]);

    const memoryUsedPercent =
      typeof memoryUsedMiB === "number" &&
      typeof memoryTotalMiB === "number" &&
      memoryTotalMiB > 0
        ? (memoryUsedMiB / memoryTotalMiB) * 100
        : null;

    rows.push({
      index,
      uuid,
      name,
      utilizationGpuPercent,
      memoryUsedMiB,
      memoryTotalMiB,
      memoryUsedPercent,
      temperatureC,
      powerDrawW,
      powerLimitW,
      fanPercent,
      pstate,
    });
  }

  rows.sort((a, b) => {
    const ai = typeof a.index === "number" ? a.index : 1e9;
    const bi = typeof b.index === "number" ? b.index : 1e9;
    return ai - bi;
  });

  return rows;
}

function parseProcessRows(raw, gpuByUuid) {
  const lines = raw.split("\n");
  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith("No running processes found")) {
      continue;
    }

    const fields = parseCsvLine(line);
    if (fields.length < PROCESS_FIELDS.length) {
      continue;
    }

    const pid = parseInteger(fields[0]);
    const gpuUuid = normalizeText(fields[1]);
    const usedMemoryMiB = parseNumber(fields[2]);
    const processName = normalizeText(fields[3]);
    const gpu = gpuUuid ? gpuByUuid.get(gpuUuid) : null;

    rows.push({
      pid,
      gpuUuid,
      gpuIndex: gpu?.index ?? null,
      gpuName: gpu?.name ?? null,
      usedMemoryMiB,
      processName: processName || "-",
    });
  }

  rows.sort((a, b) => {
    const am = typeof a.usedMemoryMiB === "number" ? a.usedMemoryMiB : -1;
    const bm = typeof b.usedMemoryMiB === "number" ? b.usedMemoryMiB : -1;
    if (bm !== am) {
      return bm - am;
    }
    const ap = typeof a.pid === "number" ? a.pid : 1e9;
    const bp = typeof b.pid === "number" ? b.pid : 1e9;
    return ap - bp;
  });

  return rows;
}

class GpuSampler extends Sampler {
  constructor() {
    super();
    this.available = null;
    this.unavailableReason = null;
  }

  async getMetrics() {
    const timestamp = Date.now();

    if (this.available === false) {
      return {
        timestamp,
        available: false,
        reason: this.unavailableReason,
        summary: null,
        gpus: [],
        processes: [],
      };
    }

    let gpuRaw = "";
    try {
      gpuRaw = await queryNvidiaSmi("gpu", GPU_FIELDS);
    } catch (err) {
      const stderr = normalizeText(err?.stderr);
      const message = stderr || normalizeText(err?.message) || "gpu query failed";
      const normalizedMessage = message.toLowerCase();
      this.available = false;
      this.unavailableReason =
        err?.code === "ENOENT" || normalizedMessage.includes("not found")
          ? "nvidia-smi not found"
          : normalizedMessage.includes("nvidia-smi has failed")
            ? "nvidia-smi unavailable"
            : normalizedMessage.startsWith("command failed:")
              ? "nvidia-smi unavailable"
              : message;
      return {
        timestamp,
        available: false,
        reason: this.unavailableReason,
        summary: null,
        gpus: [],
        processes: [],
      };
    }

    this.available = true;

    let processRaw = "";
    try {
      processRaw = await queryNvidiaSmi("compute-apps", PROCESS_FIELDS);
    } catch (_err) {
      processRaw = "";
    }

    const gpus = parseGpuRows(gpuRaw);
    const gpuByUuid = new Map(
      gpus
        .filter((gpu) => !!gpu.uuid)
        .map((gpu) => [gpu.uuid, gpu])
    );
    const processes = parseProcessRows(processRaw, gpuByUuid);

    const summary = {
      gpus: gpus.length,
      processes: processes.length,
      totalMemoryUsedMiB: 0,
      totalMemoryMiB: 0,
      averageUtilizationPercent: null,
    };

    let utilSum = 0;
    let utilCount = 0;
    for (let i = 0; i < gpus.length; i += 1) {
      const gpu = gpus[i];
      if (typeof gpu.memoryUsedMiB === "number" && !Number.isNaN(gpu.memoryUsedMiB)) {
        summary.totalMemoryUsedMiB += gpu.memoryUsedMiB;
      }
      if (typeof gpu.memoryTotalMiB === "number" && !Number.isNaN(gpu.memoryTotalMiB)) {
        summary.totalMemoryMiB += gpu.memoryTotalMiB;
      }
      if (
        typeof gpu.utilizationGpuPercent === "number" &&
        !Number.isNaN(gpu.utilizationGpuPercent)
      ) {
        utilSum += gpu.utilizationGpuPercent;
        utilCount += 1;
      }
    }
    if (utilCount > 0) {
      summary.averageUtilizationPercent = utilSum / utilCount;
    }

    return {
      timestamp,
      available: true,
      reason: null,
      summary,
      gpus,
      processes,
    };
  }
}

module.exports = {
  GpuSampler,
};
