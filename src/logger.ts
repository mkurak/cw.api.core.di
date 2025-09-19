import {
    createColoredConsole,
    type ColoredConsole,
    type ColoredConsoleOptions
} from 'cw.helper.colored.console';

const DEFAULT_LOGGER_OPTIONS: ColoredConsoleOptions = {
    name: 'cw-di',
    theme: {
        info: { color: 'cyan' },
        success: { color: 'green' },
        warn: { color: 'yellow', bold: true },
        error: { color: 'red', bold: true },
        debug: { color: 'magenta', dim: true }
    }
};

const logger: ColoredConsole = createColoredConsole(DEFAULT_LOGGER_OPTIONS);

export { logger };
