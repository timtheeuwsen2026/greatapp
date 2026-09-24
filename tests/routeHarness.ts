import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const source = ts.createSourceFile('routes.ts', readFileSync('server/routes.ts', 'utf8'), ts.ScriptTarget.Latest, true);
export function routeFunction(name: string, dependencies: Record<string, any>, method?: string) {
  dependencies = { require: createRequire(import.meta.url), ...dependencies };
  let target: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (!method && ts.isFunctionDeclaration(node) && node.name?.text === name) target = node;
    if (method && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === 'app' && node.expression.name.text === method
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === name) target = node.arguments.at(-1);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!target) throw new Error(`Missing route/function: ${name}`);
  const js = ts.transpileModule(`const run = ${target.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${js}; return run;`)(...Object.values(dependencies));
}
export function routeResponse() {
  return { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; }, cookie() {} };
}
