import {createHandler} from './handler.js';
Deno.serve(createHandler(name=>Deno.env.get(name)));
