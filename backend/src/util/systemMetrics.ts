import os from 'node:os';

let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();

export interface SystemMetrics {
  process: {
    uptimeSeconds: number;
    pid: number;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
    /** CPU since last sample, as % of one core (can go over 100). */
    cpuPercent: number;
  };
  host: {
    hostname: string;
    platform: string;
    uptimeSeconds: number;
    loadAverage: [number, number, number];
    cpuCount: number;
    memory: {
      total: number;
      free: number;
      used: number;
      usedPercent: number;
    };
  };
}

export function getSystemMetrics(): SystemMetrics {
  const now = Date.now();
  const delta = process.cpuUsage(lastCpu);
  const elapsedUs = Math.max(1, (now - lastCpuAt) * 1000);
  const cpuPercent = ((delta.user + delta.system) / elapsedUs) * 100;
  lastCpu = process.cpuUsage();
  lastCpuAt = now;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const mem = process.memoryUsage();
  const load = os.loadavg() as [number, number, number];

  return {
    process: {
      uptimeSeconds: process.uptime(),
      pid: process.pid,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      cpuPercent: Math.round(cpuPercent * 10) / 10,
    },
    host: {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      uptimeSeconds: os.uptime(),
      loadAverage: load,
      cpuCount: os.cpus().length,
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usedPercent: Math.round((usedMem / totalMem) * 1000) / 10,
      },
    },
  };
}
