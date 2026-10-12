import {createTrainerHandler} from './handler.js';
Deno.serve(createTrainerHandler(name=>Deno.env.get(name)));
