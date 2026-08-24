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

      let res: { items: ResourceItem[]; error?: string; isUnauthorized?: boolean };
      if (kind === 'helm') {
        res = await HelmService.getReleases(namespace);
      } else {
        res = await OcClient.getResources(kind, namespace);
      }

      setResources(res.items || []);
      setError(res.error || null);
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

  // Fuzzy filter matching
  const filteredResources = useMemo(() => {
    if (!filterQuery.trim()) {
      return resources;
    }
    const matcher = new FuzzyMatcher(resources, ['name', 'status', 'namespace', 'age']);
    return matcher.search(filterQuery);
  }, [resources, filterQuery]);

  // Selected item
  const selectedItem = useMemo(() => {
    if (filteredResources.length === 0) return null;
    const idx = Math.min(selectedIndex, filteredResources.length - 1);
    return filteredResources[idx] || null;
  }, [filteredResources, selectedIndex]);

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
