import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { KubeContext, ProjectInfo } from '../types/k8s.js';
import { groupServersWithContexts } from '../services/kubeconfig.js';
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
      const serverList = groupServersWithContexts(contexts, currentContext);
      const raw = serverList.map((s) => ({
        id: s.server,
        name: s.server,
        activeContextName: s.activeContextName,
        cluster: s.clusterName,
        user: s.user,
        contextCount: s.contextCount,
        isCurrent: s.isCurrent,
      }));
      if (!query.trim()) return raw;
      const matcher = new FuzzyMatcher(raw, ['name', 'activeContextName', 'cluster', 'user']);
      return matcher.search(query);
    } else {
      const raw = projects.map((p) => ({
        id: p.name,
        name: p.name,
        activeContextName: p.name,
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
          onSelectContext(selected.activeContextName || selected.name);
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

  const title = mode === 'context' ? 'Switch Server & Active Context' : 'Switch Project / Namespace';

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
          <Text color="gray">No matching {mode === 'context' ? 'servers' : 'projects'} found.</Text>
        ) : (
          visibleItems.map((item, idx) => {
            const actualIdx = startIdx + idx;
            const isSelected = actualIdx === selectedIndex;
            const pointer = isSelected ? `${theme.icons.pointer} ` : '  ';

            return (
              <Box key={item.id} paddingX={0}>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {pointer}
                  {padRight(truncate(item.name, 38), 40)}
                </Text>
                {item.isCurrent ? (
                  <Text color="green" bold>
                    {' '}
                    [ACTIVE]{' '}
                  </Text>
                ) : (
                  <Text color="gray"> </Text>
                )}
                {'activeContextName' in item && item.activeContextName !== item.name && (
                  <Text color="cyan"> ctx:{truncate(item.activeContextName, 25)}</Text>
                )}
                {'user' in item && item.user ? (
                  <Text color="gray"> ({item.user})</Text>
                ) : null}
              </Box>
            );
          })
        )}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray">
          Total: {items.length} {mode === 'context' ? 'servers with active contexts' : 'projects'}
        </Text>
      </Box>
    </Box>
  );
};
