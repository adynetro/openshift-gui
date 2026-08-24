import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { ResourceKind, ResourceItem, ImageStreamResource } from '../types/k8s.js';
import { ModalType, AutocompleteSuggestion } from '../types/ui.js';
import { useKubeContext } from '../hooks/useKubeContext.js';
import { useResources } from '../hooks/useResources.js';
import { Header } from './Header.js';
import { ResourceTabs, RESOURCE_TABS } from './ResourceTabs.js';
import { ResourceTable } from './ResourceTable.js';
import { AutocompleteBar } from './AutocompleteBar.js';
import { ButtonBar } from './ButtonBar.js';
import { ContextModal } from './ContextModal.js';
import { LogViewer } from './LogViewer.js';
import { YamlViewer } from './YamlViewer.js';
import { ImageStreamModal } from './ImageStreamModal.js';
import { HelmModal } from './HelmModal.js';
import { ActionModal } from './ActionModal.js';
import { HelpModal } from './HelpModal.js';
import { theme } from '../utils/theme.js';

interface AppProps {
  initialKind?: ResourceKind;
  initialNamespace?: string;
}

export const App: React.FC<AppProps> = ({
  initialKind = 'pods',
  initialNamespace,
}) => {
  const { exit } = useApp();
  const [currentKind, setCurrentKind] = useState<ResourceKind>(initialKind);
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // Kube Context & Project Management
  const {
    contexts,
    currentContext,
    projects,
    currentProject,
    clusterInfo,
    loading: ctxLoading,
    switchContext,
    switchProject,
    refresh: refreshCtx,
  } = useKubeContext();

  const activeNamespace = initialNamespace || currentProject;

  // Resource Data Management
  const {
    resources,
    allResources,
    loading: resLoading,
    error: resError,
    filterQuery,
    setFilterQuery,
    selectedIndex,
    setSelectedIndex,
    selectedItem,
    refresh: refreshResources,
  } = useResources(currentKind, activeNamespace);

  const showStatus = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage((curr) => (curr?.text === text ? null : curr));
    }, 5000);
  };

  // Generate Autocomplete Suggestions
  const suggestions: AutocompleteSuggestion[] = useMemo(() => {
    const list: AutocompleteSuggestion[] = [];

    if (filterQuery.startsWith(':')) {
      const cmd = filterQuery.slice(1).toLowerCase();
      const commands = [
        { id: 'scale', title: ':scale <replicas>', badge: 's', category: 'action' as const, action: () => setActiveModal('scale-modal') },
        { id: 'logs', title: ':logs', badge: 'l', category: 'action' as const, action: () => setActiveModal('log-viewer') },
        { id: 'describe', title: ':describe', badge: 'd', category: 'action' as const, action: () => setActiveModal('describe-viewer') },
        { id: 'yaml', title: ':yaml', badge: 'y', category: 'action' as const, action: () => setActiveModal('yaml-viewer') },
        { id: 'clean', title: ':clean-imagestream', badge: 'i', category: 'action' as const, action: () => setActiveModal('imagestream-cleaner') },
        { id: 'restart', title: ':restart', badge: 'r', category: 'action' as const, action: () => setActiveModal('restart-modal') },
        { id: 'delete', title: ':delete', badge: 'x', category: 'action' as const, action: () => setActiveModal('delete-modal') },
        { id: 'ctx', title: ':context', badge: 'c', category: 'context' as const, action: () => setActiveModal('context-switcher') },
        { id: 'proj', title: ':project', badge: 'p', category: 'project' as const, action: () => setActiveModal('project-switcher') },
        { id: 'helm', title: ':helm', badge: '9', category: 'command' as const, action: () => setCurrentKind('helm') },
      ];

      return commands.filter((c) => c.id.includes(cmd) || c.title.includes(cmd));
    }

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      // Match resources
      const matches = allResources
        .filter((r) => r.name.toLowerCase().includes(q))
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          title: r.name,
          badge: r.kind,
          category: 'resource' as const,
          action: () => {
            const idx = resources.findIndex((item) => item.id === r.id);
            if (idx >= 0) setSelectedIndex(idx);
            setIsFilterActive(false);
          },
        }));

      return matches;
    }

    return list;
  }, [filterQuery, allResources, resources, setSelectedIndex]);

  // Global Keyboard Navigation
  useInput((input, key) => {
    // If a modal is open, let the modal handle input
    if (activeModal !== 'none') {
      return;
    }

    // Filter bar input handling
    if (isFilterActive) {
      if (key.escape) {
        setIsFilterActive(false);
        setFilterQuery('');
        return;
      }
      if (key.tab && suggestions.length > 0) {
        const selectedSug = suggestions[selectedSuggestionIndex] || suggestions[0];
        if (selectedSug) {
          selectedSug.action();
          setIsFilterActive(false);
          setFilterQuery('');
        }
        return;
      }
      return;
    }

    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Number keys for resource tabs (1-9, 0)
    const tabMatch = RESOURCE_TABS.find((t) => t.key === input);
    if (tabMatch) {
      setCurrentKind(tabMatch.kind);
      return;
    }

    // Filter activation
    if (input === '/') {
      setIsFilterActive(true);
      return;
    }

    // Command palette activation
    if (input === ':') {
      setIsFilterActive(true);
      setFilterQuery(':');
      return;
    }

    // Context / Project Switchers
    if (input === 'c') {
      setActiveModal('context-switcher');
      return;
    }
    if (input === 'p') {
      setActiveModal('project-switcher');
      return;
    }

    // Help
    if (input === '?' || input === 'h') {
      setActiveModal('help-modal');
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(resources.length - 1, prev + 1));
      return;
    }

    // Actions on selected item
    if (selectedItem) {
      if (key.return || input === 'd') {
        setActiveModal('describe-viewer');
        return;
      }

      if (input === 'y') {
        setActiveModal('yaml-viewer');
        return;
      }

      if (input === 'l' && (selectedItem.kind === 'pods' || selectedItem.kind === 'deployments')) {
        setActiveModal('log-viewer');
        return;
      }

      if (input === 's' && (selectedItem.kind === 'deployments' || selectedItem.kind === 'statefulsets')) {
        setActiveModal('scale-modal');
        return;
      }

      if (input === 'r') {
        setActiveModal('restart-modal');
        return;
      }

      if (input === 'i' && selectedItem.kind === 'imagestreams') {
        setActiveModal('imagestream-cleaner');
        return;
      }

      if (selectedItem.kind === 'helm') {
        if (input === 'v') {
          setActiveModal('yaml-viewer');
          return;
        }
        if (input === 'm') {
          setActiveModal('describe-viewer');
          return;
        }
        if (input === 'h') {
          setActiveModal('helm-viewer');
          return;
        }
      }

      if (input === 'x' || key.delete) {
        setActiveModal('delete-modal');
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* Top Header */}
      <Header
        clusterInfo={clusterInfo}
        loading={resLoading || ctxLoading}
        resourceCount={resources.length}
        currentKind={currentKind}
      />

      {/* Resource Tabs */}
      <ResourceTabs currentKind={currentKind} />

      {/* Autocomplete & Filter Bar */}
      <AutocompleteBar
        isActive={isFilterActive}
        query={filterQuery}
        onChange={(val) => {
          setFilterQuery(val);
          setSelectedSuggestionIndex(0);
        }}
        onSubmit={(val) => {
          setIsFilterActive(false);
          if (suggestions.length > 0 && val.startsWith(':')) {
            suggestions[0]?.action();
            setFilterQuery('');
          }
        }}
        suggestions={suggestions}
        selectedSuggestionIndex={selectedSuggestionIndex}
      />

      {/* Notification / Status Message */}
      {statusMessage && (
        <Box
          paddingX={1}
          marginY={0}
          borderStyle="single"
          borderColor={statusMessage.type === 'error' ? 'red' : 'green'}
        >
          <Text
            color={statusMessage.type === 'error' ? 'red' : 'green'}
            bold
          >
            {statusMessage.type === 'error' ? theme.icons.cross : theme.icons.check}{' '}
            {statusMessage.text}
          </Text>
        </Box>
      )}

      {/* Error Message */}
      {resError && (
        <Box paddingX={1} marginY={0} borderStyle="single" borderColor="red">
          <Text color="red" bold>
            {theme.icons.warning} Error: {resError}
          </Text>
        </Box>
      )}

      {/* Main Resource Table */}
      {activeModal === 'none' && (
        <ResourceTable
          kind={currentKind}
          items={resources}
          selectedIndex={selectedIndex}
          loading={resLoading}
        />
      )}

      {/* Context Switcher Modal */}
      {activeModal === 'context-switcher' && (
        <ContextModal
          mode="context"
          contexts={contexts}
          projects={projects}
          currentContext={currentContext}
          currentProject={activeNamespace}
          onSelectContext={async (name) => {
            setActiveModal('none');
            const ok = await switchContext(name);
            if (ok) {
              showStatus(`Switched context to ${name}`, 'success');
              refreshResources();
            } else {
              showStatus(`Failed to switch context`, 'error');
            }
          }}
          onSelectProject={() => {}}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Project Switcher Modal */}
      {activeModal === 'project-switcher' && (
        <ContextModal
          mode="project"
          contexts={contexts}
          projects={projects}
          currentContext={currentContext}
          currentProject={activeNamespace}
          onSelectContext={() => {}}
          onSelectProject={async (name) => {
            setActiveModal('none');
            const ok = await switchProject(name);
            if (ok) {
              showStatus(`Switched project to ${name}`, 'success');
              refreshResources();
            } else {
              showStatus(`Failed to switch project`, 'error');
            }
          }}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Live Log Viewer */}
      {activeModal === 'log-viewer' && selectedItem && (
        <LogViewer
          podName={selectedItem.name}
          namespace={selectedItem.namespace}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* YAML Viewer */}
      {activeModal === 'yaml-viewer' && selectedItem && (
        <YamlViewer
          mode={selectedItem.kind === 'helm' ? 'helm-values' : 'yaml'}
          kind={selectedItem.kind}
          name={selectedItem.name}
          namespace={selectedItem.namespace}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Describe Viewer */}
      {activeModal === 'describe-viewer' && selectedItem && (
        <YamlViewer
          mode={selectedItem.kind === 'helm' ? 'helm-manifest' : 'describe'}
          kind={selectedItem.kind}
          name={selectedItem.name}
          namespace={selectedItem.namespace}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* ImageStream & SemVer Tag Cleaner Modal */}
      {activeModal === 'imagestream-cleaner' && selectedItem && (
        <ImageStreamModal
          imageStream={selectedItem as ImageStreamResource}
          namespace={selectedItem.namespace}
          onClose={() => setActiveModal('none')}
          onRefresh={() => refreshResources()}
        />
      )}

      {/* Helm Manager Modal */}
      {activeModal === 'helm-viewer' && selectedItem && (
        <HelmModal
          release={selectedItem}
          namespace={selectedItem.namespace}
          onClose={() => setActiveModal('none')}
          onRefresh={() => refreshResources()}
          onViewValues={() => setActiveModal('yaml-viewer')}
          onViewManifest={() => setActiveModal('describe-viewer')}
        />
      )}

      {/* Action Modals (Scale, Restart, Delete) */}
      {(activeModal === 'scale-modal' || activeModal === 'restart-modal' || activeModal === 'delete-modal') && selectedItem && (
        <ActionModal
          mode={
            activeModal === 'scale-modal'
              ? 'scale'
              : activeModal === 'restart-modal'
              ? 'restart'
              : 'delete'
          }
          item={selectedItem}
          namespace={selectedItem.namespace}
          onClose={() => setActiveModal('none')}
          onSuccess={(msg) => {
            setActiveModal('none');
            showStatus(msg, 'success');
            refreshResources();
          }}
          onError={(msg) => {
            setActiveModal('none');
            showStatus(msg, 'error');
          }}
        />
      )}

      {/* Help Modal */}
      {activeModal === 'help-modal' && <HelpModal onClose={() => setActiveModal('none')} />}

      {/* Bottom Button Bar */}
      <ButtonBar currentKind={currentKind} />
    </Box>
  );
};
