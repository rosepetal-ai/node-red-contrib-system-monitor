"use strict";

const os = require("os");
const Sampler = require("./sampler");

function readCpuTimes() {
  const cpus = os.cpus();
  return cpus.map((cpu) => {
    const times = cpu.times;
    const total =
      times.user + times.nice + times.sys + times.idle + times.irq;
    return { idle: times.idle, total };
  });
}

function clampPercent(value) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

class CpuSampler extends Sampler {
  constructor(options = {}) {
    super();
    this.options = options;
    this.prev = null;
    this.prevTs = null;
  }

  getMetrics() {
    const now = Date.now();
    const current = readCpuTimes();
    const intervalMs = this.prevTs === null ? null : now - this.prevTs;
    const uptimeSec = os.uptime();
    const loadAvg = os.loadavg();

    let overall = null;
    const cores = new Array(current.length);

    if (this.prev && this.prev.length === current.length) {
      let totalDeltaSum = 0;
      let idleDeltaSum = 0;

      for (let i = 0; i < current.length; i += 1) {
        const totalDelta = current[i].total - this.prev[i].total;
        const idleDelta = current[i].idle - this.prev[i].idle;

        totalDeltaSum += totalDelta;
        idleDeltaSum += idleDelta;

        if (totalDelta > 0) {
          cores[i] = clampPercent((1 - idleDelta / totalDelta) * 100);
        } else {
          cores[i] = 0;
        }
      }

      if (totalDeltaSum > 0) {
        overall = clampPercent((1 - idleDeltaSum / totalDeltaSum) * 100);
      } else {
        overall = 0;
      }
    } else {
      for (let i = 0; i < current.length; i += 1) {
        cores[i] = null;
      }
    }

    this.prev = current;
    this.prevTs = now;

    return {
      timestamp: now,
      intervalMs,
      uptimeSec,
      loadAvg,
      overall,
      cores,
    };
  }
}

module.exports = {
  CpuSampler,
};
