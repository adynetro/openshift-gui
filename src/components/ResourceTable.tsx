import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ResourceKind, ResourceItem } from '../types/k8s.js';
import { padRight, truncate } from '../utils/formatters.js';
import { theme } from '../utils/theme.js';

interface ResourceTableProps {
  kind: ResourceKind;
  items: ResourceItem[];
  selectedIndex: number;
  loading: boolean;
  maxVisibleRows?: number;
}

export const ResourceTable: React.FC<ResourceTableProps> = ({
  kind,
  items,
  selectedIndex,
  loading,
  maxVisibleRows = 12,
}) => {
  if (loading && items.length === 0) {
    return (
      <Box paddingY={2} justifyContent="center" borderStyle="single" borderColor="gray">
        <Text color="yellow">{theme.icons.refresh} Loading {kind} from cluster...</Text>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box paddingY={2} justifyContent="center" borderStyle="single" borderColor="gray">
        <Text color="gray">No {kind} found in this project/namespace.</Text>
      </Box>
    );
  }

  // Calculate scrolling window
  let startIdx = 0;
  if (selectedIndex >= maxVisibleRows) {
    startIdx = selectedIndex - maxVisibleRows + 1;
  }
  const visibleItems = items.slice(startIdx, startIdx + maxVisibleRows);

  const renderHeader = () => {
    switch (kind) {
      case 'pods':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 35)}
              {padRight('READY', 10)}
              {padRight('STATUS', 18)}
              {padRight('RESTARTS', 10)}
              {padRight('IP', 16)}
              {padRight('NODE', 20)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      case 'deployments':
      case 'statefulsets':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 35)}
              {padRight('READY', 10)}
              {padRight('UP-TO-DATE', 12)}
              {padRight('AVAILABLE', 12)}
              {padRight('STATUS', 15)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      case 'services':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 32)}
              {padRight('TYPE', 15)}
              {padRight('CLUSTER-IP', 18)}
              {padRight('PORTS', 28)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      case 'routes':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 28)}
              {padRight('HOST', 35)}
              {padRight('PATH', 8)}
              {padRight('SERVICE', 20)}
              {padRight('TLS', 10)}
              {padRight('STATUS', 12)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      case 'imagestreams':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 30)}
              {padRight('TAGS', 8)}
              {padRight('LATEST TAGS (SEMVER SORTED)', 45)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      case 'configmaps':
      case 'secrets':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 38)}
              {padRight('DATA', 12)}
              {padRight('TYPE', 25)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      case 'helm':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 26)}
              {padRight('REVISION', 10)}
              {padRight('STATUS', 15)}
              {padRight('CHART', 28)}
              {padRight('APP VERSION', 15)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      case 'nodes':
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 35)}
              {padRight('STATUS', 14)}
              {padRight('ROLES', 20)}
              {padRight('VERSION', 18)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );

      default:
        return (
          <Box borderStyle="bold" borderColor="gray">
            <Text bold color="white">
              {padRight('  NAME', 35)}
              {padRight('STATUS', 15)}
              {padRight('AGE', 8)}
            </Text>
          </Box>
        );
    }
  };

  const renderRow = (item: ResourceItem, index: number, isSelected: boolean) => {
    const pointer = isSelected ? `${theme.icons.pointer} ` : '  ';
    const statusColor = item.statusColor || 'white';

    let content: React.ReactNode;

    switch (kind) {
      case 'pods':
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 32), 35)}
            </Text>
            <Text color="gray">{padRight(item.ready || '0/1', 10)}</Text>
            <Text color={statusColor} bold>
              {padRight(truncate(item.status, 16), 18)}
            </Text>
            <Text color={item.restarts && item.restarts > 0 ? 'yellow' : 'gray'}>
              {padRight(String(item.restarts ?? 0), 10)}
            </Text>
            <Text color="gray">{padRight(item.ip || '-', 16)}</Text>
            <Text color="gray">{padRight(truncate(item.node || '-', 18), 20)}</Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;

      case 'deployments':
      case 'statefulsets':
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 32), 35)}
            </Text>
            <Text color="gray">{padRight(item.ready || '-', 10)}</Text>
            <Text color="gray">{padRight(String(item.extra?.upToDate ?? '-'), 12)}</Text>
            <Text color="gray">{padRight(String(item.extra?.available ?? '-'), 12)}</Text>
            <Text color={statusColor} bold>
              {padRight(truncate(item.status, 14), 15)}
            </Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;

      case 'services':
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 29), 32)}
            </Text>
            <Text color="magenta">{padRight(item.status || 'ClusterIP', 15)}</Text>
            <Text color="gray">{padRight(item.ip || '-', 18)}</Text>
            <Text color="yellow">{padRight(truncate(item.extra?.ports || '-', 26), 28)}</Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;

      case 'routes':
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 25), 28)}
            </Text>
            <Text color="cyan">{padRight(truncate(item.extra?.host || '-', 33), 35)}</Text>
            <Text color="gray">{padRight(item.extra?.path || '/', 8)}</Text>
            <Text color="gray">{padRight(truncate(item.extra?.targetService || '-', 18), 20)}</Text>
            <Text color="yellow">{padRight(item.extra?.tls || 'None', 10)}</Text>
            <Text color={statusColor} bold>
              {padRight(item.status, 12)}
            </Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;

      case 'imagestreams': {
        const isTags = (item.extra?.tags || []).map((t: any) => t.tag);
        const tagsPreview = isTags.length > 0 ? isTags.slice(0, 4).join(', ') : '(no tags)';

        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 27), 30)}
            </Text>
            <Text color="green" bold>
              {padRight(String(item.extra?.tagCount ?? 0), 8)}
            </Text>
            <Text color="yellow">{padRight(truncate(tagsPreview, 43), 45)}</Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;
      }

      case 'configmaps':
      case 'secrets':
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 35), 38)}
            </Text>
            <Text color="cyan">{padRight(item.status, 12)}</Text>
            <Text color="gray">{padRight(truncate(item.extra?.type || '-', 23), 25)}</Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;

      case 'helm':
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 23), 26)}
            </Text>
            <Text color="gray">{padRight(item.extra?.revision || '1', 10)}</Text>
            <Text color={statusColor} bold>
              {padRight(item.status, 15)}
            </Text>
            <Text color="magenta">{padRight(truncate(item.extra?.chart || '-', 26), 28)}</Text>
            <Text color="yellow">{padRight(truncate(item.extra?.appVersion || '-', 13), 15)}</Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;

      case 'nodes':
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 32), 35)}
            </Text>
            <Text color={statusColor} bold>
              {padRight(item.status, 14)}
            </Text>
            <Text color="yellow">{padRight(truncate(item.extra?.roles || '-', 18), 20)}</Text>
            <Text color="gray">{padRight(item.extra?.version || '-', 18)}</Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
        break;

      default:
        content = (
          <Text>
            <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
              {padRight(pointer + truncate(item.name, 32), 35)}
            </Text>
            <Text color={statusColor} bold>
              {padRight(item.status, 15)}
            </Text>
            <Text color="blue">{padRight(item.age, 8)}</Text>
          </Text>
        );
    }

    return (
      <Box key={item.id || index} paddingX={0}>
        {content}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={selectedIndex >= 0 ? 'cyan' : 'gray'}>
      {renderHeader()}
      {visibleItems.map((item, idx) => {
        const actualIndex = startIdx + idx;
        const isSelected = actualIndex === selectedIndex;
        return renderRow(item, actualIndex, isSelected);
      })}
      <Box justifyContent="space-between" marginTop={0} paddingX={1}>
        <Text color="gray">
          Showing {startIdx + 1}-{Math.min(startIdx + maxVisibleRows, items.length)} of {items.length}
        </Text>
        <Text color="gray">Use ↑/↓ or j/k to navigate</Text>
      </Box>
    </Box>
  );
};
