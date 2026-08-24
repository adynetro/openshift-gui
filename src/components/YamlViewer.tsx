import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { OcClient } from '../services/oc-client.js';
import { HelmService } from '../services/helm.js';
import { theme } from '../utils/theme.js';
import { truncate } from '../utils/formatters.js';

interface YamlViewerProps {
  mode: 'yaml' | 'describe' | 'helm-values' | 'helm-manifest';
  kind: string;
  name: string;
  namespace: string;
  onClose: () => void;
}

export const YamlViewer: React.FC<YamlViewerProps> = ({
  mode,
  kind,
  name,
  namespace,
  onClose,
}) => {
  const [content, setContent] = useState<string>('Loading...');
  const [scrollIndex, setScrollIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      let text = '';
      if (mode === 'yaml') {
        let cmdKind = kind;
        if (kind === 'imagestreams') cmdKind = 'is';
        if (kind === 'statefulsets') cmdKind = 'sts';
        if (kind === 'configmaps') cmdKind = 'cm';
        text = await OcClient.getYaml(cmdKind, name, namespace);
      } else if (mode === 'describe') {
        let cmdKind = kind;
        if (kind === 'imagestreams') cmdKind = 'is';
        if (kind === 'statefulsets') cmdKind = 'sts';
        if (kind === 'configmaps') cmdKind = 'cm';
        text = await OcClient.describe(cmdKind, name, namespace);
      } else if (mode === 'helm-values') {
        text = await HelmService.getValues(name, namespace);
      } else if (mode === 'helm-manifest') {
        text = await HelmService.getManifest(name, namespace);
      }
      setContent(text);
    }
    load();
  }, [mode, kind, name, namespace]);

  const rawLines = content.split('\n');

  const lines = searchQuery
    ? rawLines.filter((l) => l.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawLines;

  const maxVisible = 16;
  const visibleLines = lines.slice(scrollIndex, scrollIndex + maxVisible);

  useInput((input, key) => {
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
      }
      return;
    }

    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    if (input === '/') {
      setIsSearching(true);
      return;
    }

    if (key.upArrow) {
      setScrollIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setScrollIndex((prev) => Math.min(Math.max(0, lines.length - maxVisible), prev + 1));
      return;
    }

    if (key.pageUp) {
      setScrollIndex((prev) => Math.max(0, prev - 10));
      return;
    }

    if (key.pageDown) {
      setScrollIndex((prev) => Math.min(Math.max(0, lines.length - maxVisible), prev + 10));
      return;
    }
  });

  const renderLine = (line: string, idx: number) => {
    // Basic syntax styling
    let col = 'white';
    if (line.trim().startsWith('#')) col = 'gray';
    else if (line.includes(':')) {
      const parts = line.split(':');
      const keyPart = parts[0];
      const valPart = parts.slice(1).join(':');
      return (
        <Box key={idx}>
          <Text color="cyan">{keyPart}:</Text>
          <Text color="yellow">{truncate(valPart, 80)}</Text>
        </Box>
      );
    }

    return (
      <Box key={idx}>
        <Text color={col as any}>{truncate(line, 100)}</Text>
      </Box>
    );
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="blue"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      {/* Title */}
      <Box justifyContent="space-between" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="blue" bold>
          {theme.icons.pointer} {mode.toUpperCase()}: {kind}/{name} ({namespace})
        </Text>
        <Text color="gray">[Esc/q: Back | ↑/↓: Scroll | /: Search]</Text>
      </Box>

      {/* Search Bar */}
      {isSearching && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
          <Text color="yellow">Search text: </Text>
          {/* @ts-ignore */}
          <TextInput
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setScrollIndex(0);
            }}
            onSubmit={() => setIsSearching(false)}
          />
        </Box>
      )}

      {/* Content View */}
      <Box flexDirection="column" marginY={1} minHeight={maxVisible}>
        {visibleLines.length === 0 ? (
          <Text color="gray">No matching lines found.</Text>
        ) : (
          visibleLines.map((l, i) => renderLine(l, i))
        )}
      </Box>

      <Box justifyContent="space-between" paddingX={1}>
        <Text color="gray">
          Lines {scrollIndex + 1}-{Math.min(scrollIndex + maxVisible, lines.length)} of {lines.length}
        </Text>
      </Box>
    </Box>
  );
};
