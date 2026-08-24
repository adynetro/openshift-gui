export function formatAge(dateStringOrSeconds: string | Date | number | undefined): string {
  if (!dateStringOrSeconds) return '-';
  
  let date: Date;
  if (typeof dateStringOrSeconds === 'number') {
    date = new Date(dateStringOrSeconds);
  } else if (typeof dateStringOrSeconds === 'string') {
    date = new Date(dateStringOrSeconds);
  } else {
    date = dateStringOrSeconds;
  }

  if (isNaN(date.getTime())) return '-';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '0s';

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 52) return `${diffWeeks}w`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y`;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '-';
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getStatusColor(status: string): 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'magenta' | 'cyan' {
  const s = (status || '').toLowerCase();
  if (s === 'running' || s === 'active' || s === 'ready' || s === 'deployed' || s === 'completed' || s === 'success') {
    return 'green';
  }
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
  return s + ' '.repeat(length - s.length);
}
