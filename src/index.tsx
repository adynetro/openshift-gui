import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';
import { parseCliArgs } from './cli.js';
import { KubeConfigService } from './services/kubeconfig.js';
import { ResourceKind } from './types/k8s.js';

export async function main() {
  const { options } = parseCliArgs(process.argv);

  if (options.context) {
    await KubeConfigService.switchContext(options.context);
  }

  const validKinds: ResourceKind[] = [
    'pods',
    'deployments',
    'statefulsets',
    'services',
    'routes',
    'imagestreams',
    'configmaps',
    'secrets',
    'helm',
    'nodes',
  ];

  let initialKind: ResourceKind = 'pods';
  if (options.kind && validKinds.includes(options.kind as ResourceKind)) {
    initialKind = options.kind as ResourceKind;
  }
  if (options.cleanIs) {
    initialKind = 'imagestreams';
  }

  // Clear terminal and enter alternative screen buffer for clean TUI
  process.stdout.write('\x1b[?1049h\x1b[H');

  const { waitUntilExit } = render(
    <App
      initialKind={initialKind}
      initialNamespace={options.namespace}
    />,
    {
      exitOnCtrlC: true,
    }
  );

  await waitUntilExit();

  // Restore screen buffer on exit
  process.stdout.write('\x1b[?1049l');
}

main().catch((err) => {
  // Restore screen buffer if error
  process.stdout.write('\x1b[?1049l');
  console.error('Error starting OpenShift CLI TUI:', err);
  process.exit(1);
});
