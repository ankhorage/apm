import metadata from '../../package.json' with { type: 'json' };
import { createCliProvider } from './createCliProvider.js';

export default createCliProvider(metadata.version);
