import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResourceKind, ResourceItem } from '../types/k8s.js';
import { OcClient } from '../services/oc-client.js';
import { HelmService } from '../services/helm.js';
import { FuzzyMatcher } from '../utils/fuzzy.js';

export function useResources(kind: ResourceKind, namespace: string, autoRefresh = true, refreshInterval = 4000) {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const fetchResources = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);

      let items: ResourceItem[] = [];
      if (kind === 'helm') {
        items = await HelmService.getReleases(namespace);
      } else {
        items = await OcClient.getResources(kind, namespace);
      }

      setResources(items);
      setError(null);
    } catch (err: any) {
      setError(err.message || `Failed to fetch ${kind}`);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [kind, namespace]);

  // Initial fetch and on kind/namespace change
  useEffect(() => {
    setSelectedIndex(0);
    fetchResources(false);
  }, [fetchResources]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchResources(true);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchResources]);

  // Fuzzy filter
  const filteredResources = useMemo(() => {
    if (!filterQuery.trim()) return resources;
    const matcher = new FuzzyMatcher(resources, ['name', 'status', 'namespace', 'age']);
    return matcher.search(filterQuery);
  }, [resources, filterQuery]);

  // Clamp selection index when filtered items change
  useEffect(() => {
    if (selectedIndex >= filteredResources.length) {
      setSelectedIndex(Math.max(0, filteredResources.length - 1));
    }
  }, [filteredResources.length, selectedIndex]);

  const selectedItem = filteredResources[selectedIndex] || null;

  return {
    resources: filteredResources,
    allResources: resources,
    loading,
    error,
    filterQuery,
    setFilterQuery,
    selectedIndex,
    setSelectedIndex,
    selectedItem,
    refresh: () => fetchResources(false),
  };
}
