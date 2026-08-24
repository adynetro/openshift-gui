export type ResourceKind =
  | 'pods'
  | 'deployments'
  | 'deploymentconfigs'
  | 'statefulsets'
  | 'daemonsets'
  | 'services'
  | 'routes'
  | 'imagestreams'
  | 'configmaps'
  | 'secrets'
  | 'helm'
  | 'nodes'
  | 'events';

export interface ResourceItem {
  id: string;
  name: string;
  namespace: string;
  kind: ResourceKind;
  status: string;
  statusColor?: 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'magenta' | 'cyan';
  age: string;
  ready?: string;
  restarts?: number;
  cpu?: string;
  memory?: string;
  ip?: string;
  node?: string;
  labels?: Record<string, string>;
  raw?: any;
  extra?: Record<string, any>;
}

export interface WorkloadRevisionItem {
  name: string;
  kind: 'ReplicaSet' | 'ReplicationController' | 'ControllerRevision';
  revision: string;
  desired: number;
  current: number;
  ready: number;
  status: string;
  statusColor?: 'green' | 'red' | 'yellow' | 'blue' | 'gray';
  age: string;
  images: string[];
  active: boolean;
}

export interface WorkloadPodItem {
  name: string;
  namespace: string;
  ready: string;
  status: string;
  statusColor?: 'green' | 'red' | 'yellow' | 'blue' | 'gray';
  restarts: number;
  ip: string;
  node: string;
  age: string;
  containers: { name: string; image: string; ready: boolean; state: string }[];
}

export interface WorkloadDetails {
  kind: ResourceKind;
  name: string;
  namespace: string;
  strategy?: string;
  triggers?: string;
  selectors?: Record<string, string>;
  desiredReplicas: number;
  readyReplicas: number;
  images: string[];
  revisions: WorkloadRevisionItem[];
  pods: WorkloadPodItem[];
  manifestYaml?: string;
}

export interface ImageStreamTagInfo {
  tag: string;
  created: string;
  dockerImageReference?: string;
  imageSize?: number;
  isSemver: boolean;
  semverParsed?: string | null;
  pruneSelected?: boolean;
}

export interface ImageStreamResource extends ResourceItem {
  tags: ImageStreamTagInfo[];
  tagCount: number;
}

export interface HelmReleaseItem {
  id: string;
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  appVersion: string;
}

export interface KubeContext {
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  isCurrent: boolean;
}

export interface ProjectInfo {
  name: string;
  displayName: string;
  status: string;
  isCurrent: boolean;
}

export interface ClusterInfo {
  server: string;
  user: string;
  context: string;
  namespace: string;
  connected: boolean;
}
