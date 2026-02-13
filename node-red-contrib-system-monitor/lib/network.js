"use strict";

const fs = require("fs/promises");
const path = require("path");
const Sampler = require("./sampler");

const PROC_NET_DEV_PATH = "/proc/net/dev";
const SYS_CLASS_NET_PATH = "/sys/class/net";

const DEFAULT_OPTIONS = {
  metadataRefreshMs: 5000,
};

const IGNORED_INTERFACE_RE =
  /^(lo|docker\d+|veth.*|br-.*|virbr.*|vmnet.*|zt.*|tailscale.*|tun.*|tap.*|flannel.*|cni.*|cali.*)$/;

function parseNetDev(raw) {
  const lines = raw.split("\n");
  const items = [];

  for (let i = 2; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const splitIdx = line.indexOf(":");
    if (splitIdx < 0) {
      continue;
    }

    const iface = line.slice(0, splitIdx).trim();
    if (!iface || IGNORED_INTERFACE_RE.test(iface)) {
      continue;
    }

    const fields = line
      .slice(splitIdx + 1)
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10));
    if (fields.length < 16 || fields.some((value) => Number.isNaN(value))) {
      continue;
    }

    items.push({
      iface,
      rxBytes: fields[0],
      rxPackets: fields[1],
      rxErrors: fields[2],
      rxDrops: fields[3],
      txBytes: fields[8],
      txPackets: fields[9],
      txErrors: fields[10],
      txDrops: fields[11],
    });
  }

  return items;
}

async function readText(filePath) {
  try {
    const value = await fs.readFile(filePath, "utf8");
    return value.trim();
  } catch (_err) {
    return null;
  }
}

class NetworkSampler extends Sampler {
  constructor(options = {}) {
    super();
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.prevCounters = new Map();
    this.metadata = new Map();
    this.lastMetadataRefresh = 0;
  }

  async refreshMetadata(ifaces, now) {
    const needsRefresh =
      now - this.lastMetadataRefresh >= this.options.metadataRefreshMs;
    const missingIface = ifaces.some((iface) => !this.metadata.has(iface));
    if (!needsRefresh && !missingIface) {
      return;
    }

    const entries = await Promise.all(
      ifaces.map(async (iface) => {
        const ifacePath = path.join(SYS_CLASS_NET_PATH, iface);
        const [stateRaw, speedRaw] = await Promise.all([
          readText(path.join(ifacePath, "operstate")),
          readText(path.join(ifacePath, "speed")),
        ]);

        const speedMbpsParsed = Number.parseInt(speedRaw || "", 10);
        const speedMbps =
          Number.isFinite(speedMbpsParsed) && speedMbpsParsed > 0
            ? speedMbpsParsed
            : null;

        return [
          iface,
          {
            state: stateRaw || "unknown",
            speedMbps,
          },
        ];
      })
    );

    this.metadata = new Map(entries);
    this.lastMetadataRefresh = now;
  }

  async getMetrics() {
    const now = Date.now();
    const netDevRaw = await fs.readFile(PROC_NET_DEV_PATH, "utf8");
    const counters = parseNetDev(netDevRaw);
    const ifaces = counters.map((item) => item.iface);
    await this.refreshMetadata(ifaces, now);

    let rxBpsSum = 0;
    let txBpsSum = 0;
    const items = [];

    for (let i = 0; i < counters.length; i += 1) {
      const counter = counters[i];
      const previous = this.prevCounters.get(counter.iface) || null;
      const meta = this.metadata.get(counter.iface) || {
        state: "unknown",
        speedMbps: null,
      };

      let rxBps = null;
      let txBps = null;
      if (previous && previous.timestamp < now) {
        const elapsedSec = (now - previous.timestamp) / 1000;
        const rxDelta = counter.rxBytes - previous.rxBytes;
        const txDelta = counter.txBytes - previous.txBytes;
        if (elapsedSec > 0 && rxDelta >= 0 && txDelta >= 0) {
          rxBps = rxDelta / elapsedSec;
          txBps = txDelta / elapsedSec;
        }
      }

      if (typeof rxBps === "number" && !Number.isNaN(rxBps)) {
        rxBpsSum += rxBps;
      }
      if (typeof txBps === "number" && !Number.isNaN(txBps)) {
        txBpsSum += txBps;
      }

      items.push({
        iface: counter.iface,
        state: meta.state,
        speedMbps: meta.speedMbps,
        rxBytes: counter.rxBytes,
        txBytes: counter.txBytes,
        rxPackets: counter.rxPackets,
        txPackets: counter.txPackets,
        rxErrors: counter.rxErrors,
        txErrors: counter.txErrors,
        rxDrops: counter.rxDrops,
        txDrops: counter.txDrops,
        rxBps,
        txBps,
      });
    }

    this.prevCounters = new Map(
      counters.map((counter) => [
        counter.iface,
        {
          rxBytes: counter.rxBytes,
          txBytes: counter.txBytes,
          timestamp: now,
        },
      ])
    );

    items.sort((a, b) => {
      const aLoad =
        (typeof a.rxBps === "number" ? a.rxBps : 0) +
        (typeof a.txBps === "number" ? a.txBps : 0);
      const bLoad =
        (typeof b.rxBps === "number" ? b.rxBps : 0) +
        (typeof b.txBps === "number" ? b.txBps : 0);
      if (bLoad !== aLoad) {
        return bLoad - aLoad;
      }
      return a.iface.localeCompare(b.iface);
    });

    return {
      timestamp: now,
      summary: {
        interfaces: items.length,
        rxBps: rxBpsSum,
        txBps: txBpsSum,
      },
      items,
    };
  }
}

module.exports = {
  NetworkSampler,
};
