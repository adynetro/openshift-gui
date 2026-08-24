import React from 'react';
import { Box, Text } from 'ink';
import { ResourceKind } from '../types/k8s.js';
import { ButtonAction } from '../types/ui.js';

interface ButtonBarProps {
  currentKind: ResourceKind;
  actions?: ButtonAction[];
}

export const ButtonBar: React.FC<ButtonBarProps> = ({ currentKind }) => {
  const getContextualButtons = () => {
    const buttons = [
      { key: 'c', label: 'Context', color: 'cyan' },
      { key: 'p', label: 'Project', color: 'magenta' },
      { key: '/', label: 'Filter', color: 'yellow' },
      { key: 'd', label: 'Describe', color: 'white' },
    ];

    if (currentKind === 'pods' || currentKind === 'deployments') {
      buttons.push({ key: 'l', label: 'Logs', color: 'green' });
    }

    if (currentKind === 'deployments' || currentKind === 'statefulsets') {
      buttons.push({ key: 's', label: 'Scale', color: 'cyan' });
      buttons.push({ key: 'r', label: 'Restart', color: 'yellow' });
    }

    if (currentKind === 'imagestreams') {
      buttons.push({ key: 'i', label: 'SemVer Clean', color: 'green' });
    }

    if (currentKind === 'helm') {
      buttons.push({ key: 'v', label: 'Values', color: 'cyan' });
      buttons.push({ key: 'm', label: 'Manifest', color: 'magenta' });
    }

    buttons.push({ key: 'x', label: 'Delete', color: 'red' });
    buttons.push({ key: '?', label: 'Help', color: 'gray' });
    buttons.push({ key: 'q', label: 'Quit', color: 'gray' });

    return buttons;
  };

  const buttons = getContextualButtons();

  return (
    <Box flexDirection="row" flexWrap="wrap" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
      {buttons.map((btn) => (
        <Box key={btn.key} marginRight={2}>
          <Text color={btn.color as any} bold>
            <Text color="yellow">[{btn.key}]</Text> {btn.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
};
