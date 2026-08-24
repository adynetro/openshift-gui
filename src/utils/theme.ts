import chalk from 'chalk';
import figures from 'figures';

export const theme = {
  colors: {
    primary: chalk.hex('#ee0000'), // OpenShift Red
    primaryDark: chalk.hex('#aa0000'),
    primaryLight: chalk.hex('#ff4d4d'),
    secondary: chalk.hex('#0066cc'), // Kubernetes Blue
    accent: chalk.hex('#00b4d8'),
    success: chalk.hex('#38b000'),
    warning: chalk.hex('#ffb703'),
    error: chalk.hex('#e63946'),
    info: chalk.hex('#90e0ef'),
    muted: chalk.hex('#6c757d'),
    highlight: chalk.hex('#ffd166'),
    white: chalk.white,
    gray: chalk.gray,
    darkGray: chalk.hex('#343a40'),
    backgroundHeader: chalk.bgHex('#1f242d'),
    backgroundSelected: chalk.bgHex('#2b3a4a'),
    badgeBackground: chalk.bgHex('#212529'),
  },
  icons: {
    pod: '⬢',
    deployment: '⛊',
    service: '⟁',
    route: '🌐',
    imagestream: '📦',
    helm: '⎈',
    configmap: '⚙',
    secret: '🔒',
    node: '🖥',
    check: figures.tick,
    cross: figures.cross,
    bullet: figures.bullet,
    arrowRight: figures.arrowRight,
    arrowLeft: figures.arrowLeft,
    pointer: figures.pointer,
    dot: figures.circleFilled,
    refresh: '↻',
    search: '🔍',
    warning: figures.warning,
    star: figures.star,
  },
};
