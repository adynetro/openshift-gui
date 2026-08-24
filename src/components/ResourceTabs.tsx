import React from 'react';
import { Box, Text } from 'ink';
import { ResourceKind } from '../types/k8s.js';
import { theme } from '../utils/theme.js';

interface ResourceTabsProps {
  currentKind: ResourceKind;
  onSelectKind?: (kind: ResourceKind) => void;
}

export const RESOURCE_TABS: { key: string; kind: ResourceKind; label: string; icon: string }[] = [
  { key: '1', kind: 'pods', label: 'Pods', icon: theme.icons.pod },
  { key: '2', kind: 'deployments', label: 'Deployments', icon: theme.icons.deployment },
  { key: '3', kind: 'statefulsets', label: 'StatefulSets', icon: theme.icons.deployment },
  { key: '4', kind: 'services', label: 'Services', icon: theme.icons.service },
  { key: '5', kind: 'routes', label: 'Routes', icon: theme.icons.route },
  { key: '6', kind: 'imagestreams', label: 'ImageStreams', icon: theme.icons.imagestream },
  { key: '7', kind: 'configmaps', label: 'ConfigMaps', icon: theme.icons.configmap },
  { key: '8', kind: 'secrets', label: 'Secrets', icon: theme.icons.secret },
  { key: '9', kind: 'helm', label: 'Helm', icon: theme.icons.helm },
  { key: '0', kind: 'nodes', label: 'Nodes', icon: theme.icons.node },
];

export const ResourceTabs: React.FC<ResourceTabsProps> = ({ currentKind }) => {
  return (
    <Box flexDirection="row" marginBottom={1} flexWrap="wrap">
      {RESOURCE_TABS.map((tab) => {
        const isActive = tab.kind === currentKind;
        return (
          <Box
            key={tab.kind}
            marginRight={1}
            paddingX={1}
            borderStyle={isActive ? 'round' : undefined}
            borderColor={isActive ? 'cyan' : undefined}
          >
            <Text color={isActive ? 'cyan' : 'gray'} bold={isActive}>
              <Text color="yellow">[{tab.key}]</Text> {tab.icon} {tab.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
