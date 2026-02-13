<template>
  <div class="ui-system-monitor">
    <v-card class="monitor-card bg-white" elevation="0">
      <div class="monitor-header card-title">
        <span class="monitor-title">{{ widgetTitle }}</span>
      </div>

      <div class="cpu-grid" :style="cpuGridStyle">
        <template v-if="cpuCells.length">
          <div
            v-for="cell in cpuCells"
            :key="cell.key"
            class="cpu-cell"
          >
            <span class="cpu-id">{{ cell.label }}</span>
            <div class="cpu-mini-bar">
              <div
                class="cpu-mini-fill"
                :style="meterStyle(cell.percent)"
              />
            </div>
            <span class="cpu-mini-value">{{ formatPercent(cell.percent) }}</span>
          </div>
        </template>
        <div v-else class="empty-text">Waiting for CPU data...</div>
      </div>

      <div class="bottom-grid">
        <div class="panel">
          <div class="panel-title">Memory</div>
          <div class="meter-row">
            <span class="meter-label">RAM</span>
            <div class="meter-bar">
              <div
                class="meter-fill"
                :style="meterStyle(ramPercent)"
              />
            </div>
            <span class="meter-value">{{ formatPercent(ramPercent) }}</span>
            <span class="meter-detail">{{ ramUsageLabel }}</span>
          </div>
          <div class="meter-row">
            <span class="meter-label">SWAP</span>
            <div class="meter-bar">
              <div
                class="meter-fill"
                :style="meterStyle(swapPercent)"
              />
            </div>
            <span class="meter-value">{{ formatPercent(swapPercent) }}</span>
            <span class="meter-detail">{{ swapUsageLabel }}</span>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">CPU Stats</div>
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
      </div>

      <div class="io-grid">
        <div class="panel disk-panel">
          <div class="panel-title">Disk</div>
          <div v-if="diskItems.length" class="disk-table">
            <div class="disk-row disk-head">
              <span class="disk-col mount">Mount</span>
              <span class="disk-col fs">FS</span>
              <span class="disk-col used">Used</span>
              <span class="disk-col free">Free</span>
              <span class="disk-col rate">Read/s</span>
              <span class="disk-col rate">Write/s</span>
            </div>

            <div
              v-for="item in diskItems"
              :key="item.id"
              class="disk-row"
            >
              <span class="disk-col mount" :title="item.source">{{ item.mountPoint }}</span>
              <span class="disk-col fs">{{ item.fsType }}</span>
              <div class="disk-col used used-col">
                <div class="disk-used-bar">
                  <div class="disk-used-fill" :style="meterStyle(item.usedPercent)" />
                </div>
                <span class="disk-used-pct">{{ formatPercent(item.usedPercent) }}</span>
              </div>
              <span class="disk-col free">{{ formatBytes(item.freeBytes) }}</span>
              <span class="disk-col rate">{{ formatRate(item.readBps) }}</span>
              <span class="disk-col rate">{{ formatRate(item.writeBps) }}</span>
            </div>
          </div>
          <div v-else class="empty-text">Waiting for disk data...</div>
        </div>

        <div class="panel network-panel">
          <div class="panel-title">Network</div>
          <div v-if="networkItems.length" class="network-table">
            <div class="network-row network-head">
              <span class="net-col iface">Iface</span>
              <span class="net-col state">State</span>
              <span class="net-col rate">Down/s</span>
              <span class="net-col rate">Up/s</span>
              <span class="net-col total">Rx Total</span>
              <span class="net-col total">Tx Total</span>
            </div>

            <div
              v-for="item in networkItems"
              :key="item.iface"
              class="network-row"
            >
              <span class="net-col iface">{{ item.iface }}</span>
              <span class="net-col state" :class="item.state === 'up' ? 'state-up' : 'state-down'">
                {{ item.state }}
              </span>
              <span class="net-col rate">{{ formatRate(item.rxBps) }}</span>
              <span class="net-col rate">{{ formatRate(item.txBps) }}</span>
              <span class="net-col total">{{ formatBytes(item.rxBytes) }}</span>
              <span class="net-col total">{{ formatBytes(item.txBytes) }}</span>
            </div>
          </div>
          <div v-else class="empty-text">Waiting for network data...</div>
        </div>
      </div>
    </v-card>
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted } from "vue";
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
  gap: 10px;
  height: 100%;
  padding: 10px;
  border: 1px solid #d4deef;
  border-radius: 8px;
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
  font-size: 14px;
}

.cpu-grid {
  display: grid;
  gap: 3px 6px;
}

.cpu-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.cpu-id {
  width: 34px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.75);
  text-transform: uppercase;
}

.cpu-mini-bar {
  position: relative;
  width: 84px;
  height: 10px;
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
  width: 28px;
  font-size: 11px;
  text-align: right;
  color: rgba(0, 0, 0, 0.75);
}

.empty-text {
  grid-column: 1 / -1;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
}

.bottom-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr);
  gap: 10px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #17356e;
}

.meter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meter-label {
  width: 52px;
  font-size: 12px;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.75);
}

.meter-bar {
  position: relative;
  flex: 1;
  height: 10px;
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
  width: 42px;
  font-size: 12px;
  text-align: right;
  color: rgba(0, 0, 0, 0.75);
}

.meter-detail {
  min-width: 84px;
  font-size: 12px;
  text-align: right;
  color: rgba(0, 0, 0, 0.75);
}

.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.stat-label {
  color: rgba(0, 0, 0, 0.65);
}

.stat-value {
  color: rgba(0, 0, 0, 0.9);
}

.disk-panel {
  gap: 8px;
}

.io-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
  gap: 10px;
}

.disk-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.disk-row {
  display: grid;
  grid-template-columns: minmax(100px, 1.8fr) 52px minmax(110px, 1.5fr) 72px 72px 72px;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  font-size: 11px;
}

.disk-head {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 0, 0, 0.6);
}

.disk-col {
  min-width: 0;
}

.disk-col.mount {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.disk-col.fs,
.disk-col.free,
.disk-col.rate {
  color: rgba(0, 0, 0, 0.78);
}

.used-col {
  display: flex;
  align-items: center;
  gap: 6px;
}

.disk-used-bar {
  position: relative;
  flex: 1;
  height: 8px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.08);
}

.disk-used-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 6px;
  transition: width 140ms linear, background-color 140ms linear;
}

.disk-used-pct {
  width: 38px;
  text-align: right;
  color: rgba(0, 0, 0, 0.78);
}

.network-panel {
  gap: 8px;
}

.network-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.network-row {
  display: grid;
  grid-template-columns: minmax(70px, 1.2fr) 44px 74px 74px 74px 74px;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  font-size: 11px;
}

.network-head {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(0, 0, 0, 0.6);
}

.net-col {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.net-col.rate,
.net-col.total,
.net-col.state {
  color: rgba(0, 0, 0, 0.78);
}

.state-up {
  color: #0d8f39;
}

.state-down {
  color: #c23b22;
}

@media (max-width: 960px) {
  .cpu-mini-bar {
    width: 70px;
  }
}

@media (max-width: 780px) {
  .cpu-mini-bar {
    width: 56px;
  }

  .cpu-id {
    width: 30px;
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
    grid-template-columns: minmax(90px, 1.6fr) 44px minmax(96px, 1.4fr) 64px 64px 64px;
    gap: 6px;
    font-size: 10px;
  }

  .disk-head {
    font-size: 10px;
  }

  .network-row {
    grid-template-columns: minmax(70px, 1.2fr) 40px 64px 64px 64px 64px;
    font-size: 10px;
  }

  .network-head {
    font-size: 9px;
  }
}
</style>
