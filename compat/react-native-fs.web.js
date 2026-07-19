const unsupported = operation => async () => {
  throw new Error(`react-native-fs ${operation} is unavailable in the browser`);
};

export const DocumentDirectoryPath = undefined;
export const TemporaryDirectoryPath = undefined;
export const CachesDirectoryPath = undefined;
export const ExternalDirectoryPath = undefined;

export const stat = unsupported('stat');
export const exists = unsupported('exists');
export const readFile = unsupported('readFile');
export const writeFile = unsupported('writeFile');
export const appendFile = unsupported('appendFile');
export const unlink = unsupported('unlink');
export const mkdir = unsupported('mkdir');
export const copyFile = unsupported('copyFile');
export const moveFile = unsupported('moveFile');
export const readDir = unsupported('readDir');

export default {
  DocumentDirectoryPath,
  TemporaryDirectoryPath,
  CachesDirectoryPath,
  ExternalDirectoryPath,
  stat,
  exists,
  readFile,
  writeFile,
  appendFile,
  unlink,
  mkdir,
  copyFile,
  moveFile,
  readDir,
};
