const EXACT_STATUS_COLORS: Record<string, 'green' | 'red' | 'yellow' | 'blue' | 'gray'> = {
  running: 'green',
  active: 'green',
  ready: 'green',
  deployed: 'green',
  completed: 'green',
  success: 'green',
  succeeded: 'green',
  normal: 'green',
  admitted: 'green',
  bound: 'blue',
  pending: 'yellow',
  waiting: 'yellow',
  terminating: 'yellow',
  warning: 'yellow',
  init: 'yellow',
  degraded: 'yellow',
  superseded: 'yellow',
  crashloopbackoff: 'red',
  error: 'red',
  failed: 'red',
  unhealthy: 'red',
  notready: 'red',
  unknown: 'red',
  evicted: 'red',
};

const BYTE_SIZES = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
const LN1024 = Math.log(1024);

export function formatAge(dateStringOrSeconds: string | Date | number | undefined): string {
  if (!dateStringOrSeconds) return '-';
  
  let timeMs: number;
  if (typeof dateStringOrSeconds === 'number') {
    timeMs = dateStringOrSeconds;
  } else if (typeof dateStringOrSeconds === 'string') {
    timeMs = Date.parse(dateStringOrSeconds);
  } else if (dateStringOrSeconds instanceof Date) {
    timeMs = dateStringOrSeconds.getTime();
  } else {
    return '-';
  }

  if (isNaN(timeMs) || timeMs <= 0) return '-';

  const diffMs = Date.now() - timeMs;
  if (diffMs < 0) return '0s';

  const diffSeconds = (diffMs / 1000) | 0;
  if (diffSeconds < 60) return `${diffSeconds}s`;

  const diffMinutes = (diffSeconds / 60) | 0;
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = (diffMinutes / 60) | 0;
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = (diffHours / 24) | 0;
  if (diffDays < 7) return `${diffDays}d`;

  const diffWeeks = (diffDays / 7) | 0;
  if (diffWeeks < 52) return `${diffWeeks}w`;

  const diffYears = (diffDays / 365) | 0;
  return `${diffYears}y`;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '-';
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '-';

  const i = Math.min(Math.floor(Math.log(bytes) / LN1024), BYTE_SIZES.length - 1);
  const val = bytes / Math.pow(1024, i);

  return `${Number(val.toFixed(1))} ${BYTE_SIZES[i]}`;
}

export function getStatusColor(status: string): 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'magenta' | 'cyan' {
  if (!status) return 'gray';
  const s = status.toLowerCase();
  const direct = EXACT_STATUS_COLORS[s];
  if (direct) return direct;

  if (s.includes('crash') || s.includes('error') || s.includes('failed') || s.includes('unhealthy') || s.includes('unknown') || s.includes('evicted')) {
    return 'red';
  }
  if (s.includes('pending') || s.includes('init') || s.includes('terminating') || s.includes('waiting') || s.includes('containercreating') || s.includes('warning') || s.includes('superseded')) {
    return 'yellow';
  }
  if (s.includes('completed') || s.includes('bound')) {
    return 'blue';
  }
  return 'gray';
}

export function truncate(str: string, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

export function padRight(str: string, length: number): string {
  const s = str || '';
  if (s.length >= length) return s.slice(0, length);
  return s.padEnd(length, ' ');
}
