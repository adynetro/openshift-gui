import { Command } from 'commander';
import { ResourceKind } from './types/k8s.js';

export interface CliOptions {
  namespace?: string;
  context?: string;
  kind?: ResourceKind;
  cleanIs?: string;
  keep?: string;
}

export function parseCliArgs(argv: string[]): { options: CliOptions } {
  const program = new Command();

  program
    .name('openshift-gui')
    .description('Interactive Modern Terminal UI for OpenShift & Kubernetes CLI with Helm & ImageStream SemVer Cleanup')
    .version('0.1.0')
    .option('-n, --namespace <namespace>', 'Specific namespace or project to open')
    .option('-c, --context <context>', 'Kubeconfig context to activate on start')
    .option('-k, --kind <kind>', 'Initial resource view (pods, deployments, routes, imagestreams, helm, etc.)', 'pods')
    .option('--clean-is <imagestream>', 'Direct CLI mode to inspect & clean semver tags for an ImageStream')
    .option('--keep <count>', 'Number of latest semver tags to keep in CLI clean mode', '3');

  program.parse(argv);

  const options = program.opts<CliOptions>();

  return { options };
}
