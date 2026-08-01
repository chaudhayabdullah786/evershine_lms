const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('git status', { cwd: '/home/ibadat/Downloads/lms_system/evershine_lms', encoding: 'utf8' });
  fs.writeFileSync('/home/ibadat/Downloads/lms_system/evershine_lms/scratch/git_output.txt', output);
} catch (error) {
  fs.writeFileSync('/home/ibadat/Downloads/lms_system/evershine_lms/scratch/git_output.txt', error.stdout + '\n' + error.stderr + '\n' + error.message);
}
