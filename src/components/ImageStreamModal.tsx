import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ImageStreamResource, ImageStreamTagInfo } from '../types/k8s.js';
import { SemverSorter } from '../services/semver-sorter.js';
import { OcClient } from '../services/oc-client.js';
import { theme } from '../utils/theme.js';
import { padRight, truncate, formatBytes } from '../utils/formatters.js';

interface ImageStreamModalProps {
  imageStream: ImageStreamResource;
  namespace: string;
  onClose: () => void;
  onRefresh: () => void;
}

export const ImageStreamModal: React.FC<ImageStreamModalProps> = ({
  imageStream,
  namespace,
  onClose,
  onRefresh,
}) => {
  const [tags, setTags] = useState<ImageStreamTagInfo[]>(() => {
    return SemverSorter.sortTags(imageStream.extra?.tags || []);
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isCleanupWizard, setIsCleanupWizard] = useState(false);
  const [cleanupStrategy, setCleanupStrategy] = useState<'semver' | 'generation'>('semver');
  const [keepCount, setKeepCount] = useState(3);
  const [keepNonSemver, setKeepNonSemver] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Compute cleanup plan
  const cleanupPlan = SemverSorter.planCleanup(tags, {
    strategy: cleanupStrategy,
    keepCount,
    keepNonSemver,
    keepTagsNamed: ['latest', 'stable', 'main', 'master', 'prod'],
  });

  useInput(async (input, key) => {
    if (isDeleting) return;

    if (key.escape || input === 'q') {
      onClose();
      return;
    }

    if (isCleanupWizard) {
      if (input === 's') {
        setCleanupStrategy((prev) => (prev === 'semver' ? 'generation' : 'semver'));
        return;
      }
      if (input === '+' || input === '=') {
        setKeepCount((prev) => prev + 1);
        return;
      }
      if (input === '-' || input === '_') {
        setKeepCount((prev) => Math.max(1, prev - 1));
        return;
      }
      if (input === 't') {
        setKeepNonSemver((prev) => !prev);
        return;
      }
      if (input === 'c') {
        setIsCleanupWizard(false);
        return;
      }
      if (key.return || input === 'y') {
        // Execute cleanup
        if (cleanupPlan.tagsToPrune.length === 0) {
          setStatusMessage('No tags match cleanup criteria.');
          return;
        }

        setIsDeleting(true);
        setStatusMessage(`Pruning ${cleanupPlan.tagsToPrune.length} tags...`);

        let deletedCount = 0;
        for (const t of cleanupPlan.tagsToPrune) {
          const res = await OcClient.deleteImageStreamTag(imageStream.name, t.tag, namespace);
          if (res.success) deletedCount++;
        }

        setStatusMessage(`Successfully deleted ${deletedCount} tags!`);
        setIsDeleting(false);
        setIsCleanupWizard(false);
        onRefresh();
        return;
      }
      return;
    }

    // Normal View
    if (input === 'c') {
      setIsCleanupWizard(true);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(tags.length - 1, prev + 1));
      return;
    }

    if (input === 'd' || key.delete) {
      const selected = tags[selectedIndex];
      if (selected) {
        setIsDeleting(true);
        setStatusMessage(`Deleting tag ${selected.tag}...`);
        const res = await OcClient.deleteImageStreamTag(imageStream.name, selected.tag, namespace);
        if (res.success) {
          setTags((prev) => prev.filter((t) => t.tag !== selected.tag));
          setStatusMessage(`Deleted ${selected.tag}`);
        } else {
          setStatusMessage(`Error: ${res.message}`);
        }
        setIsDeleting(false);
        onRefresh();
      }
    }
  });

  const maxVisible = 12;
  const startIdx = Math.max(0, Math.min(selectedIndex - maxVisible + 1, tags.length - maxVisible));
  const visibleTags = tags.slice(startIdx, startIdx + maxVisible);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="green"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="green" bold>
          {theme.icons.imagestream} ImageStream: {imageStream.name} ({tags.length} tags)
        </Text>
        <Text color="gray">[Esc/q: Back | c: SemVer Cleanup Wizard | d: Delete tag]</Text>
      </Box>

      {statusMessage && (
        <Box paddingX={1} marginY={0}>
          <Text color="yellow" bold>
            {theme.icons.warning} {statusMessage}
          </Text>
        </Box>
      )}

      {/* Cleanup Wizard Panel */}
      {isCleanupWizard ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          paddingY={1}
          marginY={1}
        >
          <Text color="yellow" bold>
            {theme.icons.star} ImageStream Tag Cleanup Planner (Strategy: [s] {cleanupStrategy === 'generation' ? 'TAG GENERATIONS' : 'SEMVER RELEASES'})
          </Text>
          <Box marginY={1}>
            <Text color="white">
              Strategy: <Text color="yellow" bold>[s] {cleanupStrategy === 'generation' ? 'Tag Generations' : 'SemVer Releases'}</Text> |{' '}
              Keep Latest: <Text color="cyan" bold>[+/-] {keepCount}</Text>{' '}
              {cleanupStrategy === 'semver' && (
                <>
                  | Keep Non-SemVer: <Text color="magenta" bold>[t] {keepNonSemver ? 'YES' : 'NO'}</Text>
                </>
              )}
            </Text>
          </Box>
          <Box flexDirection="column" marginY={1}>
            <Text color="green" bold>
              {theme.icons.check} Tags to RETAIN ({cleanupPlan.tagsToKeep.length}):
            </Text>
            <Text color="gray">
              {cleanupPlan.tagsToKeep.map((t) => t.tag).slice(0, 10).join(', ') || 'None'}
            </Text>
          </Box>
          <Box flexDirection="column" marginY={1}>
            <Text color="red" bold>
              {theme.icons.cross} Tags to PRUNE ({cleanupPlan.tagsToPrune.length}):
            </Text>
            <Text color="yellow">
              {cleanupPlan.tagsToPrune.map((t) => t.tag).slice(0, 10).join(', ') || 'None'}
            </Text>
          </Box>
          <Box justifyContent="space-between" marginTop={1}>
            <Text color="white" bold>
              Press <Text color="green">[y / Enter]</Text> to Execute Cleanup | <Text color="gray">[c / Esc] Cancel</Text>
            </Text>
          </Box>
        </Box>
      ) : (
        /* Tags Table */
        <Box flexDirection="column" marginY={1}>
          <Box borderStyle="single" borderColor="gray">
            <Text bold color="white">
              {padRight('  TAG', 28)}
              {padRight('TYPE', 15)}
              {padRight('PARSED SEMVER', 20)}
              {padRight('CREATED / DOCKER REF', 40)}
            </Text>
          </Box>
          {tags.length === 0 ? (
            <Text color="gray">No tags found in this ImageStream.</Text>
          ) : (
            visibleTags.map((t, idx) => {
              const actualIdx = startIdx + idx;
              const isSelected = actualIdx === selectedIndex;
              const pointer = isSelected ? `${theme.icons.pointer} ` : '  ';

              return (
                <Box key={t.tag}>
                  <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                    {pointer}
                    {padRight(truncate(t.tag, 25), 28)}
                  </Text>
                  <Text color={t.isSemver ? 'green' : 'yellow'}>
                    {padRight(t.isSemver ? 'SemVer' : 'Tag', 15)}
                  </Text>
                  <Text color="cyan">{padRight(t.semverParsed || '-', 20)}</Text>
                  <Text color="gray">{padRight(truncate(t.dockerImageReference || t.created || '-', 38), 40)}</Text>
                </Box>
              );
            })
          )}
        </Box>
      )}

      {/* Footer */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color="gray">
          Tags are automatically sorted in semantic version descending order (newest first).
        </Text>
        <Text color="gray">
          Total: {tags.length} tags
        </Text>
      </Box>
    </Box>
  );
};
