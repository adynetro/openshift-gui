import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ResourceItem } from '../types/k8s.js';
import { OcClient } from '../services/oc-client.js';
import { theme } from '../utils/theme.js';

interface ActionModalProps {
  mode: 'scale' | 'restart' | 'delete';
  item: ResourceItem;
  namespace: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const ActionModal: React.FC<ActionModalProps> = ({
  mode,
  item,
  namespace,
  onClose,
  onSuccess,
  onError,
}) => {
  const currentDesired = item.extra?.desired ?? 1;
  const [replicas, setReplicas] = useState<number>(currentDesired);
  const [loading, setLoading] = useState(false);

  useInput(async (input, key) => {
    if (loading) return;

    if (key.escape || input === 'n' || input === 'q') {
      onClose();
      return;
    }

    if (mode === 'scale') {
      if (input === '+' || input === '=' || key.upArrow) {
        setReplicas((prev) => prev + 1);
        return;
      }
      if (input === '-' || input === '_' || key.downArrow) {
        setReplicas((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.return || input === 's' || input === 'y') {
        setLoading(true);
        let cmdKind: string = item.kind;
        if (cmdKind === 'statefulsets') cmdKind = 'sts';
        const res = await OcClient.scale(cmdKind, item.name, namespace, replicas);
        setLoading(false);
        if (res.success) {
          onSuccess(res.message);
        } else {
          onError(res.message);
        }
        return;
      }
    }

    if (mode === 'restart') {
      if (key.return || input === 'y' || input === 'r') {
        setLoading(true);
        let cmdKind: string = item.kind;
        if (cmdKind === 'statefulsets') cmdKind = 'sts';
        const res = await OcClient.rolloutRestart(cmdKind, item.name, namespace);
        setLoading(false);
        if (res.success) {
          onSuccess(res.message);
        } else {
          onError(res.message);
        }
        return;
      }
    }

    if (mode === 'delete') {
      if (key.return || input === 'y' || input === 'x') {
        setLoading(true);
        let cmdKind: string = item.kind as string;
        if (cmdKind === 'imagestreams') cmdKind = 'is';
        if (cmdKind === 'statefulsets') cmdKind = 'sts';
        if (cmdKind === 'configmaps') cmdKind = 'cm';
        const res = await OcClient.deleteResource(cmdKind, item.name, namespace);
        setLoading(false);
        if (res.success) {
          onSuccess(res.message);
        } else {
          onError(res.message);
        }
        return;
      }
    }
  });

  const renderContent = () => {
    switch (mode) {
      case 'scale':
        return (
          <Box flexDirection="column" marginY={1}>
            <Text color="white">
              Current Replicas: <Text color="yellow">{currentDesired}</Text>
            </Text>
            <Box marginY={1}>
              <Text color="white">
                New Desired Replicas: <Text color="cyan" bold>[+/-] {replicas}</Text>
              </Text>
            </Box>
            <Text color="gray">Use + / - or ↑ / ↓ to adjust count.</Text>
            <Box marginTop={1}>
              <Text color="green" bold>
                Press [Enter] or [s] to Scale | [Esc/n] Cancel
              </Text>
            </Box>
          </Box>
        );

      case 'restart':
        return (
          <Box flexDirection="column" marginY={1}>
            <Text color="yellow" bold>
              Are you sure you want to trigger a Rollout Restart for {item.kind}/{item.name}?
            </Text>
            <Box marginTop={1}>
              <Text color="gray">
                This will safely perform a rolling update of all running pods.
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color="yellow" bold>
                Press [y/Enter] to Confirm Restart | [Esc/n] Cancel
              </Text>
            </Box>
          </Box>
        );

      case 'delete':
        return (
          <Box flexDirection="column" marginY={1}>
            <Text color="red" bold>
              {theme.icons.warning} WARNING: Are you sure you want to DELETE {item.kind}/{item.name}?
            </Text>
            <Box marginTop={1}>
              <Text color="gray">
                This action cannot be undone.
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color="red" bold>
                Press [y/Enter] to Confirm Delete | [Esc/n] Cancel
              </Text>
            </Box>
          </Box>
        );
    }
  };

  const borderColor = mode === 'delete' ? 'red' : mode === 'scale' ? 'cyan' : 'yellow';

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={borderColor}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box justifyContent="space-between" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={borderColor} bold>
          {theme.icons.pointer} Action: {mode.toUpperCase()} ({item.kind}/{item.name})
        </Text>
        <Text color="gray">{loading ? 'Executing...' : '[Esc: Cancel]'}</Text>
      </Box>

      {renderContent()}
    </Box>
  );
};
