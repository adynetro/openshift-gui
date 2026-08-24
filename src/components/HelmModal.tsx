import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ResourceItem } from '../types/k8s.js';
import { HelmService } from '../services/helm.js';
import { theme } from '../utils/theme.js';
import { padRight, truncate } from '../utils/formatters.js';

interface HelmModalProps {
  release: ResourceItem;
  namespace: string;
  onClose: () => void;
  onRefresh: () => void;
  onViewValues: () => void;
  onViewManifest: () => void;
}

export const HelmModal: React.FC<HelmModalProps> = ({
  release,
  namespace,
  onClose,
  onRefresh,
  onViewValues,
  onViewManifest,
}) => {
  const [history, setHistory] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function loadHistory() {
      const hist = await HelmService.getHistory(release.name, namespace);
      setHistory(hist);
    }
    loadHistory();
  }, [release.name, namespace]);

  useInput(async (input, key) => {
    if (isProcessing) return;

    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    if (input === 'v') {
      onViewValues();
      return;
    }

    if (input === 'm') {
      onViewManifest();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(history.length - 1, prev + 1));
      return;
    }

    if (input === 'r') {
      // Rollback to selected revision in history
      const revItem = history[selectedIndex];
      if (revItem) {
        setIsProcessing(true);
        setStatusMessage(`Rolling back to revision ${revItem.revision}...`);
        const res = await HelmService.rollback(release.name, revItem.revision, namespace);
        setStatusMessage(res.message);
        setIsProcessing(false);
        onRefresh();
      }
      return;
    }

    if (input === 'u' || input === 'x') {
      setIsProcessing(true);
      setStatusMessage(`Uninstalling release ${release.name}...`);
      const res = await HelmService.uninstall(release.name, namespace);
      setStatusMessage(res.message);
      setIsProcessing(false);
      onRefresh();
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="magenta"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="magenta" bold>
          {theme.icons.helm} Helm Release: {release.name} (Chart: {release.extra?.chart || '-'})
        </Text>
        <Text color="gray">[Esc/q: Back | v: Values | m: Manifest | r: Rollback | u: Uninstall]</Text>
      </Box>

      {statusMessage && (
        <Box paddingX={1} marginY={0}>
          <Text color="yellow" bold>
            {theme.icons.warning} {statusMessage}
          </Text>
        </Box>
      )}

      {/* Release details */}
      <Box flexDirection="row" marginY={1}>
        <Box marginRight={2}>
          <Text color="gray">Status: </Text>
          <Text color={release.statusColor || 'green'} bold>
            {release.status}
          </Text>
        </Box>
        <Box marginRight={2}>
          <Text color="gray">Current Revision: </Text>
          <Text color="white" bold>
            {release.extra?.revision || '1'}
          </Text>
        </Box>
        <Box marginRight={2}>
          <Text color="gray">App Version: </Text>
          <Text color="yellow" bold>
            {release.extra?.appVersion || '-'}
          </Text>
        </Box>
      </Box>

      {/* History table */}
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan" bold>
          Revision History:
        </Text>
        <Box borderStyle="single" borderColor="gray">
          <Text bold color="white">
            {padRight('  REVISION', 14)}
            {padRight('UPDATED', 24)}
            {padRight('STATUS', 16)}
            {padRight('CHART', 24)}
            {padRight('DESCRIPTION', 30)}
          </Text>
        </Box>
        {history.length === 0 ? (
          <Text color="gray">No revision history found.</Text>
        ) : (
          history.map((h, idx) => {
            const isSelected = idx === selectedIndex;
            const pointer = isSelected ? `${theme.icons.pointer} ` : '  ';

            return (
              <Box key={h.revision || idx}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {pointer}
                  {padRight(String(h.revision), 12)}
                </Text>
                <Text color="gray">{padRight(truncate(h.updated || '-', 22), 24)}</Text>
                <Text color="green">{padRight(h.status || '-', 16)}</Text>
                <Text color="magenta">{padRight(truncate(h.chart || '-', 22), 24)}</Text>
                <Text color="yellow">{padRight(truncate(h.description || '-', 28), 30)}</Text>
              </Box>
            );
          })
        )}
      </Box>

      <Box justifyContent="space-between" paddingX={1}>
        <Text color="gray">Select revision and press [r] to rollback.</Text>
      </Box>
    </Box>
  );
};
