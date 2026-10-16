import {createAdminUsersHandler} from './handler.js';
Deno.serve(createAdminUsersHandler(name=>Deno.env.get(name)));
