import {runCli} from './server.mjs';

runCli().catch(error=>{
  process.stderr.write(error.message+'\n');
  process.exitCode=1;
});
