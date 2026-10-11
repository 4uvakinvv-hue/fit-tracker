import { createCoachHandler } from './handler.js';

Deno.serve(createCoachHandler({ env: (key: string) => Deno.env.get(key) }));
