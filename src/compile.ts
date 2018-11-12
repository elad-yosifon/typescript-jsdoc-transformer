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

function typeToString(type: ts.TypeNode) {
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return type.typeName.escapedText;
  } else {
    return kindToString(type.kind);
  }
}

function jsDocReturns(child: ts.Node): string | null {
  if (ts.isMethodSignature(child) || ts.isConstructSignatureDeclaration(child)) {
    if (child.type.kind == ts.SyntaxKind.VoidKeyword) {
    } else if (ts.isUnionTypeNode(child) || ts.isIntersectionTypeNode(child)) {
      return `@return {${child.types.map(typeToString).join(ts.isUnionTypeNode(child) ? '|' : '&')}}`;
    } else {
      return `@return {${typeToString(child.type)}}`;
    }
  }
  return null
}

function jsDocFunctionParameters(node: ts.Node): string[] {
  const jsdocLines = [];
  if (!(ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) &&
    (ts.isMethodSignature(node) || ts.isConstructSignatureDeclaration(node) || ts.isFunctionDeclaration(node))) {
    if(node.parameters) {
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name)) {
          if (ts.isTypeNode(param.type)) {
            jsdocLines.push(`@param {${typeToString(param.type)}} ${param.name.escapedText}`)
          } else {
            jsdocLines.push(`@param ${param.name.escapedText}`)
          }
        }
      }
    }
  }
  return jsdocLines
}

function jsDocGenericsTemplate(node: ts.Node): string[] {
  const jsdocLines = [];
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    if (node.typeParameters && node.typeParameters.length > 0) {
      jsdocLines.push('@template ' + (node.typeParameters.map(typedParam => typedParam.name.escapedText).join(', ')))
    }
  }
  return jsdocLines;
}

function generateJsDocLines(node: ts.Node, headers: string[]): string[] {
  return [

    ...headers,

    // @template
    ... jsDocGenericsTemplate(node),

    // @param
    ...jsDocFunctionParameters(node),

    // @returns
    jsDocReturns(node)

  ].filter(str => str);
}

function createMethodDeclaration(child: ts.MethodSignature, fullyQualifiedMethodName) {

  const methodDeclaration = ts.createVariableDeclaration(fullyQualifiedMethodName, N,
    ts.createFunctionExpression(N, N, N, N, child.parameters, N, ts.createBlock(N))
  );

  addJsDoc(methodDeclaration, generateJsDocLines(child, []));
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

  const jsdocLines = generateJsDocLines(node, ['@record']);
  addJsDoc(ifcDeclaration, jsdocLines);
  return [ifcDeclaration, ...interfacePrototypeMethods]
}


function addClassJSDoc(node: ts.ClassDeclaration) {

  const jsdocLines = generateJsDocLines(node, ['@constructor']);
  addJsDoc(node, jsdocLines);
  return node
}

function simpleTransformer<T extends ts.Node>(): ts.TransformerFactory<T> {
  return (context: ts.TransformationContext) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        return addInterfaceJSDoc(node);
      }
      if (ts.isClassDeclaration(node)) {
        return addClassJSDoc(node);
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
