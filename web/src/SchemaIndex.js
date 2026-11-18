/**
 * @file SchemaIndex.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// SchemaIndex
// ----------------------------------------------------------------------------

// NOTE: an index of the global constructs in one release's schema set,
// built in the browser from the XSD files in its package: each global
// element, complex type, group and attribute group, with its documentation,
// its content model as indented text, where it is allowed, its source lines,
// and a canonical form used to compare releases.
export class SchemaIndex {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static variables
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  static XSD_NAMESPACE = 'http://www.w3.org/2001/XMLSchema';
  static KINDS = ['element', 'complexType', 'simpleType', 'group', 'attributeGroup'];

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Private instance properties
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #childrenMap = null;

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Constructor
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  constructor () {
    this.constructs = new Map();
    this.targetNamespace = null;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Static properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // NOTE: schemaFiles is [{ path, text }]. Only files whose targetNamespace
  // is the entry schema's are indexed; imported schemas (MathML, XHTML,
  // Dublin Core) are left out of the construct list.
  static fromSchemaFiles (
    schemaFiles,
    entrySchemaPath
  ) {
    const index = new SchemaIndex();
    const parser = new DOMParser();
    const documents = schemaFiles.map((file) => ({ ...file, document: parser.parseFromString(file.text, 'application/xml') }));
    const entry = documents.find((file) => file.path === entrySchemaPath) ?? documents[0];
    index.targetNamespace = entry?.document.documentElement.getAttribute('targetNamespace') ?? null;
    for (const file of documents) {
      if (file.document.documentElement.getAttribute('targetNamespace') !== index.targetNamespace) {
        continue;
      }
      index.#indexFile(file);
    }
    index.#findParents();
    return index;
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #indexFile (
    file
  ) {
    const serializer = new XMLSerializer();
    for (const node of file.document.documentElement.children) {
      if (node.namespaceURI !== SchemaIndex.XSD_NAMESPACE || !SchemaIndex.KINDS.includes(node.localName)) {
        continue;
      }
      const name = node.getAttribute('name');
      if (!name) {
        continue;
      }
      const lines = findSourceLines(file.text, node.prefix, node.localName, name);
      this.constructs.set(`${node.localName}:${name}`, {
        kind: node.localName,
        name,
        file: file.path,
        documentation: readDocumentation(node),
        contentModel: describeContentModel(node),
        canonical: serializer.serializeToString(node).replace(/\s+/g, ' '),
        startLine: lines?.startLine ?? null,
        sourceLines: lines?.sourceLines ?? [],
        parents: [],
        node
      });
    }
  }

  // NOTE: a construct's parents are the global constructs that refer to it:
  // for an element, those with <element ref="name">; for a type, those with
  // type="name" or base="name"; for a group, those with <group ref="name">.
  #findParents () {
    for (const construct of this.constructs.values()) {
      const referrals = construct.node.getElementsByTagNameNS(SchemaIndex.XSD_NAMESPACE, '*');
      for (const node of referrals) {
        const targets = [];
        if (node.localName === 'element' && node.getAttribute('ref')) {
          targets.push(`element:${stripPrefix(node.getAttribute('ref'))}`);
        }
        if (node.localName === 'group' && node.getAttribute('ref')) {
          targets.push(`group:${stripPrefix(node.getAttribute('ref'))}`);
        }
        if (node.localName === 'attributeGroup' && node.getAttribute('ref')) {
          targets.push(`attributeGroup:${stripPrefix(node.getAttribute('ref'))}`);
        }
        for (const attributeName of ['type', 'base']) {
          if (node.getAttribute(attributeName)) {
            targets.push(`complexType:${stripPrefix(node.getAttribute(attributeName))}`);
          }
        }
        for (const target of targets) {
          const referred = this.constructs.get(target);
          if (referred && !referred.parents.some((parent) => parent.kind === construct.kind && parent.name === construct.name)) {
            referred.parents.push({ kind: construct.kind, name: construct.name });
          }
        }
      }
    }
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  getConstruct (
    kind,
    name
  ) {
    return this.constructs.get(`${kind}:${name}`) ?? null;
  }

  listConstructs (
    kind = null
  ) {
    return [...this.constructs.values()]
      .filter((construct) => kind === null || construct.kind === kind)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  // NOTE: every global construct that can occur under the given root
  // elements: through element, group and attribute group references, type
  // and base types (complex or simple), and substitution groups.
  findReachable (
    rootElementNames
  ) {
    const children = this.#getChildren();
    const reached = new Set();
    const pending = rootElementNames.map((name) => `element:${name}`).filter((key) => this.constructs.has(key));
    while (pending.length > 0) {
      const key = pending.pop();
      if (reached.has(key)) {
        continue;
      }
      reached.add(key);
      for (const child of children.get(key) ?? []) {
        if (!reached.has(child)) {
          pending.push(child);
        }
      }
    }
    return reached;
  }

  #getChildren () {
    if (this.#childrenMap !== null) {
      return this.#childrenMap;
    }
    const children = new Map();
    const link = (from, to) => {
      if (this.constructs.has(to)) {
        if (!children.has(from)) {
          children.set(from, new Set());
        }
        children.get(from).add(to);
      }
    };
    for (const [key, construct] of this.constructs) {
      const nodes = [construct.node, ...construct.node.getElementsByTagNameNS(SchemaIndex.XSD_NAMESPACE, '*')];
      for (const node of nodes) {
        const ref = node.getAttribute('ref');
        if (ref && ['element', 'group', 'attributeGroup'].includes(node.localName)) {
          link(key, `${node.localName}:${stripPrefix(ref)}`);
        }
        for (const attributeName of ['type', 'base']) {
          const typeName = node.getAttribute(attributeName);
          if (typeName) {
            link(key, `complexType:${stripPrefix(typeName)}`);
            link(key, `simpleType:${stripPrefix(typeName)}`);
          }
        }
      }
      const head = construct.kind === 'element' ? construct.node.getAttribute('substitutionGroup') : null;
      if (head) {
        link(`element:${stripPrefix(head)}`, key);
      }
    }
    this.#childrenMap = children;
    return children;
  }

  // NOTE: compares this release with an earlier one, by construct kind.
  // "Changed" means the definition differs in any way, documentation included.
  compareWith (
    earlierIndex
  ) {
    const result = {};
    for (const kind of SchemaIndex.KINDS) {
      const current = new Map(this.listConstructs(kind).map((construct) => [construct.name, construct]));
      const earlier = new Map(earlierIndex.listConstructs(kind).map((construct) => [construct.name, construct]));
      result[kind] = {
        added: [...current.keys()].filter((name) => !earlier.has(name)),
        removed: [...earlier.keys()].filter((name) => !current.has(name)),
        changed: [...current.keys()].filter((name) => earlier.has(name) && earlier.get(name).canonical !== current.get(name).canonical)
      };
    }
    return result;
  }
}

// ----------------------------------------------------------------------------
// Functions
// ----------------------------------------------------------------------------

function stripPrefix (
  qualifiedName
) {
  return qualifiedName.includes(':') ? qualifiedName.split(':').pop() : qualifiedName;
}

function getChildren (
  node,
  localName = null
) {
  return [...node.children].filter((child) => child.namespaceURI === SchemaIndex.XSD_NAMESPACE &&
    (localName === null || child.localName === localName));
}

function readDocumentation (
  node
) {
  const annotation = getChildren(node, 'annotation')[0];
  const documentation = annotation ? getChildren(annotation, 'documentation')[0] : null;
  return documentation ? documentation.textContent.replace(/\s+/g, ' ').trim() : '';
}

function describeOccurs (
  node
) {
  const min = node.getAttribute('minOccurs') ?? '1';
  const max = node.getAttribute('maxOccurs') ?? '1';
  if (min === '1' && max === '1') {
    return '';
  }
  if (min === '0' && max === '1') {
    return 'optional';
  }
  if (min === '0' && max === 'unbounded') {
    return 'zero or more';
  }
  if (min === '1' && max === 'unbounded') {
    return 'one or more';
  }
  return `${min} to ${max === 'unbounded' ? 'many' : max}`;
}

// NOTE: returns lines of [depth, text, note, link], where link names the
// construct a line refers to ({ kind, name }) so the page can link it.
function describeContentModel (
  rootNode
) {
  const lines = [];
  const visit = (node, depth) => {
    const name = node.localName;
    const occurs = describeOccurs(node);
    if (name === 'annotation') {
      return;
    }
    if (name === 'element') {
      const refName = node.getAttribute('ref');
      if (refName) {
        lines.push([depth, stripPrefix(refName), occurs, { kind: 'element', name: stripPrefix(refName) }]);
        return;
      }
      if (depth === 0) {
        const typeName = node.getAttribute('type');
        if (typeName) {
          lines.push([0, `type ${stripPrefix(typeName)}`, '', { kind: 'complexType', name: stripPrefix(typeName) }]);
        }
        getChildren(node).forEach((child) => visit(child, 0));
        return;
      }
      lines.push([depth, node.getAttribute('name'), [occurs, node.getAttribute('type') ? `type ${stripPrefix(node.getAttribute('type'))}` : ''].filter(Boolean).join(', '), null]);
      return;
    }
    if (name === 'complexType' || name === 'simpleContent' || name === 'complexContent') {
      if (node.getAttribute('mixed') === 'true') {
        lines.push([depth, 'mixed content', '', null]);
      }
      getChildren(node).forEach((child) => visit(child, depth));
      return;
    }
    if (name === 'extension' || name === 'restriction') {
      const base = stripPrefix(node.getAttribute('base') ?? '');
      lines.push([depth, `${name === 'extension' ? 'extends' : 'restricts'} ${base}`, '', { kind: 'complexType', name: base }]);
      getChildren(node).forEach((child) => visit(child, depth));
      return;
    }
    if (name === 'sequence' || name === 'choice' || name === 'all') {
      lines.push([depth, name, occurs, null]);
      getChildren(node).forEach((child) => visit(child, depth + 1));
      return;
    }
    if (name === 'group' || name === 'attributeGroup') {
      const refName = node.getAttribute('ref');
      if (refName) {
        lines.push([depth, `${name} ${stripPrefix(refName)}`, occurs, { kind: name, name: stripPrefix(refName) }]);
        return;
      }
      getChildren(node).forEach((child) => visit(child, depth));
      return;
    }
    if (name === 'any') {
      lines.push([depth, `any element from ${node.getAttribute('namespace') ?? '##any'}`, occurs, null]);
      return;
    }
    if (name === 'attribute') {
      const attributeName = node.getAttribute('name') ?? stripPrefix(node.getAttribute('ref') ?? '');
      lines.push([depth, `@${attributeName}`, node.getAttribute('use') === 'required' ? 'required' : '', null]);
      return;
    }
    if (name === 'anyAttribute') {
      lines.push([depth, `any attribute from ${node.getAttribute('namespace') ?? '##any'}`, '', null]);
    }
  };
  visit(rootNode, 0);
  return lines;
}

// NOTE: finds a global construct's lines in the original file text, so the
// page can show the source with its real line numbers. Nested declarations of
// the same kind are counted so the matching closing tag is found.
function findSourceLines (
  text,
  prefix,
  localName,
  name
) {
  const tagName = prefix ? `${prefix}:${localName}` : localName;
  const startPattern = new RegExp(`<${tagName}\\s[^>]*\\bname="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
  const match = startPattern.exec(text);
  if (match === null) {
    return null;
  }
  const startIndex = match.index;
  const tagPattern = new RegExp(`<(/?)${tagName}\\b[^>]*?(/?)>`, 'g');
  tagPattern.lastIndex = startIndex;
  let depth = 0;
  let endIndex = text.length;
  for (let tag = tagPattern.exec(text); tag !== null; tag = tagPattern.exec(text)) {
    const isClosing = tag[1] === '/';
    const isEmpty = tag[2] === '/';
    if (!isClosing && !isEmpty) {
      depth += 1;
    } else if (isClosing) {
      depth -= 1;
    }
    if (depth === 0) {
      endIndex = tag.index + tag[0].length;
      break;
    }
  }
  const startLine = text.slice(0, startIndex).split('\n').length;
  const lineStart = text.lastIndexOf('\n', startIndex) + 1;
  return { startLine, sourceLines: text.slice(lineStart, endIndex).split('\n') };
}
