const { createCpuSampler } = require("./lib/cpu");
const getCpu = createCpuSampler();

setInterval(() => {
const cpu = getCpu();
console.log(cpu)
// cpu.overall, cpu.cores, cpu.uptimeSec, cpu.intervalMs
}, 1000);
