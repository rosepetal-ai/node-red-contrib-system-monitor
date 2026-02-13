"use strict";

const fs = require("fs/promises");
const { CpuSampler } = require("./lib/cpu");
const { MemorySampler } = require("./lib/memory");
const { DiskSampler } = require("./lib/disk");
const { NetworkSampler } = require("./lib/network");
const { GpuSampler } = require("./lib/gpu");
const { ProcessSampler } = require("./lib/processes");

const TASK_THREAD_REFRESH_MS = 5000;

async function getTaskThreadCounts() {
  const [loadavgRaw, procEntries] = await Promise.all([
    fs.readFile("/proc/loadavg", "utf8"),
    fs.readdir("/proc", { withFileTypes: true }),
  ]);

  const tasks = procEntries.filter(
    (entry) => entry.isDirectory() && /^\d+$/.test(entry.name)
  ).length;

  let threads = null;
  if (loadavgRaw) {
    const parts = loadavgRaw.trim().split(/\s+/);
    if (parts.length >= 4) {
      const counts = parts[3].split("/");
      if (counts.length === 2) {
        const total = Number.parseInt(counts[1], 10);
        threads = Number.isNaN(total) ? null : total;
      }
    }
  }

  return { tasks, threads };
}

module.exports = function (RED) {
  function SystemMonitorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const group = RED.nodes.getNode(config.group);

    if (!group) {
      node.error("ui-group is required");
      return;
    }

    const base = group.getBase();
    group.register(node, config, {});

    const cpuSampler = CpuSampler.create();
    const memorySampler = MemorySampler.create();
    const diskSampler = DiskSampler.create();
    const networkSampler = NetworkSampler.create();
    const gpuSampler = GpuSampler.create();
    const processSampler = ProcessSampler.create();
    const updateInterval = Math.max(
      250,
      Number.parseInt(config.updateInterval, 10) || 1000
    );

    let timer = null;
    let busy = false;
    let lastTaskThreadUpdate = 0;
    let lastTaskThread = { tasks: null, threads: null };
    let lastMemory = { ram: null, swap: null };
    let lastDisk = { summary: null, items: [] };
    let lastNetwork = { summary: null, items: [] };
    let lastGpu = { available: null, summary: null, gpus: [], processes: [] };
    let lastProcesses = { summary: null, items: [] };

    async function tick() {
      if (busy) {
        return;
      }
      busy = true;

      try {
        const now = Date.now();
        const cpu = cpuSampler.getMetrics();
        const needsTaskThreadRefresh =
          now - lastTaskThreadUpdate >= TASK_THREAD_REFRESH_MS;
        const memoryPromise = memorySampler.getMetrics();
        const diskPromise = diskSampler.getMetrics();
        const networkPromise = networkSampler.getMetrics();
        const gpuPromise = gpuSampler.getMetrics();
        const processesPromise = processSampler.getMetrics();
        const taskThreadPromise = needsTaskThreadRefresh
          ? getTaskThreadCounts()
          : null;

        try {
          lastMemory = await memoryPromise;
        } catch (err) {
          node.debug?.(`memory read failed: ${err.message}`);
        }

        try {
          lastDisk = await diskPromise;
        } catch (err) {
          node.debug?.(`disk read failed: ${err.message}`);
        }
        try {
          lastNetwork = await networkPromise;
        } catch (err) {
          node.debug?.(`network read failed: ${err.message}`);
        }
        try {
          lastGpu = await gpuPromise;
        } catch (err) {
          node.debug?.(`gpu read failed: ${err.message}`);
        }
        try {
          lastProcesses = await processesPromise;
        } catch (err) {
          node.debug?.(`process read failed: ${err.message}`);
        }

        if (needsTaskThreadRefresh) {
          try {
            lastTaskThread = await taskThreadPromise;
          } catch (err) {
            node.debug?.(`task/thread read failed: ${err.message}`);
          }
          lastTaskThreadUpdate = now;
        }

        const payload = {
          cpu: {
            ...cpu,
            tasks: lastTaskThread.tasks,
            threads: lastTaskThread.threads,
          },
          memory: lastMemory,
          disk: lastDisk,
          network: lastNetwork,
          gpu: lastGpu,
          processes: lastProcesses,
        };

        const msg = { payload };
        if (base?.stores?.data?.save) {
          base.stores.data.save(base, node, msg);
        }
        base.emit(`msg-input:${node.id}`, msg, node);
      } finally {
        busy = false;
      }
    }

    timer = setInterval(tick, updateInterval);
    tick();

    node.on("close", function (removed, done) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      done();
    });
  }

  RED.nodes.registerType("ui-system-monitor", SystemMonitorNode);
};
