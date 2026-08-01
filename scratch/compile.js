const ts = require('typescript');
const fs = require('fs');
const path = require('path');

function compile() {
  const configPath = ts.findConfigFile(
    '/home/ibadat/Downloads/lms_system/evershine_lms',
    ts.sys.fileExists,
    'tsconfig.json'
  );
  if (!configPath) {
    fs.writeFileSync('/home/ibadat/Downloads/lms_system/evershine_lms/scratch/compile_errors.txt', 'Could not find a valid tsconfig.json.');
    return;
  }

  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    fs.writeFileSync('/home/ibadat/Downloads/lms_system/evershine_lms/scratch/compile_errors.txt', ts.formatDiagnostics([readResult.error], ts.createCompilerHost({})));
    return;
  }

  const parsedCommandLine = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    path.dirname(configPath)
  );

  const host = ts.createCompilerHost(parsedCommandLine.options);
  const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options, host);
  const emitResult = program.emit();

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  let output = '';
  allDiagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
      const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      output += `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}\n`;
    } else {
      output += `${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}\n`;
    }
  });

  if (output === '') {
    output = 'No compile errors found.';
  }

  fs.writeFileSync('/home/ibadat/Downloads/lms_system/evershine_lms/scratch/compile_errors.txt', output);
}

compile();
