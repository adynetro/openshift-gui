import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Rocket,
  Layers,
  Server,
  Clock,
  Globe,
  Database,
  Plus,
  Trash2,
  Code2,
  Split,
  Sparkles,
  Check,
  Copy,
  RefreshCw,
  SlidersHorizontal,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Box,
  Layers2,
  Workflow,
  Cpu,
  Network,
  Tag,
  Key,
  FileCode2,
  ChevronRight,
  ExternalLink,
  FolderGit2,
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { parseAllDocuments, stringify as stringifyYaml } from 'yaml';
import { ResourceItem, ProjectInfo } from '../../types/k8s.js';
import { useCurrentTheme } from '../utils/themes.js';

interface AddAppWizardModalProps {
  namespace: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export type WorkloadKind = 'Deployment' | 'StatefulSet' | 'CronJob' | 'DeploymentConfig';

export interface EnvVarEntry {
  id: string;
  name: string;
  value: string;
}

export interface AppWizardState {
  // 1. Basic Info
  kind: WorkloadKind;
  name: string;
  namespace: string;
  replicas: number;
  labels: Record<string, string>;

  // CronJob specifics
  cronSchedule: string;
  concurrencyPolicy: 'Allow' | 'Forbid' | 'Replace';
  restartPolicy: 'OnFailure' | 'Never';

  // 2. Container Image
  containerName: string;
  image: string;
  imagePullPolicy: 'IfNotPresent' | 'Always' | 'Never';
  command: string;
  args: string;

  // 3. Ports & Networking
  containerPort: number;
  servicePort: number;
  protocol: 'TCP' | 'UDP';
  createService: boolean;
  createRoute: boolean;
  routeTls: 'none' | 'edge' | 'reencrypt' | 'passthrough';
  routeHostname: string;

  // 4. Env Vars
  envVars: EnvVarEntry[];

  // 5. Resources (Requests & Limits)
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;

  // 6. Probes / Health Checks
  enableLivenessProbe: boolean;
  livenessPath: string;
  livenessPort: number;
  enableReadinessProbe: boolean;
  readinessPath: string;
  readinessPort: number;

  // 7. Storage / PVC
  enablePvc: boolean;
  pvcMountPath: string;
  pvcSize: string;
  pvcStorageClass: string;
}

const TEMPLATES: Array<{
  name: string;
  kind: WorkloadKind;
  description: string;
  icon: any;
  build: (ns: string) => AppWizardState;
}> = [
  {
    name: 'Node.js Web App',
    kind: 'Deployment',
    description: 'Node.js/Express web service exposed via Service and OpenShift Edge TLS Route.',
    icon: Rocket,
    build: (ns) => ({
      kind: 'Deployment',
      name: 'node-app',
      namespace: ns,
      replicas: 1,
      labels: { app: 'node-app', tier: 'frontend' },
      cronSchedule: '0 0 * * *',
      concurrencyPolicy: 'Allow',
      restartPolicy: 'OnFailure',
      containerName: 'node-app',
      image: 'node:20-alpine',
      imagePullPolicy: 'IfNotPresent',
      command: '',
      args: '',
      containerPort: 3000,
      servicePort: 3000,
      protocol: 'TCP',
      createService: true,
      createRoute: true,
      routeTls: 'edge',
      routeHostname: '',
      envVars: [
        { id: '1', name: 'NODE_ENV', value: 'production' },
        { id: '2', name: 'PORT', value: '3000' },
      ],
      cpuRequest: '100m',
      cpuLimit: '500m',
      memoryRequest: '128Mi',
      memoryLimit: '512Mi',
      enableLivenessProbe: true,
      livenessPath: '/healthz',
      livenessPort: 3000,
      enableReadinessProbe: true,
      readinessPath: '/',
      readinessPort: 3000,
      enablePvc: false,
      pvcMountPath: '/app/data',
      pvcSize: '5Gi',
      pvcStorageClass: '',
    }),
  },
  {
    name: 'Spring Boot / Java API',
    kind: 'Deployment',
    description: 'Java microservice with JVM memory limits and Actuator health probes.',
    icon: Server,
    build: (ns) => ({
      kind: 'Deployment',
      name: 'java-service',
      namespace: ns,
      replicas: 1,
      labels: { app: 'java-service', tier: 'backend' },
      cronSchedule: '0 0 * * *',
      concurrencyPolicy: 'Allow',
      restartPolicy: 'OnFailure',
      containerName: 'java-service',
      image: 'registry.access.redhat.com/ubi9/openjdk-17:latest',
      imagePullPolicy: 'IfNotPresent',
      command: '',
      args: '',
      containerPort: 8080,
      servicePort: 8080,
      protocol: 'TCP',
      createService: true,
      createRoute: true,
      routeTls: 'edge',
      routeHostname: '',
      envVars: [
        { id: '1', name: 'SPRING_PROFILES_ACTIVE', value: 'production' },
        { id: '2', name: 'JAVA_OPTS', value: '-Xms256m -Xmx512m' },
      ],
      cpuRequest: '250m',
      cpuLimit: '1000m',
      memoryRequest: '512Mi',
      memoryLimit: '1Gi',
      enableLivenessProbe: true,
      livenessPath: '/actuator/health/liveness',
      livenessPort: 8080,
      enableReadinessProbe: true,
      readinessPath: '/actuator/health/readiness',
      readinessPort: 8080,
      enablePvc: false,
      pvcMountPath: '/data',
      pvcSize: '10Gi',
      pvcStorageClass: '',
    }),
  },
  {
    name: 'Python FastAPI / Flask',
    kind: 'Deployment',
    description: 'High-performance Python ASGI/WSGI web application with Uvicorn.',
    icon: Sparkles,
    build: (ns) => ({
      kind: 'Deployment',
      name: 'python-api',
      namespace: ns,
      replicas: 1,
      labels: { app: 'python-api', tier: 'api' },
      cronSchedule: '0 0 * * *',
      concurrencyPolicy: 'Allow',
      restartPolicy: 'OnFailure',
      containerName: 'python-api',
      image: 'python:3.11-slim',
      imagePullPolicy: 'IfNotPresent',
      command: '',
      args: '',
      containerPort: 8000,
      servicePort: 8000,
      protocol: 'TCP',
      createService: true,
      createRoute: true,
      routeTls: 'edge',
      routeHostname: '',
      envVars: [
        { id: '1', name: 'PYTHONUNBUFFERED', value: '1' },
        { id: '2', name: 'PORT', value: '8000' },
      ],
      cpuRequest: '100m',
      cpuLimit: '500m',
      memoryRequest: '256Mi',
      memoryLimit: '512Mi',
      enableLivenessProbe: true,
      livenessPath: '/health',
      livenessPort: 8000,
      enableReadinessProbe: true,
      readinessPath: '/docs',
      readinessPort: 8000,
      enablePvc: false,
      pvcMountPath: '/data',
      pvcSize: '5Gi',
      pvcStorageClass: '',
    }),
  },
  {
    name: 'PostgreSQL Database',
    kind: 'StatefulSet',
    description: 'Stateful database cluster with persistent volume claim template on /var/lib/postgresql/data.',
    icon: Database,
    build: (ns) => ({
      kind: 'StatefulSet',
      name: 'postgres-db',
      namespace: ns,
      replicas: 1,
      labels: { app: 'postgres-db', role: 'database' },
      cronSchedule: '0 0 * * *',
      concurrencyPolicy: 'Allow',
      restartPolicy: 'OnFailure',
      containerName: 'postgres',
      image: 'postgres:16-alpine',
      imagePullPolicy: 'IfNotPresent',
      command: '',
      args: '',
      containerPort: 5432,
      servicePort: 5432,
      protocol: 'TCP',
      createService: true,
      createRoute: false,
      routeTls: 'none',
      routeHostname: '',
      envVars: [
        { id: '1', name: 'POSTGRES_DB', value: 'appdb' },
        { id: '2', name: 'POSTGRES_USER', value: 'appuser' },
        { id: '3', name: 'POSTGRES_PASSWORD', value: 'secretpass' },
        { id: '4', name: 'PGDATA', value: '/var/lib/postgresql/data/pgdata' },
      ],
      cpuRequest: '250m',
      cpuLimit: '1000m',
      memoryRequest: '512Mi',
      memoryLimit: '1Gi',
      enableLivenessProbe: false,
      livenessPath: '',
      livenessPort: 5432,
      enableReadinessProbe: false,
      readinessPath: '',
      readinessPort: 5432,
      enablePvc: true,
      pvcMountPath: '/var/lib/postgresql/data',
      pvcSize: '20Gi',
      pvcStorageClass: '',
    }),
  },
  {
    name: 'Nightly Database Backup CronJob',
    kind: 'CronJob',
    description: 'Scheduled batch task running at 02:00 AM every night to perform backups.',
    icon: Clock,
    build: (ns) => ({
      kind: 'CronJob',
      name: 'db-backup-nightly',
      namespace: ns,
      replicas: 1,
      labels: { app: 'db-backup', task: 'cron' },
      cronSchedule: '0 2 * * *',
      concurrencyPolicy: 'Forbid',
      restartPolicy: 'OnFailure',
      containerName: 'backup-runner',
      image: 'postgres:16-alpine',
      imagePullPolicy: 'IfNotPresent',
      command: '/bin/sh',
      args: '-c, echo "Starting database backup at $(date)..." && pg_dumpall -h postgres-db -U appuser > /backup/backup-$(date +%Y%m%d).sql && echo "Backup completed successfully!"',
      containerPort: 0,
      servicePort: 0,
      protocol: 'TCP',
      createService: false,
      createRoute: false,
      routeTls: 'none',
      routeHostname: '',
      envVars: [
        { id: '1', name: 'PGPASSWORD', value: 'secretpass' },
        { id: '2', name: 'BACKUP_DIR', value: '/backup' },
      ],
      cpuRequest: '100m',
      cpuLimit: '500m',
      memoryRequest: '128Mi',
      memoryLimit: '512Mi',
      enableLivenessProbe: false,
      livenessPath: '',
      livenessPort: 0,
      enableReadinessProbe: false,
      readinessPath: '',
      readinessPort: 0,
      enablePvc: true,
      pvcMountPath: '/backup',
      pvcSize: '50Gi',
      pvcStorageClass: '',
    }),
  },
  {
    name: 'Nginx Static Web Server',
    kind: 'Deployment',
    description: 'Lightweight static HTML / SPA web server with edge route.',
    icon: Globe,
    build: (ns) => ({
      kind: 'Deployment',
      name: 'nginx-web',
      namespace: ns,
      replicas: 1,
      labels: { app: 'nginx-web', tier: 'frontend' },
      cronSchedule: '0 0 * * *',
      concurrencyPolicy: 'Allow',
      restartPolicy: 'OnFailure',
      containerName: 'nginx',
      image: 'nginx:alpine',
      imagePullPolicy: 'IfNotPresent',
      command: '',
      args: '',
      containerPort: 80,
      servicePort: 80,
      protocol: 'TCP',
      createService: true,
      createRoute: true,
      routeTls: 'edge',
      routeHostname: '',
      envVars: [],
      cpuRequest: '50m',
      cpuLimit: '200m',
      memoryRequest: '64Mi',
      memoryLimit: '128Mi',
      enableLivenessProbe: true,
      livenessPath: '/',
      livenessPort: 80,
      enableReadinessProbe: true,
      readinessPath: '/',
      readinessPort: 80,
      enablePvc: false,
      pvcMountPath: '/usr/share/nginx/html',
      pvcSize: '5Gi',
      pvcStorageClass: '',
    }),
  },
];

function generateK8sYaml(state: AppWizardState): string {
  const docs: any[] = [];
  const appName = state.name.trim() || 'my-app';
  const ns = state.namespace.trim() || 'default';
  const matchLabels = { app: appName, ...state.labels };

  // 1. Container Definition
  const container: any = {
    name: state.containerName.trim() || appName,
    image: state.image.trim() || 'nginx:alpine',
    imagePullPolicy: state.imagePullPolicy,
  };

  if (state.containerPort > 0) {
    container.ports = [
      {
        name: 'http',
        containerPort: Number(state.containerPort),
        protocol: state.protocol,
      },
    ];
  }

  if (state.command.trim()) {
    container.command = state.command.split(',').map((s) => s.trim());
  }

  if (state.args.trim()) {
    container.args = state.args.split(',').map((s) => s.trim());
  }

  if (state.envVars.length > 0) {
    container.env = state.envVars
      .filter((e) => e.name.trim())
      .map((e) => ({
        name: e.name.trim(),
        value: e.value,
      }));
  }

  // Resources
  const resources: any = {};
  if (state.cpuRequest || state.memoryRequest) {
    resources.requests = {};
    if (state.cpuRequest) resources.requests.cpu = state.cpuRequest;
    if (state.memoryRequest) resources.requests.memory = state.memoryRequest;
  }
  if (state.cpuLimit || state.memoryLimit) {
    resources.limits = {};
    if (state.cpuLimit) resources.limits.cpu = state.cpuLimit;
    if (state.memoryLimit) resources.limits.memory = state.memoryLimit;
  }
  if (Object.keys(resources).length > 0) {
    container.resources = resources;
  }

  // Probes
  if (state.enableLivenessProbe && state.containerPort > 0) {
    container.livenessProbe = {
      httpGet: {
        path: state.livenessPath || '/',
        port: Number(state.livenessPort || state.containerPort),
      },
      initialDelaySeconds: 10,
      periodSeconds: 10,
      timeoutSeconds: 3,
    };
  }

  if (state.enableReadinessProbe && state.containerPort > 0) {
    container.readinessProbe = {
      httpGet: {
        path: state.readinessPath || '/',
        port: Number(state.readinessPort || state.containerPort),
      },
      initialDelaySeconds: 5,
      periodSeconds: 5,
      timeoutSeconds: 2,
    };
  }

  // Volume Mounts (PVC)
  if (state.enablePvc && state.pvcMountPath) {
    container.volumeMounts = [
      {
        name: `${appName}-data`,
        mountPath: state.pvcMountPath,
      },
    ];
  }

  // 2. Main Workload Document
  if (state.kind === 'CronJob') {
    const cronDoc: any = {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: {
        name: appName,
        namespace: ns,
        labels: matchLabels,
      },
      spec: {
        schedule: state.cronSchedule || '0 0 * * *',
        concurrencyPolicy: state.concurrencyPolicy,
        jobTemplate: {
          spec: {
            template: {
              metadata: {
                labels: matchLabels,
              },
              spec: {
                restartPolicy: state.restartPolicy,
                containers: [container],
              },
            },
          },
        },
      },
    };
    if (state.enablePvc && state.pvcMountPath) {
      cronDoc.spec.jobTemplate.spec.template.spec.volumes = [
        {
          name: `${appName}-data`,
          persistentVolumeClaim: {
            claimName: `${appName}-pvc`,
          },
        },
      ];
    }
    docs.push(cronDoc);
  } else if (state.kind === 'StatefulSet') {
    const stsDoc: any = {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: appName,
        namespace: ns,
        labels: matchLabels,
      },
      spec: {
        serviceName: appName,
        replicas: Number(state.replicas),
        selector: {
          matchLabels,
        },
        template: {
          metadata: {
            labels: matchLabels,
          },
          spec: {
            containers: [container],
          },
        },
      },
    };

    if (state.enablePvc && state.pvcMountPath) {
      stsDoc.spec.volumeClaimTemplates = [
        {
          metadata: {
            name: `${appName}-data`,
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: {
                storage: state.pvcSize || '10Gi',
              },
            },
            ...(state.pvcStorageClass ? { storageClassName: state.pvcStorageClass } : {}),
          },
        },
      ];
    }
    docs.push(stsDoc);
  } else if (state.kind === 'DeploymentConfig') {
    const dcDoc: any = {
      apiVersion: 'apps.openshift.io/v1',
      kind: 'DeploymentConfig',
      metadata: {
        name: appName,
        namespace: ns,
        labels: matchLabels,
      },
      spec: {
        replicas: Number(state.replicas),
        selector: matchLabels,
        strategy: {
          type: 'Rolling',
        },
        template: {
          metadata: {
            labels: matchLabels,
          },
          spec: {
            containers: [container],
          },
        },
        triggers: [
          { type: 'ConfigChange' },
        ],
      },
    };
    if (state.enablePvc && state.pvcMountPath) {
      dcDoc.spec.template.spec.volumes = [
        {
          name: `${appName}-data`,
          persistentVolumeClaim: {
            claimName: `${appName}-pvc`,
          },
        },
      ];
    }
    docs.push(dcDoc);
  } else {
    // Standard Deployment (apps/v1)
    const deployDoc: any = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: appName,
        namespace: ns,
        labels: matchLabels,
      },
      spec: {
        replicas: Number(state.replicas),
        selector: {
          matchLabels,
        },
        template: {
          metadata: {
            labels: matchLabels,
          },
          spec: {
            containers: [container],
          },
        },
      },
    };
    if (state.enablePvc && state.pvcMountPath) {
      deployDoc.spec.template.spec.volumes = [
        {
          name: `${appName}-data`,
          persistentVolumeClaim: {
            claimName: `${appName}-pvc`,
          },
        },
      ];
    }
    docs.push(deployDoc);
  }

  // 3. PersistentVolumeClaim Document (for Deployment/DC if PVC is enabled)
  if (state.enablePvc && state.kind !== 'StatefulSet') {
    docs.push({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: `${appName}-pvc`,
        namespace: ns,
        labels: matchLabels,
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: state.pvcSize || '10Gi',
          },
        },
        ...(state.pvcStorageClass ? { storageClassName: state.pvcStorageClass } : {}),
      },
    });
  }

  // 4. Service Document
  if (state.createService && state.containerPort > 0 && state.kind !== 'CronJob') {
    docs.push({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: appName,
        namespace: ns,
        labels: matchLabels,
      },
      spec: {
        type: 'ClusterIP',
        selector: matchLabels,
        ports: [
          {
            name: 'http',
            port: Number(state.servicePort || state.containerPort),
            targetPort: Number(state.containerPort),
            protocol: state.protocol,
          },
        ],
      },
    });
  }

  // 5. OpenShift Route Document
  if (state.createRoute && state.createService && state.containerPort > 0 && state.kind !== 'CronJob') {
    const routeDoc: any = {
      apiVersion: 'route.openshift.io/v1',
      kind: 'Route',
      metadata: {
        name: appName,
        namespace: ns,
        labels: matchLabels,
      },
      spec: {
        to: {
          kind: 'Service',
          name: appName,
          weight: 100,
        },
        port: {
          targetPort: 'http',
        },
      },
    };

    if (state.routeHostname.trim()) {
      routeDoc.spec.host = state.routeHostname.trim();
    }

    if (state.routeTls !== 'none') {
      routeDoc.spec.tls = {
        termination: state.routeTls,
        insecureEdgeTerminationPolicy: 'Redirect',
      };
    }

    docs.push(routeDoc);
  }

  return docs.map((d) => stringifyYaml(d)).join('---\n');
}

export const AddAppWizardModal: React.FC<AddAppWizardModalProps> = ({
  namespace,
  onClose,
  onSuccess,
}) => {
  const { theme, cmTheme } = useCurrentTheme();
  const [activeTab, setActiveTab] = useState<'basics' | 'image' | 'network' | 'env' | 'resources' | 'storage'>('basics');
  const [viewMode, setViewMode] = useState<'wizard' | 'split' | 'yaml'>('split');
  const [imageStreams, setImageStreams] = useState<ResourceItem[]>([]);
  const [loadingImageStreams, setLoadingImageStreams] = useState<boolean>(false);
  const [imageDropdownOpen, setImageDropdownOpen] = useState<boolean>(false);

  const initialNs = namespace && namespace !== 'all-projects' && namespace !== '__all__' ? namespace : 'default';

  const [projectList, setProjectList] = useState<ProjectInfo[]>([]);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(false);
  const [imageStreamFilter, setImageStreamFilter] = useState<string>('');

  const [state, setState] = useState<AppWizardState>(() => ({
    kind: 'Deployment',
    name: 'my-web-app',
    namespace: initialNs,
    replicas: 1,
    labels: { app: 'my-web-app', env: 'production' },
    cronSchedule: '0 0 * * *',
    concurrencyPolicy: 'Allow',
    restartPolicy: 'OnFailure',
    containerName: 'web',
    image: 'nginx:alpine',
    imagePullPolicy: 'IfNotPresent',
    command: '',
    args: '',
    containerPort: 80,
    servicePort: 80,
    protocol: 'TCP',
    createService: true,
    createRoute: true,
    routeTls: 'edge',
    routeHostname: '',
    envVars: [
      { id: '1', name: 'PORT', value: '80' },
      { id: '2', name: 'ENVIRONMENT', value: 'production' },
    ],
    cpuRequest: '100m',
    cpuLimit: '500m',
    memoryRequest: '128Mi',
    memoryLimit: '512Mi',
    enableLivenessProbe: true,
    livenessPath: '/',
    livenessPort: 80,
    enableReadinessProbe: true,
    readinessPath: '/',
    readinessPort: 80,
    enablePvc: false,
    pvcMountPath: '/data',
    pvcSize: '10Gi',
    pvcStorageClass: '',
  }));

  const [yamlCode, setYamlCode] = useState<string>(() => generateK8sYaml(state));
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [newLabelKey, setNewLabelKey] = useState<string>('');
  const [newLabelVal, setNewLabelVal] = useState<string>('');

  const validateYamlString = (val: string) => {
    if (!val.trim()) return;
    const docs = parseAllDocuments(val);
    for (const doc of docs) {
      if (doc.errors && doc.errors.length > 0) {
        throw doc.errors[0];
      }
    }
  };

  // Fetch all cluster projects / namespaces for the Project selector
  useEffect(() => {
    async function fetchProjects() {
      setLoadingProjects(true);
      try {
        const api = (window as any).electronAPI;
        if (api?.getProjects) {
          const list = await api.getProjects();
          if (Array.isArray(list)) {
            // Filter out 'all-projects' since deployment must target a specific namespace
            const valid = list.filter((p) => p.name !== 'all-projects' && p.name !== '__all__');
            setProjectList(valid);
          }
        }
      } catch (err) {
        console.error('Failed to load project list', err);
      } finally {
        setLoadingProjects(false);
      }
    }
    fetchProjects();
  }, []);

  // Fetch local ImageStreams AND openshift project ImageStreams
  useEffect(() => {
    async function fetchImageStreams() {
      setLoadingImageStreams(true);
      try {
        const api = (window as any).electronAPI;
        if (api?.getResources) {
          const promises: Promise<any>[] = [];
          if (state.namespace && state.namespace !== 'openshift') {
            promises.push(api.getResources('imagestreams', state.namespace));
          } else {
            promises.push(Promise.resolve([]));
          }
          // Fetch openshift project ImageStreams
          promises.push(api.getResources('imagestreams', 'openshift'));

          const [projectIsRes, openshiftIsRes] = await Promise.all(promises);

          const projectIsList: ResourceItem[] = Array.isArray(projectIsRes)
            ? projectIsRes
            : (projectIsRes?.items || []);
          const openshiftIsList: ResourceItem[] = Array.isArray(openshiftIsRes)
            ? openshiftIsRes
            : (openshiftIsRes?.items || []);

          const combined: ResourceItem[] = [];
          projectIsList.forEach((is: ResourceItem) => {
            combined.push({ ...is, namespace: state.namespace });
          });
          openshiftIsList.forEach((is: ResourceItem) => {
            combined.push({ ...is, namespace: 'openshift' });
          });
          setImageStreams(combined);
        }
      } catch (err) {
        console.error('Failed to load ImageStreams for autocompletion', err);
      } finally {
        setLoadingImageStreams(false);
      }
    }
    fetchImageStreams();
  }, [state.namespace]);

  // Sync Form State -> YAML
  const updateState = useCallback((updater: (prev: AppWizardState) => AppWizardState) => {
    setState((prev) => {
      const next = updater(prev);
      const nextYaml = generateK8sYaml(next);
      setYamlCode(nextYaml);
      return next;
    });
  }, []);

  // Handler for App Name change: Automatically synchronizes label app=name
  const handleNameChange = (newName: string) => {
    updateState((s) => {
      const prevName = s.name;
      const updatedLabels = { ...s.labels, app: newName.trim() || 'app' };
      return {
        ...s,
        name: newName,
        containerName: s.containerName === prevName || s.containerName === 'web' || !s.containerName ? newName : s.containerName,
        labels: updatedLabels,
      };
    });
  };

  const handleApplyTemplate = (tmpl: typeof TEMPLATES[0]) => {
    const nextState = tmpl.build(state.namespace);
    setState(nextState);
    setYamlCode(generateK8sYaml(nextState));
    setStatusMessage({ text: `Applied template: ${tmpl.name}`, type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      validateYamlString(yamlCode);
      const res = await (window as any).electronAPI.applyYaml(yamlCode, state.namespace);
      if (res.success) {
        onSuccess(res.message || `Successfully deployed ${state.kind} '${state.name}' to project ${state.namespace}!`);
        onClose();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to apply workload YAML', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyYaml = () => {
    navigator.clipboard.writeText(yamlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ImageStream options extracted from cluster categorized by Project vs openshift project
  const { projectStreamTags, openshiftStreamTags } = useMemo(() => {
    const proj: Array<{ tag: string; isName: string; namespace: string; fullRef: string }> = [];
    const openshiftTags: Array<{ tag: string; isName: string; namespace: string; fullRef: string }> = [];

    imageStreams.forEach((is) => {
      const ns = is.namespace || 'openshift';
      const rawTags: any = is.extra?.tags || (is as any).tags || is.extra?.semverTags || is.raw?.status?.tags || is.raw?.spec?.tags || [];
      const tagSet = new Set<string>();

      if (Array.isArray(rawTags)) {
        rawTags.forEach((t: any) => {
          if (typeof t === 'string' && t.trim()) {
            tagSet.add(t.trim());
          } else if (t && typeof t === 'object') {
            const tagName = t.tag || t.name;
            if (tagName && typeof tagName === 'string' && tagName.trim()) {
              tagSet.add(tagName.trim());
            }
          }
        });
      }

      if (tagSet.size === 0 && is.raw?.spec?.tags && Array.isArray(is.raw.spec.tags)) {
        is.raw.spec.tags.forEach((st: any) => {
          if (st?.name && typeof st.name === 'string') tagSet.add(st.name.trim());
        });
      }

      if (tagSet.size === 0) {
        tagSet.add('latest');
      }

      tagSet.forEach((tagName) => {
        const entry = {
          tag: tagName,
          isName: is.name,
          namespace: ns,
          fullRef: ns === 'openshift'
            ? `openshift/${is.name}:${tagName}`
            : `${is.name}:${tagName}`,
        };
        if (ns === 'openshift') {
          openshiftTags.push(entry);
        } else {
          proj.push(entry);
        }
      });
    });

    return { projectStreamTags: proj, openshiftStreamTags: openshiftTags };
  }, [imageStreams]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-in fade-in duration-150"
    >
      <div
        className="rounded-xl shadow-2xl w-[98vw] max-w-[1850px] h-[95vh] flex flex-col overflow-hidden border transition-colors"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-color, #334155)',
          color: 'var(--text-main, #f8fafc)',
        }}
      >
        {/* Modal Header */}
        <div
          className="p-3 border-b flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: 'rgba(238, 0, 0, 0.15)',
                color: 'var(--primary-red, #ee0000)',
                borderColor: 'rgba(238, 0, 0, 0.3)',
              }}
            >
              <Rocket size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span>Add Application Workload Wizard</span>
                  <span className="text-slate-400 font-mono text-xs">•</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded border bg-red-950/60 text-red-300 border-red-800 font-bold">
                    {state.kind}
                  </span>
                </h2>
              </div>
              <p className="text-[11px] font-mono opacity-60">
                Visual Workload Generator inspired by k8syaml • Live synchronized YAML • ImageStream Autocompletion
              </p>
            </div>
          </div>

          {/* Right Toolbar: Templates & Views */}
          <div className="flex items-center gap-2">
            {/* Quick Templates Selector */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400 font-mono">Starter:</span>
              <select
                onChange={(e) => {
                  const tmpl = TEMPLATES.find((t) => t.name === e.target.value);
                  if (tmpl) handleApplyTemplate(tmpl);
                }}
                defaultValue=""
                className="px-2 py-1 rounded text-xs font-mono border outline-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-input, #0f172a)',
                  borderColor: 'var(--border-subtle, #334155)',
                  color: 'var(--text-main, #f8fafc)',
                }}
              >
                <option value="" disabled>
                  Choose Starter Template...
                </option>
                {TEMPLATES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.kind})
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div
              className="flex items-center p-1 rounded-lg border ml-2"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
              }}
            >
              <button
                onClick={() => setViewMode('wizard')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'wizard' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Visual Form Wizard"
              >
                <SlidersHorizontal size={13} />
                <span>Wizard</span>
              </button>

              <button
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'split' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Split View (Visual Wizard + Live CodeMirror YAML)"
              >
                <Split size={13} />
                <span>Split View</span>
              </button>

              <button
                onClick={() => setViewMode('yaml')}
                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  viewMode === 'yaml' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="YAML Code Editor"
              >
                <Code2 size={13} />
                <span>YAML</span>
              </button>
            </div>

            <button
              onClick={handleCopyYaml}
              className="p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
                color: 'var(--text-main, #f8fafc)',
              }}
              title="Copy complete YAML definition"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors ml-1"
              title="Close window (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs flex items-center gap-2 border-b font-mono shrink-0 ${
              statusMessage.type === 'error'
                ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                : 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
            }`}
          >
            {statusMessage.type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* LEFT: STEP-BY-STEP VISUAL WIZARD */}
          {(viewMode === 'wizard' || viewMode === 'split') && (
            <div
              className={`flex-1 overflow-y-auto flex flex-col ${
                viewMode === 'split' ? 'border-r' : ''
              }`}
              style={{
                backgroundColor: 'var(--bg-main, #0b0f19)',
                borderColor: 'var(--border-color, #1e293b)',
              }}
            >
              {/* Wizard Nav Tabs */}
              <div
                className="flex items-center gap-1 p-2 border-b overflow-x-auto shrink-0"
                style={{
                  backgroundColor: 'var(--bg-card-header, #0f172a)',
                  borderColor: 'var(--border-color, #1e293b)',
                }}
              >
                {[
                  { id: 'basics', label: '1. Workload & Core', icon: Layers },
                  { id: 'image', label: '2. Container & Image', icon: Box },
                  { id: 'network', label: '3. Service & Route', icon: Network },
                  { id: 'env', label: '4. Env Variables', icon: Key },
                  { id: 'resources', label: '5. Compute & Probes', icon: Cpu },
                  { id: 'storage', label: '6. PVC & Storage', icon: HardDrive },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-red-600 text-white shadow-md shadow-red-950 font-bold'
                          : 'opacity-70 hover:opacity-100 hover:bg-white/5 text-slate-300'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Wizard Content Body */}
              <div className="p-5 space-y-6 flex-1">
                {/* TAB 1: WORKLOAD BASICS */}
                {activeTab === 'basics' && (
                  <div className="space-y-4 max-w-3xl">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <Layers size={16} className="text-red-400" />
                        <span>Workload Kind & Metadata</span>
                      </h3>
                      <p className="text-xs text-slate-400">Select workload controller architecture and target namespace.</p>
                    </div>

                    {/* Kind Selector Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { kind: 'Deployment', label: 'Deployment', desc: 'Stateless apps with zero-downtime rolling updates', icon: Layers },
                        { kind: 'StatefulSet', label: 'StatefulSet', desc: 'Stateful databases with ordered unique pods & PVCs', icon: Database },
                        { kind: 'CronJob', label: 'CronJob', desc: 'Scheduled periodic tasks and background batch jobs', icon: Clock },
                        { kind: 'DeploymentConfig', label: 'DeploymentConfig', desc: 'OpenShift native controller with ImageStream triggers', icon: Layers2 },
                      ].map((k) => {
                        const Icon = k.icon;
                        const isSelected = state.kind === k.kind;
                        return (
                          <div
                            key={k.kind}
                            onClick={() => updateState((s) => ({ ...s, kind: k.kind as WorkloadKind }))}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-red-950/40 border-red-600 shadow-lg shadow-red-950/50 ring-1 ring-red-500'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <Icon size={18} className={isSelected ? 'text-red-400' : 'text-slate-400'} />
                              {isSelected && <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />}
                            </div>
                            <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>{k.label}</div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{k.desc}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* App Name & Namespace */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Application Name *</label>
                        <input
                          type="text"
                          value={state.name}
                          onChange={(e) => handleNameChange(e.target.value)}
                          placeholder="e.g. backend-api"
                          className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-slate-100 text-xs font-mono border-slate-700 focus:border-red-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                          <span>Target Project / Namespace *</span>
                          <span className="text-[10px] text-purple-400 font-mono">
                            {projectList.length > 0 ? `${projectList.length} Projects` : 'Project'}
                          </span>
                        </label>
                        <div className="relative">
                          <select
                            value={state.namespace}
                            onChange={(e) => updateState((s) => ({ ...s, namespace: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-purple-300 text-xs font-mono border-slate-700 focus:border-purple-500 cursor-pointer outline-none"
                          >
                            {projectList.length === 0 ? (
                              <option value={state.namespace}>{state.namespace}</option>
                            ) : (
                              projectList.map((p) => (
                                <option key={p.name} value={p.name}>
                                  {p.name} {p.displayName && p.displayName !== p.name ? `(${p.displayName})` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Replicas (for Deployment / StatefulSet / DC) */}
                    {state.kind !== 'CronJob' && (
                      <div className="space-y-1.5 pt-2">
                        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                          <span>Pod Replicas Count:</span>
                          <span className="font-mono text-red-400 font-bold">{state.replicas} Pod(s)</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={10}
                            value={state.replicas}
                            onChange={(e) => updateState((s) => ({ ...s, replicas: Number(e.target.value) }))}
                            className="w-full accent-red-500 cursor-pointer"
                          />
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={state.replicas}
                            onChange={(e) => updateState((s) => ({ ...s, replicas: Math.max(1, Number(e.target.value)) }))}
                            className="w-16 px-2 py-1 rounded border bg-slate-900 text-center font-mono text-xs border-slate-700"
                          />
                        </div>
                      </div>
                    )}

                    {/* CronJob Schedule Configuration */}
                    {state.kind === 'CronJob' && (
                      <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800 space-y-3">
                        <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                          <Clock size={14} />
                          <span>Cron Schedule Configuration</span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-300">Cron Expression (Minute Hour Dom Month Dow)</label>
                          <input
                            type="text"
                            value={state.cronSchedule}
                            onChange={(e) => updateState((s) => ({ ...s, cronSchedule: e.target.value }))}
                            placeholder="0 0 * * *"
                            className="w-full px-3 py-1.5 rounded border bg-slate-950 font-mono text-xs text-amber-300 border-slate-700"
                          />
                        </div>

                        {/* Quick Presets */}
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {[
                            { label: 'Hourly', expr: '0 * * * *' },
                            { label: 'Daily at 02:00', expr: '0 2 * * *' },
                            { label: 'Every 15 min', expr: '*/15 * * * *' },
                            { label: 'Weekly Sun', expr: '0 0 * * 0' },
                          ].map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => updateState((s) => ({ ...s, cronSchedule: p.expr }))}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-mono"
                            >
                              {p.label} ({p.expr})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* App Labels */}
                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-semibold text-slate-300">Pod Match Labels</label>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(state.labels).map(([k, v]) => (
                          <span
                            key={k}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[11px] flex items-center gap-1.5 font-mono"
                          >
                            <span>{k}={v}</span>
                            <button
                              onClick={() =>
                                updateState((s) => {
                                  const next = { ...s.labels };
                                  delete next[k];
                                  return { ...s, labels: next };
                                })
                              }
                              className="text-slate-400 hover:text-rose-400"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newLabelKey}
                          onChange={(e) => setNewLabelKey(e.target.value)}
                          placeholder="label key (e.g. tier)"
                          className="px-2.5 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700 flex-1"
                        />
                        <span className="text-slate-500">=</span>
                        <input
                          type="text"
                          value={newLabelVal}
                          onChange={(e) => setNewLabelVal(e.target.value)}
                          placeholder="label value (e.g. backend)"
                          className="px-2.5 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700 flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newLabelKey.trim()) {
                              updateState((s) => ({
                                ...s,
                                labels: { ...s.labels, [newLabelKey.trim()]: newLabelVal.trim() },
                              }));
                              setNewLabelKey('');
                              setNewLabelVal('');
                            }
                          }}
                          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700"
                        >
                          Add Label
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: CONTAINER IMAGE & IMAGESTREAM AUTOCOMPLETION */}
                {activeTab === 'image' && (
                  <div className="space-y-4 max-w-3xl">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <Box size={16} className="text-cyan-400" />
                        <span>Container Image & OpenShift ImageStream</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Specify image repository reference or pick from local OpenShift ImageStreams in project {state.namespace}.
                      </p>
                    </div>

                    {/* Container Image Input with ImageStream Autocompletion */}
                    <div className="space-y-2 relative">
                      <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span>Container Image *</span>
                        {openshiftStreamTags.length + projectStreamTags.length > 0 && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            {openshiftStreamTags.length + projectStreamTags.length} ImageStream Tag(s) available
                          </span>
                        )}
                      </label>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={state.image}
                          onChange={(e) => updateState((s) => ({ ...s, image: e.target.value }))}
                          placeholder="e.g. image-registry.openshift-image-registry.svc:5000/ns/app:latest or nginx:alpine"
                          className="w-full px-3 py-2 rounded-lg border bg-slate-900 text-cyan-300 text-xs font-mono border-slate-700 focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => setImageDropdownOpen(!imageDropdownOpen)}
                          className="px-3 py-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                          title="Open ImageStream Autocompletion List"
                        >
                          <Tag size={13} />
                          <span>ImageStreams</span>
                        </button>
                      </div>

                      {/* ImageStream Dropdown Suggestions */}
                      {imageDropdownOpen && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 p-2.5 rounded-xl border bg-slate-900 border-slate-700 shadow-2xl space-y-3 max-h-96 overflow-y-auto">
                          {/* Search / Filter Input */}
                          <div className="sticky top-0 bg-slate-900 pb-1 z-10">
                            <input
                              type="text"
                              value={imageStreamFilter}
                              onChange={(e) => setImageStreamFilter(e.target.value)}
                              placeholder="Filter ImageStreams (e.g. dotnet, nodejs, python, postgres)..."
                              className="w-full px-2.5 py-1.5 rounded-lg border bg-slate-950 text-slate-100 text-xs font-mono border-slate-700 focus:border-cyan-500 outline-none"
                              autoFocus
                            />
                          </div>

                          {/* 1. Project: openshift */}
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono px-2 mb-1 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Globe size={11} className="text-red-400" />
                                <span>Project: openshift</span>
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-950/80 text-red-300 border border-red-800">
                                {openshiftStreamTags.length} tags
                              </span>
                            </div>
                            {openshiftStreamTags.length === 0 ? (
                              <div className="p-2 text-center text-xs text-slate-500 font-mono">
                                Loading openshift ImageStreams...
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {openshiftStreamTags
                                  .filter((t) => {
                                    if (!imageStreamFilter.trim()) return true;
                                    const q = imageStreamFilter.toLowerCase();
                                    return t.isName.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q);
                                  })
                                  .map((t) => (
                                    <button
                                      key={`openshift-${t.isName}-${t.tag}`}
                                      type="button"
                                      onClick={() => {
                                        updateState((s) => ({
                                          ...s,
                                          image: t.fullRef,
                                        }));
                                        setImageDropdownOpen(false);
                                        setImageStreamFilter('');
                                      }}
                                      className="w-full text-left p-1.5 px-2 rounded-lg hover:bg-red-950/40 text-xs font-mono flex items-center justify-between text-slate-200 border border-transparent hover:border-red-800/50 transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-red-300">{t.isName}:{t.tag}</span>
                                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-[280px]">openshift/{t.isName}:{t.tag}</span>
                                      </div>
                                      <span className="text-[9px] text-red-300 px-1.5 py-0.2 rounded bg-red-950/80 border border-red-800/80">openshift</span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>

                          {/* 2. Project-Local ImageStreams */}
                          {state.namespace !== 'openshift' && (
                            <div className="border-t border-slate-800 pt-2">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono px-2 mb-1 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <Tag size={11} className="text-cyan-400" />
                                  <span>Project ImageStreams ({state.namespace})</span>
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                                  {projectStreamTags.length} tags
                                </span>
                              </div>
                              {projectStreamTags.length === 0 ? (
                                <div className="p-2 text-center text-xs text-slate-500 font-mono">
                                  No local ImageStreams found in {state.namespace}.
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {projectStreamTags
                                    .filter((t) => {
                                      if (!imageStreamFilter.trim()) return true;
                                      const q = imageStreamFilter.toLowerCase();
                                      return t.isName.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q);
                                    })
                                    .map((t) => (
                                      <button
                                        key={`proj-${t.isName}-${t.tag}`}
                                        type="button"
                                        onClick={() => {
                                          updateState((s) => ({
                                            ...s,
                                            image: `${t.isName}:${t.tag}`,
                                          }));
                                          setImageDropdownOpen(false);
                                          setImageStreamFilter('');
                                        }}
                                        className="w-full text-left p-1.5 px-2 rounded-lg hover:bg-cyan-950/60 text-xs font-mono flex items-center justify-between text-slate-200 border border-transparent hover:border-cyan-800/60 transition-colors"
                                      >
                                        <span className="font-bold text-cyan-300">{t.isName}:{t.tag}</span>
                                        <span className="text-[10px] text-purple-300 px-1.5 py-0.2 rounded bg-purple-950/80">Project IS</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 3. Popular Registry Starter Images */}
                          <div className="border-t border-slate-800 pt-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono px-2 mb-1">
                              Popular Container Registries
                            </div>
                            <div className="space-y-0.5">
                              {[
                                { name: 'nginx:alpine', desc: 'Nginx Web Server (Alpine)' },
                                { name: 'node:20-alpine', desc: 'Node.js 20 LTS Runtime' },
                                { name: 'python:3.11-slim', desc: 'Python 3.11 Runtime' },
                                { name: 'registry.access.redhat.com/ubi9/openjdk-17:latest', desc: 'Red Hat UBI OpenJDK 17' },
                                { name: 'postgres:16-alpine', desc: 'PostgreSQL 16 Database' },
                                { name: 'redis:alpine', desc: 'Redis Cache Server' },
                              ].map((img) => (
                                <button
                                  key={img.name}
                                  type="button"
                                  onClick={() => {
                                    updateState((s) => ({ ...s, image: img.name }));
                                    setImageDropdownOpen(false);
                                  }}
                                  className="w-full text-left p-1 px-2 rounded hover:bg-slate-800 text-xs font-mono flex items-center justify-between text-slate-300 transition-colors"
                                >
                                  <span className="text-slate-200">{img.name}</span>
                                  <span className="text-[10px] text-slate-500">{img.desc}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Image Pull Policy */}
                    <div className="space-y-1.5 pt-2">
                      <label className="text-xs font-semibold text-slate-300">Image Pull Policy</label>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        {(['IfNotPresent', 'Always', 'Never'] as const).map((pol) => (
                          <label key={pol} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="pullPolicy"
                              checked={state.imagePullPolicy === pol}
                              onChange={() => updateState((s) => ({ ...s, imagePullPolicy: pol }))}
                              className="accent-cyan-500"
                            />
                            <span>{pol}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Command & Args Overrides */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Command (optional)</label>
                        <input
                          type="text"
                          value={state.command}
                          onChange={(e) => updateState((s) => ({ ...s, command: e.target.value }))}
                          placeholder="e.g. /bin/sh or npm, start"
                          className="w-full px-3 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Args (optional, comma-separated)</label>
                        <input
                          type="text"
                          value={state.args}
                          onChange={(e) => updateState((s) => ({ ...s, args: e.target.value }))}
                          placeholder="e.g. -c, echo Hello"
                          className="w-full px-3 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: NETWORKING & EXPOSURE */}
                {activeTab === 'network' && (
                  <div className="space-y-4 max-w-3xl">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <Network size={16} className="text-emerald-400" />
                        <span>Networking, Service & OpenShift Route Exposure</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Automatically generate ClusterIP Service and OpenShift Edge Route for public/internal access.
                      </p>
                    </div>

                    {/* Port & Protocol */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Container Port</label>
                        <input
                          type="number"
                          value={state.containerPort}
                          onChange={(e) =>
                            updateState((s) => ({
                              ...s,
                              containerPort: Number(e.target.value),
                              servicePort: Number(e.target.value),
                              livenessPort: Number(e.target.value),
                              readinessPort: Number(e.target.value),
                            }))
                          }
                          placeholder="8080"
                          className="w-full px-3 py-1.5 rounded border bg-slate-900 text-emerald-300 font-mono text-xs border-slate-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Service Port</label>
                        <input
                          type="number"
                          value={state.servicePort}
                          onChange={(e) => updateState((s) => ({ ...s, servicePort: Number(e.target.value) }))}
                          placeholder="8080"
                          className="w-full px-3 py-1.5 rounded border bg-slate-900 text-emerald-300 font-mono text-xs border-slate-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-300">Protocol</label>
                        <select
                          value={state.protocol}
                          onChange={(e) => updateState((s) => ({ ...s, protocol: e.target.value as any }))}
                          className="w-full px-3 py-1.5 rounded border bg-slate-900 text-slate-200 font-mono text-xs border-slate-700"
                        >
                          <option value="TCP">TCP</option>
                          <option value="UDP">UDP</option>
                        </select>
                      </div>
                    </div>

                    {/* Expose Checkboxes */}
                    <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800 space-y-4 pt-4">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.createService}
                          onChange={(e) => updateState((s) => ({ ...s, createService: e.target.checked }))}
                          className="accent-emerald-500 w-4 h-4"
                        />
                        <div>
                          <div className="text-xs font-bold text-emerald-300">Create ClusterIP Service</div>
                          <div className="text-[11px] text-slate-400">
                            Exposes the pods on an internal DNS name <code className="text-slate-300">{state.name}.{state.namespace}.svc</code>
                          </div>
                        </div>
                      </label>

                      {state.createService && (
                        <div className="pl-6 border-l-2 border-slate-800 space-y-3">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.createRoute}
                              onChange={(e) => updateState((s) => ({ ...s, createRoute: e.target.checked }))}
                              className="accent-red-500 w-4 h-4"
                            />
                            <div>
                              <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                                <span>Create OpenShift Route (Ingress)</span>
                                <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-800 text-[9px] font-mono">
                                  OpenShift
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Publishes public HTTP/HTTPS URL on OpenShift Router.
                              </div>
                            </div>
                          </label>

                          {state.createRoute && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                              <div className="space-y-1">
                                <label className="text-[11px] text-slate-300">TLS Termination Mode</label>
                                <select
                                  value={state.routeTls}
                                  onChange={(e) => updateState((s) => ({ ...s, routeTls: e.target.value as any }))}
                                  className="w-full px-2.5 py-1.5 rounded border bg-slate-950 font-mono text-xs border-slate-700"
                                >
                                  <option value="edge">Edge (Cluster SSL Termination - Recommended)</option>
                                  <option value="reencrypt">Re-encrypt (End-to-End SSL with CA)</option>
                                  <option value="passthrough">Passthrough (Direct Container SSL)</option>
                                  <option value="none">None (Plain Insecure HTTP)</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[11px] text-slate-300">Custom Hostname (optional)</label>
                                <input
                                  type="text"
                                  value={state.routeHostname}
                                  onChange={(e) => updateState((s) => ({ ...s, routeHostname: e.target.value }))}
                                  placeholder="app.example.com (auto-assigned if blank)"
                                  className="w-full px-2.5 py-1.5 rounded border bg-slate-950 font-mono text-xs border-slate-700"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 4: ENVIRONMENT VARIABLES */}
                {activeTab === 'env' && (
                  <div className="space-y-4 max-w-3xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <Key size={16} className="text-amber-400" />
                          <span>Environment Variables</span>
                        </h3>
                        <p className="text-xs text-slate-400">Inject application configurations and runtime flags.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateState((s) => ({
                            ...s,
                            envVars: [...s.envVars, { id: String(Date.now()), name: '', value: '' }],
                          }))
                        }
                        className="px-3 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 text-xs font-semibold flex items-center gap-1"
                      >
                        <Plus size={13} />
                        <span>Add Variable</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {state.envVars.length === 0 ? (
                        <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500 font-mono">
                          No environment variables added.
                        </div>
                      ) : (
                        state.envVars.map((env, idx) => (
                          <div key={env.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={env.name}
                              onChange={(e) =>
                                updateState((s) => {
                                  const next = [...s.envVars];
                                  next[idx].name = e.target.value;
                                  return { ...s, envVars: next };
                                })
                              }
                              placeholder="VARIABLE_NAME"
                              className="w-1/3 px-3 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700 text-amber-300"
                            />
                            <span className="text-slate-500">=</span>
                            <input
                              type="text"
                              value={env.value}
                              onChange={(e) =>
                                updateState((s) => {
                                  const next = [...s.envVars];
                                  next[idx].value = e.target.value;
                                  return { ...s, envVars: next };
                                })
                              }
                              placeholder="variable_value"
                              className="flex-1 px-3 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700 text-slate-200"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateState((s) => ({
                                  ...s,
                                  envVars: s.envVars.filter((_, i) => i !== idx),
                                }))
                              }
                              className="p-1.5 rounded text-slate-500 hover:text-rose-400"
                              title="Remove variable"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 5: RESOURCES & HEALTH PROBES */}
                {activeTab === 'resources' && (
                  <div className="space-y-5 max-w-3xl">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <Cpu size={16} className="text-purple-400" />
                        <span>Compute Resources & Health Probes</span>
                      </h3>
                      <p className="text-xs text-slate-400">Configure CPU/Memory allocations and Kubernetes container probes.</p>
                    </div>

                    {/* Quick Compute Presets */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Resource Presets:</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: 'Micro', cpuReq: '50m', cpuLim: '200m', memReq: '64Mi', memLim: '128Mi' },
                          { label: 'Small', cpuReq: '100m', cpuLim: '500m', memReq: '128Mi', memLim: '512Mi' },
                          { label: 'Medium', cpuReq: '250m', cpuLim: '1000m', memReq: '512Mi', memLim: '1Gi' },
                          { label: 'Large', cpuReq: '500m', cpuLim: '2000m', memReq: '1Gi', memLim: '4Gi' },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() =>
                              updateState((s) => ({
                                ...s,
                                cpuRequest: p.cpuReq,
                                cpuLimit: p.cpuLim,
                                memoryRequest: p.memReq,
                                memoryLimit: p.memLim,
                              }))
                            }
                            className="p-2 rounded-lg border bg-slate-900 border-slate-800 hover:border-purple-500/60 text-left text-xs font-mono space-y-0.5"
                          >
                            <div className="font-bold text-purple-300">{p.label}</div>
                            <div className="text-[10px] text-slate-400">CPU: {p.cpuReq} / {p.cpuLim}</div>
                            <div className="text-[10px] text-slate-400">RAM: {p.memReq} / {p.memLim}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom CPU & Memory Inputs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-300">CPU Request</label>
                        <input
                          type="text"
                          value={state.cpuRequest}
                          onChange={(e) => updateState((s) => ({ ...s, cpuRequest: e.target.value }))}
                          placeholder="100m"
                          className="w-full px-2.5 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-300">CPU Limit</label>
                        <input
                          type="text"
                          value={state.cpuLimit}
                          onChange={(e) => updateState((s) => ({ ...s, cpuLimit: e.target.value }))}
                          placeholder="500m"
                          className="w-full px-2.5 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-300">Memory Request</label>
                        <input
                          type="text"
                          value={state.memoryRequest}
                          onChange={(e) => updateState((s) => ({ ...s, memoryRequest: e.target.value }))}
                          placeholder="128Mi"
                          className="w-full px-2.5 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-300">Memory Limit</label>
                        <input
                          type="text"
                          value={state.memoryLimit}
                          onChange={(e) => updateState((s) => ({ ...s, memoryLimit: e.target.value }))}
                          placeholder="512Mi"
                          className="w-full px-2.5 py-1.5 rounded border bg-slate-900 text-xs font-mono border-slate-700"
                        />
                      </div>
                    </div>

                    {/* Probes */}
                    <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800 space-y-4 pt-3">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.enableLivenessProbe}
                          onChange={(e) => updateState((s) => ({ ...s, enableLivenessProbe: e.target.checked }))}
                          className="accent-purple-500 w-4 h-4"
                        />
                        <span className="text-xs font-bold text-purple-300">Enable Liveness Probe (HTTP Health Check)</span>
                      </label>
                      {state.enableLivenessProbe && (
                        <div className="grid grid-cols-2 gap-3 pl-6">
                          <input
                            type="text"
                            value={state.livenessPath}
                            onChange={(e) => updateState((s) => ({ ...s, livenessPath: e.target.value }))}
                            placeholder="/healthz"
                            className="px-2.5 py-1.5 rounded border bg-slate-950 text-xs font-mono border-slate-700"
                          />
                          <input
                            type="number"
                            value={state.livenessPort}
                            onChange={(e) => updateState((s) => ({ ...s, livenessPort: Number(e.target.value) }))}
                            placeholder="Port e.g. 8080"
                            className="px-2.5 py-1.5 rounded border bg-slate-950 text-xs font-mono border-slate-700"
                          />
                        </div>
                      )}

                      <label className="flex items-center gap-2.5 cursor-pointer pt-2">
                        <input
                          type="checkbox"
                          checked={state.enableReadinessProbe}
                          onChange={(e) => updateState((s) => ({ ...s, enableReadinessProbe: e.target.checked }))}
                          className="accent-purple-500 w-4 h-4"
                        />
                        <span className="text-xs font-bold text-purple-300">Enable Readiness Probe (Traffic Routing Check)</span>
                      </label>
                      {state.enableReadinessProbe && (
                        <div className="grid grid-cols-2 gap-3 pl-6">
                          <input
                            type="text"
                            value={state.readinessPath}
                            onChange={(e) => updateState((s) => ({ ...s, readinessPath: e.target.value }))}
                            placeholder="/ready"
                            className="px-2.5 py-1.5 rounded border bg-slate-950 text-xs font-mono border-slate-700"
                          />
                          <input
                            type="number"
                            value={state.readinessPort}
                            onChange={(e) => updateState((s) => ({ ...s, readinessPort: Number(e.target.value) }))}
                            placeholder="Port e.g. 8080"
                            className="px-2.5 py-1.5 rounded border bg-slate-950 text-xs font-mono border-slate-700"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 6: STORAGE & PERSISTENT VOLUMES */}
                {activeTab === 'storage' && (
                  <div className="space-y-4 max-w-3xl">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <HardDrive size={16} className="text-cyan-400" />
                        <span>Persistent Storage & Volume Mounts</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Mount persistent disk volumes (PVC) for databases, media uploads, or file state.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border bg-slate-900/60 border-slate-800 space-y-4">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.enablePvc}
                          onChange={(e) => updateState((s) => ({ ...s, enablePvc: e.target.checked }))}
                          className="accent-cyan-500 w-4 h-4"
                        />
                        <span className="text-xs font-bold text-cyan-300">Mount Persistent Volume Claim (PVC)</span>
                      </label>

                      {state.enablePvc && (
                        <div className="space-y-3 pl-6 border-l-2 border-slate-800 pt-1">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-300">Mount Path inside Container *</label>
                            <input
                              type="text"
                              value={state.pvcMountPath}
                              onChange={(e) => updateState((s) => ({ ...s, pvcMountPath: e.target.value }))}
                              placeholder="/data or /var/lib/postgresql/data"
                              className="w-full px-3 py-1.5 rounded border bg-slate-950 text-xs font-mono border-slate-700 text-cyan-300"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-300">Disk Size</label>
                              <input
                                type="text"
                                value={state.pvcSize}
                                onChange={(e) => updateState((s) => ({ ...s, pvcSize: e.target.value }))}
                                placeholder="10Gi"
                                className="w-full px-3 py-1.5 rounded border bg-slate-950 text-xs font-mono border-slate-700 text-cyan-300"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-300">Storage Class (optional)</label>
                              <input
                                type="text"
                                value={state.pvcStorageClass}
                                onChange={(e) => updateState((s) => ({ ...s, pvcStorageClass: e.target.value }))}
                                placeholder="default"
                                className="w-full px-3 py-1.5 rounded border bg-slate-950 text-xs font-mono border-slate-700"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RIGHT: CODEMIRROR LIVE SYNCHRONIZED YAML EDITOR */}
          {(viewMode === 'yaml' || viewMode === 'split') && (
            <div
              className={`flex flex-col min-h-0 ${
                viewMode === 'split' ? 'w-[480px] xl:w-[580px]' : 'flex-1'
              }`}
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
              }}
            >
              <div
                className="p-2.5 border-b flex items-center justify-between text-xs font-mono"
                style={{
                  backgroundColor: 'var(--bg-card-header, #0f172a)',
                  borderColor: 'var(--border-color, #334155)',
                }}
              >
                <div className="flex items-center gap-2">
                  <FileCode2 size={14} className="text-emerald-400" />
                  <span className="font-bold">Live Generated OpenShift / Kubernetes YAML</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">● Auto-Generated</span>
              </div>

              <div className="flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
                <CodeMirror
                  value={yamlCode}
                  height="100%"
                  className="h-full flex-1 w-full"
                  theme={cmTheme}
                  extensions={[yaml()]}
                  onChange={(val) => setYamlCode(val)}
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    syntaxHighlighting: true,
                    bracketMatching: true,
                    foldGutter: true,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Single Deploy Button */}
        <div
          className="p-3 border-t flex items-center justify-between text-[11px] shrink-0"
          style={{
            backgroundColor: 'var(--bg-card-header, #0f172a)',
            borderColor: 'var(--border-color, #334155)',
            color: 'var(--text-muted, #94a3b8)',
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              Targeting Project: <strong className="font-mono text-purple-300">{state.namespace}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-input, #0f172a)',
                borderColor: 'var(--border-subtle, #334155)',
                color: 'var(--text-main, #f8fafc)',
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              disabled={saving || !state.name.trim()}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-red-950/60 disabled:opacity-40 cursor-pointer transition-all"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Rocket size={13} />}
              <span>Deploy Workload to Cluster</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
