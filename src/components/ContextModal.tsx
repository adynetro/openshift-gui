import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { KubeContext, ProjectInfo } from '../types/k8s.js';
import { FuzzyMatcher } from '../utils/fuzzy.js';
import { theme } from '../utils/theme.js';
import { padRight, truncate } from '../utils/formatters.js';

interface ContextModalProps {
  mode: 'context' | 'project';
  contexts: KubeContext[];
  projects: ProjectInfo[];
  currentContext: string | null;
  currentProject: string;
  onSelectContext: (name: string) => void;
  onSelectProject: (name: string) => void;
  onClose: () => void;
}

export const ContextModal: React.FC<ContextModalProps> = ({
  mode,
  contexts,
  projects,
  currentContext,
  currentProject,
  onSelectContext,
  onSelectProject,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = useMemo(() => {
    if (mode === 'context') {
      const raw = contexts.map((c) => ({
        id: c.name,
        name: c.name,
        cluster: c.cluster,
        user: c.user,
        isCurrent: c.name === currentContext,
      }));
      if (!query.trim()) return raw;
      const matcher = new FuzzyMatcher(raw, ['name', 'cluster', 'user']);
      return matcher.search(query);
    } else {
      const raw = projects.map((p) => ({
        id: p.name,
        name: p.name,
        displayName: p.displayName,
        status: p.status,
        isCurrent: p.name === currentProject,
      }));
      if (!query.trim()) return raw;
      const matcher = new FuzzyMatcher(raw, ['name', 'displayName']);
      return matcher.search(query);
    }
  }, [mode, contexts, projects, currentContext, currentProject, query]);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      const selected = items[selectedIndex];
      if (selected) {
        if (mode === 'context') {
          onSelectContext(selected.name);
        } else {
          onSelectProject(selected.name);
        }
      }
    }
  });

  const maxVisible = 10;
  let startIdx = 0;
  if (selectedIndex >= maxVisible) {
    startIdx = selectedIndex - maxVisible + 1;
  }
  const visibleItems = items.slice(startIdx, startIdx + maxVisible);

  const title = mode === 'context' ? 'Switch Kubernetes / OpenShift Context' : 'Switch Project / Namespace';

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="cyan" bold>
          {theme.icons.pointer} {title}
        </Text>
        <Text color="gray">[Esc: Cancel | Enter: Select | ↑/↓: Navigate]</Text>
      </Box>

      {/* Filter bar */}
      <Box borderStyle="single" borderColor="yellow" paddingX={1} marginBottom={1}>
        <Text color="yellow">Search: </Text>
        {/* @ts-ignore */}
        <TextInput
          value={query}
          onChange={(val) => {
            setQuery(val);
            setSelectedIndex(0);
          }}
          placeholder="Filter..."
        />
      </Box>

      {/* List */}
      <Box flexDirection="column">
        {visibleItems.length === 0 ? (
          <Text color="gray">No matching {mode}s found.</Text>
        ) : (
          visibleItems.map((item, idx) => {
            const actualIdx = startIdx + idx;
            const isSelected = actualIdx === selectedIndex;
            const pointer = isSelected ? `${theme.icons.pointer} ` : '  ';

            return (
              <Box key={item.id} paddingX={0}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {pointer}
                  {padRight(truncate(item.name, 40), 45)}
                </Text>
                {item.isCurrent ? (
                  <Text color="green" bold>
                    {' '}
                    [ACTIVE]{' '}
                  </Text>
                ) : (
                  <Text color="gray"> </Text>
                )}
                {'cluster' in item && <Text color="gray">{truncate((item as any).cluster || '', 30)}</Text>}
              </Box>
            );
          })
        )}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray">
          Total: {items.length} {mode}s
        </Text>
      </Box>
    </Box>
  );
};
