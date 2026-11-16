import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function isMain(url) {
  if (!process.argv[1]) return false;
  const [entry, module] = await Promise.all([fs.realpath(process.argv[1]), fs.realpath(fileURLToPath(url))]);
  return process.platform === 'win32' ? entry.toLowerCase() === module.toLowerCase() : entry === module;
}
