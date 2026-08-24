import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { LogStreamer, LogEntry } from '../services/log-streamer.js';
import { theme } from '../utils/theme.js';
import { truncate } from '../utils/formatters.js';

interface LogViewerProps {
  podName: string;
  namespace: string;
  container?: string;
  onClose: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  podName,
  namespace,
  container,
  onClose,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFilterMode, setIsFilterMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  const streamerRef = useRef<LogStreamer | null>(null);

  useEffect(() => {
    const streamer = new LogStreamer(podName, namespace, 'pods', container, 150);
    streamerRef.current = streamer;

    streamer.on('update', (allLogs: LogEntry[]) => {
      setLogs(allLogs);
    });

    streamer.start();

    return () => {
      streamer.stop();
    };
  }, [podName, namespace, container]);

  const filteredLogs = logs.filter((entry) => {
    if (!filterQuery) return true;
    return entry.raw.toLowerCase().includes(filterQuery.toLowerCase());
  });

  const maxVisibleRows = 16;
  const total = filteredLogs.length;

  let displayLogs: LogEntry[] = [];
  if (autoScroll) {
    displayLogs = filteredLogs.slice(Math.max(0, total - maxVisibleRows));
  } else {
    const start = Math.max(0, total - maxVisibleRows - scrollOffset);
    displayLogs = filteredLogs.slice(start, start + maxVisibleRows);
  }

  useInput((input, key) => {
    if (isFilterMode) {
      if (key.escape) {
        setIsFilterMode(false);
      }
      return;
    }

    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    if (input === '/') {
      setIsFilterMode(true);
      return;
    }

    if (input === 'a') {
      setAutoScroll((prev) => !prev);
      setScrollOffset(0);
      return;
    }

    if (input === 'p') {
      setIsPaused((prev) => {
        if (!prev) streamerRef.current?.stop();
        else streamerRef.current?.start();
        return !prev;
      });
      return;
    }

    if (key.upArrow) {
      setAutoScroll(false);
      setScrollOffset((prev) => Math.min(total - maxVisibleRows, prev + 1));
      return;
    }

    if (key.downArrow) {
      setScrollOffset((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) setAutoScroll(true);
        return next;
      });
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="green"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      {/* Header bar */}
      <Box justifyContent="space-between" borderStyle="single" borderColor="gray" paddingX={1}>
        <Box>
          <Text color="green" bold>
            {theme.icons.pod} Logs: {podName}{container ? ` [container: ${container}]` : ''}
          </Text>
        </Box>
        <Box>
          <Text color={autoScroll ? 'green' : 'yellow'}>
            [a] Auto-scroll: {autoScroll ? 'ON' : 'OFF'}{' '}
          </Text>
          <Text color={isPaused ? 'red' : 'green'}>
            [p] {isPaused ? 'PAUSED' : 'STREAMING'}{' '}
          </Text>
          <Text color="gray">[Esc/q: Exit | /: Filter | ↑/↓: Scroll]</Text>
        </Box>
      </Box>

      {/* Filter Input if active */}
      {isFilterMode && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
          <Text color="yellow">Filter logs: </Text>
          {/* @ts-ignore */}
          <TextInput
            value={filterQuery}
            onChange={setFilterQuery}
            onSubmit={() => setIsFilterMode(false)}
            placeholder="Type regex or text to filter logs..."
          />
        </Box>
      )}

      {/* Log Output Area */}
      <Box flexDirection="column" marginY={1} minHeight={maxVisibleRows}>
        {displayLogs.length === 0 ? (
          <Text color="gray">Waiting for log stream output...</Text>
        ) : (
          displayLogs.map((entry) => {
            const hasError = entry.raw.toLowerCase().includes('error') || entry.raw.toLowerCase().includes('fail');
            const hasWarn = entry.raw.toLowerCase().includes('warn');
            const lineCol = hasError ? 'red' : hasWarn ? 'yellow' : 'white';

            return (
              <Box key={entry.id}>
                {entry.timestamp && <Text color="gray">[{entry.timestamp.slice(11, 19)}] </Text>}
                <Text color={lineCol}>{truncate(entry.raw, 110)}</Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer info */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color="gray">
          Lines buffered: {logs.length} {filterQuery ? `(matching: ${filteredLogs.length})` : ''}
        </Text>
        <Text color="gray">OpenShift Pod Log Streamer</Text>
      </Box>
    </Box>
  );
};
