import type { ColoredConsole } from 'cw.helper.colored.console';
import { createCwLogger } from 'cw.helper.colored.console/themes/cw';

const logger: ColoredConsole = createCwLogger({ name: 'cw-di' });

export { logger };
