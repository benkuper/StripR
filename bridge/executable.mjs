import {runCli} from './server.mjs';

runCli().catch(e=>{
  process.stderr.write(e.message+'\n');
  process.exitCode=1;
});
