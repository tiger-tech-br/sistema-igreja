import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('Este comando prepara o APK no Windows. Use ./gradlew assembleDebug em outros sistemas.');
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(project, 'android');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
const java = process.env.JAVA_HOME || path.join(process.env.ProgramFiles || 'C:/Program Files', 'Android', 'Android Studio', 'jbr');
await access(path.join(sdk, 'platform-tools', 'adb.exe')).catch(() => { throw new Error('Instale o Android SDK pelo Android Studio e configure ANDROID_HOME.'); });
await access(path.join(java, 'bin', 'java.exe')).catch(() => { throw new Error('Configure JAVA_HOME para o JDK 21 do Android Studio.'); });
await writeFile(path.join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
const environment = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk };
function run(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd, env: environment, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`A geração do APK falhou (${code}).`)));
  });
}
await run('npm run sync:android', project);
await run('gradlew.bat assembleDebug --no-daemon', android);
const artifacts = path.join(project, 'artifacts');
await mkdir(artifacts, { recursive: true });
const output = path.join(artifacts, 'igreja-leitor-debug.apk');
await copyFile(path.join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'), output);
console.log(`APK de testes gerado: ${output}`);
