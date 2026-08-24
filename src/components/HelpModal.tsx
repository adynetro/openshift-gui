import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../utils/theme.js';
import { padRight } from '../utils/formatters.js';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === '?' || key.return) {
      onClose();
    }
  });

  const shortcuts = [
    { key: '1 - 9, 0', desc: 'Switch Resource View (Pods, Deployments, Routes, ImageStreams, Helm...)' },
    { key: 'c', desc: 'Context Switcher (Fuzzy search and switch cluster context)' },
    { key: 'p', desc: 'Project / Namespace Switcher' },
    { key: '/', desc: 'Filter resources / Autocomplete search bar' },
    { key: ':', desc: 'Command Palette with autocomplete suggestions (:scale, :logs, :clean)' },
    { key: 'Enter / d', desc: 'Describe / YAML viewer' },
    { key: 'l', desc: 'Live Log Streamer (tail, pause, auto-scroll, regex filter)' },
    { key: 's', desc: 'Scale Deployment or StatefulSet (adjust replicas interactively)' },
    { key: 'r', desc: 'Trigger Rollout Restart' },
    { key: 'i', desc: 'ImageStream Manager & SemVer Tag Cleanup Wizard' },
    { key: 'x / Del', desc: 'Delete resource safely with confirmation' },
    { key: 'v / m', desc: 'Helm Release Values / Manifest viewer (in Helm view)' },
    { key: '↑ / ↓, j / k', desc: 'Navigate list up and down' },
    { key: 'Esc / q', desc: 'Close active modal / Quit application' },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box justifyContent="space-between" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
        <Text color="yellow" bold>
          {theme.icons.star} OpenShift CLI TUI - Shortcuts & Help
        </Text>
        <Text color="gray">[Esc / q / Enter: Close Help]</Text>
      </Box>

      <Box flexDirection="column">
        {shortcuts.map((s) => (
          <Box key={s.key}>
            <Text color="cyan" bold>
              {padRight(s.key, 18)}
            </Text>
            <Text color="white">{s.desc}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          OpenShift CLI GUI • Designed for fast navigation, autocomplete, ImageStream SemVer cleanup & Helm
        </Text>
      </Box>
    </Box>
  );
};
