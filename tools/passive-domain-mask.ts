import ts from 'typescript'

/** Mask only direct string elements of one top-level const Set array; preserve all executable text. */
export function maskDirectArrayString(source: string, constant: string, literal: string): string {
  try {
    const diagnostics = ts.transpileModule(source, { reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).diagnostics
    if (diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) return source
    const file = ts.createSourceFile('classifier.ts', source, ts.ScriptTarget.Latest, true)
    const declarations = file.statements.flatMap(statement => ts.isVariableStatement(statement)
      ? [...statement.declarationList.declarations] : []).filter(d => ts.isIdentifier(d.name) && d.name.text === constant)
    if (declarations.length !== 1) return source
    const declaration = declarations[0]!, initializer = declaration.initializer
    if (!(declaration.parent.flags & ts.NodeFlags.Const) || !initializer || !ts.isNewExpression(initializer) ||
      !ts.isIdentifier(initializer.expression) || initializer.expression.text !== 'Set' || initializer.arguments?.length !== 1 ||
      !ts.isArrayLiteralExpression(initializer.arguments[0]!)) return source
    const elements = initializer.arguments[0].elements.filter(e => ts.isStringLiteral(e) && e.text === literal)
    for (const element of [...elements].reverse()) source = source.slice(0, element.getStart(file)) + "''" + source.slice(element.end)
    return source
  } catch { return source }
}
