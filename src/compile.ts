import * as ts from 'typescript'

const N = undefined;

function addJsDoc(node, jsdocLines) {
  ts.addSyntheticLeadingComment(
    node,
    ts.SyntaxKind.MultiLineCommentTrivia,
    `*\n${jsdocLines.map(line => ' * ' + line + '\n').join('')} `,
    true
  );
}

function kindToString(kind: ts.SyntaxKind) {
  switch (kind) {
    case ts.SyntaxKind.UndefinedKeyword:
      return 'undefined';
    case ts.SyntaxKind.NullKeyword:
      return 'null';
    case ts.SyntaxKind.BooleanKeyword:
      return 'boolean';
    case ts.SyntaxKind.NumberKeyword:
      return 'number';
    case ts.SyntaxKind.StringKeyword:
      return 'string';
    case ts.SyntaxKind.FunctionKeyword:
    case ts.SyntaxKind.FunctionType:
      return 'function';
  }
  return ''
}

function typeToString(type:ts.TypeReferenceNode & ts.TypeNode) {
  return type.typeName ? type.typeName.escapedText : kindToString(type.kind);
}

function createMethodDeclaration(child: ts.MethodSignature, fullyQualifiedMethodName) {
  const methodDeclaration = ts.createVariableDeclaration(fullyQualifiedMethodName, N,
    ts.createFunctionExpression(N, N, N, N, child.parameters, N, ts.createBlock(N))
  );
  const jsdocLines = child.parameters
    .map(param => `@param {${typeToString(param.type)}} ${param.name.escapedText}`)
  if (child.type) {
    if (child.type.kind == ts.SyntaxKind.VoidKeyword) {
    } else if (child.type.kind == ts.SyntaxKind.UnionType) {
      jsdocLines.push(`@return {${child.type.types.map(type=>kindToString(type.kind)).join('|')}}`);
    } else if (child.type.kind == ts.SyntaxKind.IntersectionType) {
      jsdocLines.push(`@return {${child.type.types.map(type=>kindToString(type.kind)).join('&')}}`);
    }else{
      jsdocLines.push(`@return {${typeToString(child.type)}}`);
    }
  }
  addJsDoc(methodDeclaration, jsdocLines);
  return methodDeclaration;
}

function addInterfaceJSDoc(node: ts.InterfaceDeclaration) {
  const ifcDeclaration = ts.createFunctionDeclaration(N, N, N, node.name, N, N, N, ts.createBlock(N));
  const interfacePrototypeMethods = [];
  ts.forEachChild(node, child => {
    if (ts.isMethodSignature(child)) {
      const methodDeclaration = createMethodDeclaration(child, `${(child.parent as ts.InterfaceDeclaration).name.escapedText}.prototype.${(child.name as ts.Identifier).escapedText}`);
      interfacePrototypeMethods.push(methodDeclaration)
    }
  })

  const jsdocLines = ['@record'];
  if (node.typeParameters && node.typeParameters.length > 0) {
    jsdocLines.push('@template ' + (node.typeParameters.map(typedParam => typedParam.name.escapedText).join(', ')))
  }
  addJsDoc(ifcDeclaration, jsdocLines);
  return [ifcDeclaration, ...interfacePrototypeMethods]
}

function simpleTransformer<T extends ts.Node>(): ts.TransformerFactory<T> {
  return (context: ts.TransformationContext) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        return addInterfaceJSDoc(node);
      }
      return ts.visitEachChild(node, (child) => visit(child), context)
    };

    return (node) => ts.visitNode(node, visit)
  }
}

let source = `

type Setter = (this: any, v: any) => void
type Getter = (this: any) => any

interface PrototypeObject {

  [key: string]: any,

  __lookupGetter__ (k: string): Getter;

  __lookupSetter__ (k: string): Setter;

  __defineGetter__ (k: string, getter: Getter): void;

  __defineSetter__ (k: string, setter: Setter): void;
}

`

let result = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2017
  },
  transformers: {before: [simpleTransformer()]}
})

console.log(result.outputText)
