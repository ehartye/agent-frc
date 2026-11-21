import path from 'node:path';
import {activeDesignFor} from './active-design.mjs';
import {existsSync,readFileSync} from 'node:fs';

// A project profile applies inside the nearest checkout; ancestor checkouts cannot supply it.
export function projectFrameProfile(file) {
  const boundary=activeDesignFor(file);
  let folder=path.dirname(path.resolve(file));
  while(true){
    const setting=path.join(folder,'cad','frame-profile.json');
    if(existsSync(setting))return JSON.parse(readFileSync(setting,'utf8').replace(/^\uFEFF/,''));
    if(folder===boundary||existsSync(path.join(folder,'.git'))||path.dirname(folder)===folder)return undefined;
    folder=path.dirname(folder);
  }
}
