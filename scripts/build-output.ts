interface BuildOutput {
  path: string;
  size: number;
}

export function getBundledOutputs(outputs: BuildOutput[]) {
  return {
    indexOutput: outputs.find((output) =>
      normalizeBuildPath(output.path).endsWith('dist/index.js'),
    ),
    binOutput: outputs.find((output) =>
      normalizeBuildPath(output.path).endsWith('dist/cli/cc-safety-net.js'),
    ),
    piOutput: outputs.find((output) =>
      normalizeBuildPath(output.path).endsWith('dist/integrations/pi/index.js'),
    ),
  };
}

export function isPublicDeclarationOutput(path: string): boolean {
  return ['dist/index.d.ts', 'dist/api.d.ts'].includes(normalizeBuildPath(path));
}

function normalizeBuildPath(path: string): string {
  return path.replaceAll('\\', '/');
}
