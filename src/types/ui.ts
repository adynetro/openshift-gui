import { ResourceKind, ResourceItem, ImageStreamResource, HelmReleaseItem } from './k8s.js';

export type ModalType =
  | 'none'
  | 'context-switcher'
  | 'project-switcher'
  | 'log-viewer'
  | 'yaml-viewer'
  | 'describe-viewer'
  | 'scale-modal'
  | 'restart-modal'
  | 'delete-modal'
  | 'imagestream-cleaner'
  | 'helm-viewer'
  | 'command-palette'
  | 'help-modal';

export interface UIState {
  currentKind: ResourceKind;
  selectedIndex: number;
  filterQuery: string;
  isFilterActive: boolean;
  activeModal: ModalType;
  modalPayload?: any;
  statusMessage?: string;
  statusType?: 'info' | 'success' | 'warning' | 'error';
  autoRefresh: boolean;
  refreshInterval: number; // in ms
}

export interface ButtonAction {
  key: string;
  label: string;
  description: string;
  action: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export interface AutocompleteSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  category: 'command' | 'resource' | 'context' | 'project' | 'action';
  action: () => void;
}
