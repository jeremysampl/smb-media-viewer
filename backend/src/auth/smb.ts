import { spawn } from 'node:child_process';
import { config } from '../config.js';

export async function validateSambaCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (config.localDev && config.smbHost === 'localhost') {
    console.warn('[LOCAL_DEV] Skipping Samba auth; any username/password accepted');
    return Boolean(username && password);
  }

  return new Promise((resolve) => {
    const args = [
      '-L',
      `//${config.smbHost}`,
      '-U',
      `${username}%${password}`,
    ];

    const child = spawn('smbclient', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error('smbclient not found. Install samba-client in the container.');
      }
      resolve(false);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }
      if (stderr.toLowerCase().includes('nt_status_logon_failure')) {
        resolve(false);
        return;
      }
      resolve(code === 0);
    });
  });
}
