import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { AutocompleteSuggestion } from '../types/ui.js';
import { theme } from '../utils/theme.js';

interface AutocompleteBarProps {
  isActive: boolean;
  query: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  suggestions: AutocompleteSuggestion[];
  selectedSuggestionIndex: number;
}

export const AutocompleteBar: React.FC<AutocompleteBarProps> = ({
  isActive,
  query,
  onChange,
  onSubmit,
  suggestions,
  selectedSuggestionIndex,
}) => {
  return (
    <Box flexDirection="column" marginY={1}>
      {/* Search Input Bar */}
      <Box
        borderStyle="round"
        borderColor={isActive ? 'yellow' : 'gray'}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box>
          <Text color="yellow" bold>
            {theme.icons.search} Filter / Command:{' '}
          </Text>
          {isActive ? (
            // @ts-ignore
            <TextInput
              value={query}
              onChange={onChange}
              onSubmit={onSubmit}
              placeholder="Type to filter or :command (e.g. :scale, :logs, :clean, :ctx)..."
            />
          ) : (
            <Text color={query ? 'white' : 'gray'}>
              {query || 'Press [/] to filter or [:] for command palette'}
            </Text>
          )}
        </Box>
        <Box>
          {isActive && (
            <Text color="gray">
              [Enter] Apply | [Tab] Autocomplete | [Esc] Cancel
            </Text>
          )}
        </Box>
      </Box>

      {/* Autocomplete Suggestion Pills / Buttons */}
      {isActive && suggestions.length > 0 && (
        <Box flexDirection="row" flexWrap="wrap" marginTop={0} paddingX={1}>
          <Text color="gray">Suggestions: </Text>
          {suggestions.slice(0, 6).map((sug, idx) => {
            const isSelected = idx === selectedSuggestionIndex;
            return (
              <Box
                key={sug.id || idx}
                marginRight={1}
                paddingX={1}
                borderStyle="single"
                borderColor={isSelected ? 'cyan' : 'gray'}
              >
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {sug.badge && <Text color="yellow">[{sug.badge}] </Text>}
                  {sug.title}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
