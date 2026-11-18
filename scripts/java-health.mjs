import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Probe one explicitly selected JDK. Never mix a PATH runtime with another compiler.
export function parseJavaVersion(output, tool) {
  const pattern = tool === 'java'
    ? /^(?:openjdk|java) version "([^"\r\n]+)"/gm
    : /^javac ([^\s]+)\s*$/gm;
  const matches = [...output.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const version = matches[0][1];
  if (!/^\d+(?:\.\d+)*(?:_\d+)?(?:[-+][A-Za-z0-9.+_-]+)?$/.test(version)) return null;
  const parts = version.split(/[._+-]/);
  const major = Number(parts[0] === '1' ? parts[1] : parts[0]);
  return Number.isSafeInteger(major) && major > 0 ? {version, major} : null;
}

export function inspectJavaEnvironment({jdk, expectedJava, run=spawnSync, platform=process.platform}={}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (typeof jdk !== 'string' || !jdk.trim() || !paths.isAbsolute(jdk)
      || (platform === 'win32' && !/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(jdk))) {
    throw Error('Java preflight requires --jdk with an absolute path to an existing trusted JDK');
  }
  if (typeof expectedJava !== 'string' || !/^[1-9]\d*$/.test(expectedJava) || !Number.isSafeInteger(Number(expectedJava))) {
    throw Error('Java preflight requires --expect-java with the project major version, for example 17');
  }
  const tools = ['java', 'javac'].map(tool => {
    const executable = paths.join(jdk, 'bin', tool + (platform === 'win32' ? '.exe' : ''));
    const row = {tool, executable, version:null, major:null, status:'probe-failed'};
    let child;
    try {
      child = run(executable, ['-version'], {
        encoding:'utf8', timeout:20000, maxBuffer:1024*1024, windowsHide:true, shell:false,
      });
    } catch (error) {
      return {...row, diagnostic:error.code ?? 'probe-exception'};
    }
    if (!child || child.error || child.status !== 0) {
      return {...row, diagnostic:child?.error?.code ?? 'nonzero-exit', exitCode:child?.status ?? null};
    }
    const parsed = parseJavaVersion(`${child.stdout ?? ''}\n${child.stderr ?? ''}`, tool);
    if (!parsed) return {...row, status:'unrecognized-version'};
    return {...row, ...parsed, status:parsed.major === Number(expectedJava) ? 'available' : 'version-mismatch'};
  });
  return {
    jdk:paths.normalize(jdk), expectedMajor:Number(expectedJava), tools,
    ready:tools.every(tool => tool.status === 'available'),
    nextSteps:tools.filter(tool => tool.status !== 'available').map(tool => ({tool:tool.tool, action:
      tool.status === 'version-mismatch' ? 'Select the existing JDK required by the project; do not silently upgrade'
        : tool.status === 'unrecognized-version' ? 'Inspect version output from the selected trusted executable'
          : 'Check the selected JDK executable and diagnostic; a runtime alone does not establish a compiler'})),
  };
}
