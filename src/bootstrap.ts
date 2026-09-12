// src/bootstrap.ts
//
// MUST be imported at the very top of server.ts, before any other module
// that imports a Mongoose model. Registers global plugins that affect
// every schema defined afterwards.
import mongoose from 'mongoose';
import { toJSONPlugin } from './models/plugins';

mongoose.plugin(toJSONPlugin);
