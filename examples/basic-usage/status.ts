import { APM_STATUS_SUPPORT } from '@ankhorage/apm';
import { statusProjectAsync } from '@ankhorage/apm/node';

console.log(APM_STATUS_SUPPORT);
console.log(await statusProjectAsync({ rootPath: process.argv[2] ?? '.' }));
