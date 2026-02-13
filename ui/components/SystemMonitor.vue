<template>
  <div class="ui-system-monitor">
    <v-card class="monitor-card bg-white" elevation="0">
      <div class="monitor-header card-title">
        <span class="monitor-title">{{ widgetTitle }}</span>
      </div>

      <div class="cpu-grid" :style="cpuGridStyle">
        <template v-if="cpuCells.length">
          <div v-for="cell in cpuCells" :key="cell.key" class="cpu-cell">
            <span class="cpu-id">{{ cell.label }}</span>
            <div class="cpu-mini-bar">
              <div class="cpu-mini-fill" :style="meterStyle(cell.percent)" />
            </div>
            <span class="cpu-mini-value">{{ formatPercent(cell.percent) }}</span>
          </div>
        </template>
        <div v-else class="empty-text">Waiting for CPU data...</div>
      </div>

      <div class="bottom-grid">
        <div class="panel cpu-stats-panel">
          <div class="stat-row">
            <span class="stat-label">Tasks</span>
            <span class="stat-value">{{ tasks }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Threads</span>
            <span class="stat-value">{{ threads }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Load Avg</span>
            <span class="stat-value">{{ loadText }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Uptime</span>
            <span class="stat-value">{{ uptimeText }}</span>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">Memory</div>
          <div class="meter-row">
            <span class="meter-label">RAM</span>
            <div class="meter-bar">
              <div class="meter-fill" :style="meterStyle(ramPercent)" />
            </div>
            <span class="meter-value">{{ formatPercent(ramPercent) }}</span>
            <span class="meter-detail">{{ ramUsageLabel }}</span>
          </div>
          <div class="meter-row">
            <span class="meter-label">SWAP</span>
            <div class="meter-bar">
              <div class="meter-fill" :style="meterStyle(swapPercent)" />
            </div>
            <span class="meter-value">{{ formatPercent(swapPercent) }}</span>
            <span class="meter-detail">{{ swapUsageLabel }}</span>
          </div>
        </div>
      </div>

      <div class="io-grid">
        <div class="panel network-panel">
          <div class="panel-title">Network</div>
          <div v-if="networkItems.length" class="network-table">
            <div class="network-row network-head">
              <span class="net-col iface">Iface</span>
              <span class="net-col state">State</span>
              <span class="net-col cap">Link</span>
              <span class="net-col rate">Down/s</span>
              <span class="net-col rate">Up/s</span>
              <span class="net-col total">Rx Total</span>
              <span class="net-col total">Tx Total</span>
            </div>

            <div v-for="item in networkItems" :key="item.iface" class="network-row">
              <span class="net-col iface">{{ item.iface }}</span>
              <span class="net-col state" :class="item.state === 'up' ? 'state-up' : 'state-down'">
                {{ item.state }}
              </span>
              <span class="net-col cap">{{ formatLinkCapacity(item.speedMbps) }}</span>
              <span class="net-col rate">{{ formatRate(item.rxBps) }}</span>
              <span class="net-col rate">{{ formatRate(item.txBps) }}</span>
              <span class="net-col total">{{ formatBytes(item.rxBytes) }}</span>
              <span class="net-col total">{{ formatBytes(item.txBytes) }}</span>
            </div>
          </div>
          <div v-else class="empty-text">Waiting for network data...</div>
        </div>

        <div class="panel disk-panel">
          <div class="panel-title">Disk</div>
          <div v-if="diskItems.length" class="disk-table">
            <div class="disk-row disk-head">
              <span class="disk-col mount">Mount</span>
              <span class="disk-col fs">FS</span>
              <span class="disk-col used">Used</span>
              <span class="disk-col used-bytes">Used</span>
              <span class="disk-col total-bytes">Total</span>
              <span class="disk-col rate">Read/s</span>
              <span class="disk-col rate">Write/s</span>
            </div>

            <div v-for="item in diskItems" :key="item.id" class="disk-row">
              <span class="disk-col mount" :title="item.source">{{ item.mountPoint }}</span>
              <span class="disk-col fs">{{ item.fsType }}</span>
              <div class="disk-col used used-col">
                <div class="disk-used-bar">
                  <div class="disk-used-fill" :style="meterStyle(item.usedPercent)" />
                </div>
              </div>
              <span class="disk-col used-bytes">{{ formatBytes(item.usedBytes) }}</span>
              <span class="disk-col total-bytes">{{ formatBytes(item.totalBytes) }}</span>
              <span class="disk-col rate">{{ formatRate(item.readBps) }}</span>
              <span class="disk-col rate">{{ formatRate(item.writeBps) }}</span>
            </div>
          </div>
          <div v-else class="empty-text">Waiting for disk data...</div>
        </div>
      </div>

      <div class="gpu-section">
        <div class="panel gpu-panel">
          <div class="panel-title">GPU</div>
          <div v-if="gpuUnavailableText" class="empty-text">{{ gpuUnavailableText }}</div>
          <template v-else>
            <div v-if="gpuItems.length" class="gpu-list">
              <div v-for="item in gpuItems" :key="item.uuid || item.index || item.name" class="gpu-card">
                <div class="gpu-card-title">
                  <span>{{ formatGpuLabel(item) }}</span>
                  <span v-if="item.name" class="gpu-card-name">{{ item.name }}</span>
                </div>

                <div class="gpu-metric">
                  <span class="gpu-metric-label">Utilization</span>
                  <div class="gpu-bar-row">
                    <div class="gpu-bar">
                      <div class="gpu-fill" :style="meterStyle(item.utilizationGpuPercent)" />
                    </div>
                    <span class="gpu-pct">{{ formatPercent(item.utilizationGpuPercent) }}</span>
                  </div>
                </div>

                <div class="gpu-metric">
                  <span class="gpu-metric-label">VRAM</span>
                  <div class="gpu-bar-row">
                    <div class="gpu-bar">
                      <div class="gpu-fill" :style="meterStyle(item.memoryUsedPercent)" />
                    </div>
                    <span class="gpu-pct">{{ formatPercent(item.memoryUsedPercent) }}</span>
                  </div>
                </div>

                <div class="gpu-info-grid">
                  <div class="gpu-info-item">
                    <span class="gpu-metric-label">Temp</span>
                    <span class="gpu-info-value">{{ formatTemp(item.temperatureC) }}</span>
                  </div>
                  <div class="gpu-info-item">
                    <span class="gpu-metric-label">Power</span>
                    <span class="gpu-info-value">{{ formatPower(item.powerDrawW, item.powerLimitW) }}</span>
                  </div>
                  <div class="gpu-info-item">
                    <span class="gpu-metric-label">Fan</span>
                    <span class="gpu-info-value">{{ formatPercent(item.fanPercent) }}</span>
                  </div>
                  <div class="gpu-info-item">
                    <span class="gpu-metric-label">P-State</span>
                    <span class="gpu-info-value">{{ item.pstate || '-' }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="empty-text">Waiting for GPU data...</div>

            <div v-if="gpuProcesses.length" class="gpu-proc">
              <div class="gpu-proc-title">GPU Processes</div>
              <div class="gpu-proc-row gpu-proc-head">
                <span class="gproc-col pid">PID</span>
                <span class="gproc-col name">Process</span>
                <span class="gproc-col gpu">GPU</span>
                <span class="gproc-col mem">VRAM</span>
              </div>
              <div
                v-for="proc in gpuProcesses"
                :key="`${proc.pid}-${proc.gpuUuid || proc.gpuIndex || 'x'}-${proc.processName}`"
                class="gpu-proc-row"
              >
                <span class="gproc-col pid">{{ proc.pid ?? '-' }}</span>
                <span class="gproc-col name" :title="proc.processName">{{ proc.processName }}</span>
                <span class="gproc-col gpu">{{ formatGpuProcLabel(proc) }}</span>
                <span class="gproc-col mem">{{ formatMiB(proc.usedMemoryMiB) }}</span>
              </div>
            </div>
          </template>
        </div>

        <div class="process-panel">
          <div v-if="sortedProcesses.length" class="process-table">
            <div class="process-row process-head">
              <span class="process-head-label proc-col pid numeric">PID</span>
              <span class="process-head-label proc-col user">User</span>
              <button
                type="button"
                class="process-sort proc-col virt numeric"
                :class="{ active: isProcessSortActive('virtBytes') }"
                @click="toggleProcessSort('virtBytes')"
              >
                <span>VIRT</span>
                <span v-if="isProcessSortActive('virtBytes')" class="sort-indicator">{{ processSortIndicator("virtBytes") }}</span>
              </button>
              <button
                type="button"
                class="process-sort proc-col res numeric"
                :class="{ active: isProcessSortActive('resBytes') }"
                @click="toggleProcessSort('resBytes')"
              >
                <span>RES</span>
                <span v-if="isProcessSortActive('resBytes')" class="sort-indicator">{{ processSortIndicator("resBytes") }}</span>
              </button>
              <button
                type="button"
                class="process-sort proc-col shr numeric"
                :class="{ active: isProcessSortActive('shrBytes') }"
                @click="toggleProcessSort('shrBytes')"
              >
                <span>SHR</span>
                <span v-if="isProcessSortActive('shrBytes')" class="sort-indicator">{{ processSortIndicator("shrBytes") }}</span>
              </button>
              <button
                type="button"
                class="process-sort proc-col cpu numeric"
                :class="{ active: isProcessSortActive('cpuPercent') }"
                @click="toggleProcessSort('cpuPercent')"
              >
                <span>CPU</span>
                <span v-if="isProcessSortActive('cpuPercent')" class="sort-indicator">{{ processSortIndicator("cpuPercent") }}</span>
              </button>
              <span class="process-head-label proc-col type">Type</span>
              <span class="process-head-label proc-col command">Command</span>
            </div>

            <div class="process-body">
              <div
                v-for="proc in sortedProcesses"
                :key="`${proc.pid}-${proc.command}`"
                class="process-row"
              >
                <span class="proc-col pid">{{ proc.pid ?? "-" }}</span>
                <span class="proc-col user">{{ proc.user || "-" }}</span>
                <span class="proc-col virt">{{ formatBytes(proc.virtBytes) }}</span>
                <span class="proc-col res">{{ formatBytes(proc.resBytes) }}</span>
                <span class="proc-col shr">{{ formatBytes(proc.shrBytes) }}</span>
                <span class="proc-col cpu">{{ formatCpuLoad(proc.cpuPercent) }}</span>
                <span class="proc-col type">
                  <span class="proc-type-badge" :class="processTypeBadgeClass(proc.type)">{{ proc.type || "-" }}</span>
                </span>
                <span class="proc-col command" :title="proc.command">{{ proc.command || "-" }}</span>
              </div>
            </div>
          </div>
          <div v-else class="empty-text">Waiting for process data...</div>
        </div>
      </div>
    </v-card>
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { useStore } from "vuex";

const props = defineProps({
  id: { type: String, required: true },
  props: { type: Object, default: () => ({}) },
});

const store = useStore();
const socket = inject("$socket", null);

const widgetTitle = computed(() => props.props?.name || "Usage / core");
const message = computed(() => store.state?.data?.messages?.[props.id] || null);
const cpu = computed(() => message.value?.payload?.cpu || null);
const memory = computed(() => message.value?.payload?.memory || null);
const disk = computed(() => message.value?.payload?.disk || null);
const network = computed(() => message.value?.payload?.network || null);
const gpu = computed(() => message.value?.payload?.gpu || null);
const processes = computed(() => message.value?.payload?.processes || null);

const ram = computed(() => memory.value?.ram || null);
const swap = computed(() => memory.value?.swap || null);
const ramPercent = computed(() => ram.value?.usedPercent ?? null);
const swapPercent = computed(() => swap.value?.usedPercent ?? null);

const tasks = computed(() => cpu.value?.tasks ?? "-");
const threads = computed(() => cpu.value?.threads ?? "-");
const loadText = computed(() => formatLoad(cpu.value?.loadAvg));
const uptimeText = computed(() => formatUptime(cpu.value?.uptimeSec));

const ramUsageLabel = computed(() => {
  if (!ram.value) return "-";
  return `${formatBytes(ram.value.usedBytes)} / ${formatBytes(ram.value.totalBytes)}`;
});

const swapUsageLabel = computed(() => {
  if (!swap.value) return "-";
  return `${formatBytes(swap.value.usedBytes)} / ${formatBytes(swap.value.totalBytes)}`;
});

const diskItems = computed(() => {
  const items = Array.isArray(disk.value?.items) ? disk.value.items : [];
  return items;
});

const networkItems = computed(() => {
  const items = Array.isArray(network.value?.items) ? network.value.items : [];
  return items;
});

const gpuItems = computed(() => {
  const items = Array.isArray(gpu.value?.gpus) ? gpu.value.gpus : [];
  return items;
});

const gpuProcesses = computed(() => {
  const items = Array.isArray(gpu.value?.processes) ? gpu.value.processes : [];
  return items;
});

const processItems = computed(() => {
  const items = Array.isArray(processes.value?.items) ? processes.value.items : [];
  return items;
});

const processSortKey = ref("cpuPercent");
const processSortableKeys = new Set([
  "virtBytes",
  "resBytes",
  "shrBytes",
  "cpuPercent",
]);

const sortedProcesses = computed(() => {
  const key = processSortKey.value;
  const items = [...processItems.value];

  items.sort((a, b) => {
    const valueA = getProcessSortValue(a, key);
    const valueB = getProcessSortValue(b, key);
    const cmp = compareNumericDesc(valueA, valueB);
    if (cmp !== 0) {
      return cmp;
    }

    const pidA = typeof a?.pid === "number" ? a.pid : Number.MAX_SAFE_INTEGER;
    const pidB = typeof b?.pid === "number" ? b.pid : Number.MAX_SAFE_INTEGER;
    return pidA - pidB;
  });

  return items;
});

const gpuUnavailableText = computed(() => {
  if (gpu.value?.available === false) {
    return gpu.value?.reason
      ? `GPU metrics unavailable (${gpu.value.reason})`
      : "GPU metrics unavailable.";
  }
  return "";
});

const cpuCells = computed(() => {
  const cells = [];
  if (typeof cpu.value?.overall === "number" && !Number.isNaN(cpu.value.overall)) {
    cells.push({ key: "avg", label: "AVG", percent: cpu.value.overall });
  }

  const cores = Array.isArray(cpu.value?.cores) ? cpu.value.cores : [];
  for (let index = 0; index < cores.length; index += 1) {
    cells.push({ key: `core-${index}`, label: `${index}`, percent: cores[index] });
  }

  return cells;
});

const cpuColumns = computed(() => getCpuColumns(cpuCells.value.length));
const cpuGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cpuColumns.value}, minmax(0, 1fr))`,
}));

function bindMessage(msg) {
  if (!msg) {
    return;
  }
  store.commit("data/bind", {
    widgetId: props.id,
    msg,
  });
}

function initializeSocket() {
  if (!socket) {
    return;
  }

  const widgetLoadEvent = `widget-load:${props.id}`;
  const inputEvent = `msg-input:${props.id}`;

  socket.on(widgetLoadEvent, (msg) => {
    bindMessage(msg);
  });

  socket.on(inputEvent, (msg) => {
    bindMessage(msg);
  });

  socket.emit("widget-load", props.id);
}

onMounted(() => {
  initializeSocket();
});

onBeforeUnmount(() => {
  if (!socket) {
    return;
  }

  socket.off(`widget-load:${props.id}`);
  socket.off(`msg-input:${props.id}`);
});

function toggleProcessSort(nextKey) {
  if (!processSortableKeys.has(nextKey)) {
    return;
  }
  processSortKey.value = nextKey;
}

function isProcessSortActive(key) {
  return processSortKey.value === key;
}

function processSortIndicator(key) {
  if (processSortKey.value !== key) {
    return "";
  }
  return "▼";
}

function processTypeBadgeClass(type) {
  const value = String(type || "").toUpperCase();
  if (value === "R") return "type-running";
  if (value === "S" || value === "I") return "type-sleeping";
  if (value === "D") return "type-waiting";
  if (value === "Z") return "type-zombie";
  if (value === "T") return "type-stopped";
  return "type-other";
}

function getProcessSortValue(item, key) {
  if (!item) {
    return null;
  }

  switch (key) {
    case "virtBytes":
      return item.virtBytes;
    case "resBytes":
      return item.resBytes;
    case "shrBytes":
      return item.shrBytes;
    case "cpuPercent":
      return item.cpuPercent;
    default:
      return null;
  }
}

function compareNumericDesc(a, b) {
  const valueA = typeof a === "number" && Number.isFinite(a) ? a : Number.NEGATIVE_INFINITY;
  const valueB = typeof b === "number" && Number.isFinite(b) ? b : Number.NEGATIVE_INFINITY;
  if (valueA > valueB) return -1;
  if (valueA < valueB) return 1;
  return 0;
}

function clampPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value) {
  const safeValue = clampPercent(value);
  if (safeValue === null) {
    return "-";
  }
  return `${safeValue.toFixed(0)}%`;
}

function formatCpuLoad(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return "-";
  }

  const decimals = value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)}%`;
}

function meterStyle(value) {
  const safeValue = clampPercent(value);
  return {
    width: safeValue === null ? "0%" : `${safeValue}%`,
    opacity: safeValue === null ? 0.2 : 1,
    backgroundColor: usageColor(safeValue),
  };
}

function usageColor(percent) {
  if (percent === null) {
    return "rgba(0, 0, 0, 0.18)";
  }
  if (percent < 50) {
    return "#2ca7ff";
  }
  if (percent < 70) {
    return "#f1c40f";
  }
  if (percent < 85) {
    return "#f39c12";
  }
  return "#e74c3c";
}

function formatUptime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) {
    return "-";
  }

  let remaining = Math.floor(seconds);
  const days = Math.floor(remaining / 86400);
  remaining -= days * 86400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || parts.length) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatLoad(loadAvg) {
  if (!Array.isArray(loadAvg) || loadAvg.length < 3) {
    return "-";
  }
  return loadAvg.slice(0, 3).map((value) => Number(value).toFixed(2)).join(" ");
}

function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) {
    return "-";
  }
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatRate(bytesPerSecond) {
  if (
    typeof bytesPerSecond !== "number" ||
    Number.isNaN(bytesPerSecond) ||
    bytesPerSecond < 0
  ) {
    return "-";
  }
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatLinkCapacity(speedMbps) {
  if (
    typeof speedMbps !== "number" ||
    Number.isNaN(speedMbps) ||
    speedMbps <= 0
  ) {
    return "-";
  }

  if (speedMbps >= 1000) {
    const gbps = speedMbps / 1000;
    const decimals = gbps >= 10 ? 0 : 1;
    return `${gbps.toFixed(decimals)} Gbps`;
  }

  return `${speedMbps} Mbps`;
}

function formatMiB(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return "-";
  }
  return `${value.toFixed(0)} MiB`;
}

function formatTemp(valueC) {
  if (typeof valueC !== "number" || Number.isNaN(valueC)) {
    return "-";
  }
  return `${valueC.toFixed(0)} C`;
}

function formatPower(drawW, limitW) {
  if (typeof drawW !== "number" || Number.isNaN(drawW)) {
    return "-";
  }
  if (typeof limitW === "number" && !Number.isNaN(limitW) && limitW > 0) {
    return `${drawW.toFixed(0)}/${limitW.toFixed(0)}W`;
  }
  return `${drawW.toFixed(0)}W`;
}

function formatGpuLabel(item) {
  if (!item) {
    return "-";
  }
  if (typeof item.index === "number" && !Number.isNaN(item.index)) {
    return `GPU${item.index}`;
  }
  return item.name || "-";
}

function formatGpuProcLabel(proc) {
  if (typeof proc?.gpuIndex === "number" && !Number.isNaN(proc.gpuIndex)) {
    return `GPU${proc.gpuIndex}`;
  }
  return "-";
}

function getCpuColumns(cpuCount) {
  if (cpuCount <= 2) return cpuCount || 1;
  if (cpuCount <= 8) return 4;
  if (cpuCount <= 16) return 6;
  if (cpuCount <= 32) return 8;
  return 10;
}
</script>

<style scoped>
.ui-system-monitor {
  width: 100%;
  height: 100%;
}

.monitor-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 8px;
  border: 1px solid #d4deef;
  border-radius: 7px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.monitor-header {
  border-bottom: 2px solid #17356e;
  padding-bottom: 4px;
}

.card-title {
  color: #17356e;
  font-weight: 700;
}

.monitor-title {
  font-size: 13px;
}

.cpu-grid {
  display: grid;
  gap: 2px 5px;
}

.cpu-cell {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.cpu-id {
  width: 30px;
  font-size: 10px;
  color: rgba(0, 0, 0, 0.75);
  text-transform: uppercase;
}

.cpu-mini-bar {
  position: relative;
  width: 74px;
  height: 8px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.08);
}

.cpu-mini-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 6px;
  transition: width 140ms linear, background-color 140ms linear;
}

.cpu-mini-value {
  width: 24px;
  font-size: 10px;
  text-align: right;
  color: rgba(0, 0, 0, 0.75);
}

.empty-text {
  grid-column: 1 / -1;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.65);
}

.bottom-grid {
  display: grid;
  grid-template-columns: minmax(200px, 35fr) minmax(280px, 65fr);
  gap: 8px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 7px;
}

.cpu-stats-panel {
  border: 0;
  border-radius: 0;
}

.panel-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #17356e;
}

.meter-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meter-label {
  width: 46px;
  font-size: 11px;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.75);
}

.meter-bar {
  position: relative;
  flex: 1;
  height: 8px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.08);
}

.meter-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 6px;
  transition: width 140ms linear, background-color 140ms linear;
}

.meter-value {
  width: 38px;
  font-size: 11px;
  text-align: right;
  color: rgba(0, 0, 0, 0.75);
}

.meter-detail {
  min-width: 74px;
  font-size: 11px;
  text-align: right;
  color: rgba(0, 0, 0, 0.75);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
}

.stat-label {
  color: rgba(0, 0, 0, 0.65);
}

.stat-value {
  color: rgba(0, 0, 0, 0.9);
}

.io-grid {
  display: grid;
  grid-template-columns: minmax(240px, 35fr) minmax(320px, 65fr);
  gap: 8px;
}

.disk-panel,
.network-panel {
  gap: 6px;
}

.disk-table,
.network-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.disk-row {
  display: grid;
  grid-template-columns: minmax(86px, 1.6fr) 40px minmax(80px, 1.3fr) 62px 62px 62px 62px;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  font-size: 10px;
}

.disk-head,
.network-head,
.process-head,
.gpu-proc-head {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 0, 0, 0.6);
}

.disk-col,
.net-col,
.gproc-col {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.disk-col.mount {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.disk-col.fs,
.disk-col.used-bytes,
.disk-col.total-bytes,
.disk-col.rate,
.net-col.rate,
.net-col.cap,
.net-col.total,
.net-col.state,
.gproc-col.mem,
.gproc-col.gpu,
.gproc-col.pid {
  color: rgba(0, 0, 0, 0.78);
}

.used-col {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-right: 4px;
}

.disk-used-bar,
.gpu-bar {
  position: relative;
  flex: 1;
  height: 7px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.08);
}

.disk-used-fill,
.gpu-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 6px;
  transition: width 140ms linear, background-color 140ms linear;
}

.gpu-pct {
  width: 34px;
  text-align: right;
  color: rgba(0, 0, 0, 0.78);
}

.network-row {
  display: grid;
  grid-template-columns: minmax(56px, 1.1fr) 40px 56px 68px 68px 68px 68px;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  font-size: 10px;
}

.state-up {
  color: #0d8f39;
}

.state-down {
  color: #c23b22;
}

.gpu-section {
  display: grid;
  grid-template-columns: minmax(240px, 35fr) minmax(320px, 65fr);
  gap: 8px;
}

.gpu-panel {
  grid-column: 1;
  gap: 6px;
}

.process-panel {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.process-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.95);
}

.process-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 330px;
  overflow: auto;
  padding-right: 1px;
}

.process-row {
  display: grid;
  grid-template-columns: 44px 66px 70px 70px 70px 52px 42px minmax(140px, 1fr);
  align-items: center;
  gap: 5px;
  min-height: 20px;
  font-size: 10px;
  padding: 1px 4px;
}

.process-head {
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(243, 247, 252, 0.98);
}

.process-body .process-row {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.process-body .process-row:nth-child(odd) {
  background: rgba(0, 0, 0, 0.014);
}

.process-body .process-row:hover {
  background: rgba(23, 53, 110, 0.06);
}

.process-head-label {
  display: flex;
  align-items: center;
  width: 100%;
  color: rgba(0, 0, 0, 0.52);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.process-head-label.numeric {
  justify-content: flex-end;
  text-align: right;
}

.process-sort {
  border: 0;
  padding: 0;
  margin: 0;
  background: none;
  font: inherit;
  color: rgba(0, 0, 0, 0.52);
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.process-sort.numeric {
  justify-content: flex-end;
  text-align: right;
}

.process-sort.active {
  color: #17356e;
  font-weight: 700;
}

.sort-indicator {
  font-size: 9px;
  line-height: 1;
}

.proc-col {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proc-col.pid,
.proc-col.virt,
.proc-col.res,
.proc-col.shr,
.proc-col.cpu {
  color: rgba(0, 0, 0, 0.78);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.proc-col.user,
.proc-col.command {
  color: rgba(0, 0, 0, 0.74);
}

.proc-col.type {
  display: flex;
  justify-content: center;
}

.proc-type-badge {
  display: inline-flex;
  justify-content: center;
  min-width: 14px;
  padding: 1px 4px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.04);
  font-size: 9px;
  line-height: 1.1;
  color: rgba(0, 0, 0, 0.76);
}

.proc-type-badge.type-running {
  border-color: rgba(13, 143, 57, 0.35);
  background: rgba(13, 143, 57, 0.12);
  color: #0d8f39;
}

.proc-type-badge.type-sleeping {
  border-color: rgba(23, 53, 110, 0.25);
  background: rgba(23, 53, 110, 0.1);
  color: #17356e;
}

.proc-type-badge.type-waiting {
  border-color: rgba(177, 103, 0, 0.35);
  background: rgba(177, 103, 0, 0.12);
  color: #8a5a00;
}

.proc-type-badge.type-zombie {
  border-color: rgba(178, 40, 40, 0.35);
  background: rgba(178, 40, 40, 0.1);
  color: #a12828;
}

.proc-type-badge.type-stopped {
  border-color: rgba(95, 102, 112, 0.35);
  background: rgba(95, 102, 112, 0.12);
  color: #5f6670;
}

.proc-type-badge.type-other {
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.72);
}

.gpu-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gpu-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.02);
}

.gpu-card-title {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: baseline;
  font-size: 11px;
  font-weight: 700;
  color: #17356e;
}

.gpu-card-name {
  font-size: 10px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.65);
}

.gpu-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gpu-metric-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 0, 0, 0.6);
}

.gpu-bar-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.gpu-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 6px;
}

.gpu-info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gpu-info-value {
  font-size: 10px;
  color: rgba(0, 0, 0, 0.78);
}

.gpu-proc {
  margin-top: 3px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gpu-proc-title {
  font-size: 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 2px;
}

.gpu-proc-row {
  display: grid;
  grid-template-columns: 52px minmax(140px, 1fr) 52px 76px;
  align-items: center;
  gap: 5px;
  min-height: 20px;
  font-size: 10px;
}

@media (max-width: 960px) {
  .cpu-mini-bar {
    width: 64px;
  }
}

@media (max-width: 780px) {
  .cpu-mini-bar {
    width: 50px;
  }

  .cpu-id {
    width: 27px;
  }
}

@media (max-width: 680px) {
  .bottom-grid {
    grid-template-columns: 1fr;
  }

  .io-grid {
    grid-template-columns: 1fr;
  }

  .disk-row {
    grid-template-columns: minmax(74px, 1.4fr) 34px minmax(72px, 1.2fr) 56px 56px 56px 56px;
    font-size: 10px;
  }

  .network-row {
    grid-template-columns: minmax(64px, 1.2fr) 36px 52px 64px 64px 64px 64px;
    font-size: 10px;
  }

  .gpu-section {
    grid-template-columns: 1fr;
  }

  .process-panel {
    grid-column: 1;
  }

  .gpu-info-grid {
    grid-template-columns: 1fr;
  }

  .process-row {
    grid-template-columns: 44px 64px 68px 68px 68px 52px 40px minmax(130px, 1fr);
    font-size: 10px;
  }

  .gpu-proc-row {
    grid-template-columns: 50px minmax(120px, 1fr) 50px 72px;
    font-size: 10px;
  }

  .disk-head,
  .network-head,
  .process-head,
  .gpu-proc-head {
    font-size: 9px;
  }
}
</style>
