import { copyFileSync, mkdirSync } from 'fs';

const sourceConfigFolder = 'public';
const targetConfigFolder = 'public';
const glueId = 'glue.id.json';

// Ensure target directory exists
try {
  mkdirSync(targetConfigFolder, { recursive: true });
} catch (err) {
  // Directory may already exist
}

// Copy glue channel configuration
copyFileSync(`${sourceConfigFolder}/${glueId}`, `${targetConfigFolder}/${glueId}`);
console.log(`Copied ${sourceConfigFolder}/${glueId} to ${targetConfigFolder}/${glueId}`); 