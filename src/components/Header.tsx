import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { ClusterInfo } from '../types/k8s.js';
import { theme } from '../utils/theme.js';

interface HeaderProps {
  clusterInfo: ClusterInfo | null;
  loading: boolean;
  resourceCount: number;
  currentKind: string;
}

export const Header: React.FC<HeaderProps> = ({
  clusterInfo,
  loading,
  resourceCount,
  currentKind,
}) => {
  const contextName = clusterInfo?.context || 'No Context';
  const projectName = clusterInfo?.namespace || 'default';
  const server = clusterInfo?.server || '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Top Brand & Status Line */}
      <Box justifyContent="space-between" borderStyle="single" borderColor="red">
        <Box>
          <Text color="red" bold>
            {' '}
            {theme.icons.pod} OpenShift CLI TUI{' '}
          </Text>
          <Text color="gray">|</Text>
          <Text color="cyan" bold>
            {' '}
            [c] Context:{' '}
          </Text>
          <Text color="white" bold>
            {contextName}
          </Text>
          <Text color="gray"> </Text>
          <Text color="magenta" bold>
            {' '}
            [p] Project:{' '}
          </Text>
          <Text color="green" bold>
            {projectName}
          </Text>
        </Box>

        <Box>
          {loading ? (
            <Text color="yellow" bold>
              {theme.icons.refresh} Fetching...{' '}
            </Text>
          ) : (
            <Text color="green">
              {theme.icons.dot} Connected ({resourceCount} {currentKind}){' '}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
